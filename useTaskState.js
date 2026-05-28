import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect, useCallback } from 'react';

const LOCAL_STATE_KEY = '@smarttodo/local-task-state/v1';

/**
 * useTaskState — Core state-management hook for SmartTodo.
 *
 * Responsibilities:
 *  1. Track per-task status (TODO → IN_PROGRESS → COMPLETE)
 *  2. Enforce hard dependencies (a task is "locked" until every task
 *     listed in its `dependencies` array is COMPLETE)
 *  3. Evaluate conditional branches:
 *     • `conditional_skip_if`  — hide/auto-resolve a task when the
 *       condition evaluates to true
 *     • `activation_condition` — show a CONDITIONAL task only when
 *       its condition evaluates to true
 *  4. Manage sub-item checklists (required_physical_assets)
 *  5. Expose helpers consumed by the UI layer
 *
 * @param {Array} seedData – the phase array imported from seed_tasks.json
 */
export default function useTaskState(seedData) {
  // ── Per-task status overrides (keyed by task.id) ───────────────
  const [taskStatuses, setTaskStatuses] = useState(() => {
    const map = {};
    for (const phase of seedData) {
      for (const task of phase.tasks) {
        map[task.id] = task.status; // initialise from seed
      }
    }
    return map;
  });

  // ── Sub-item checklists (keyed by task.id → array of booleans) ─
  const [subItemChecks, setSubItemChecks] = useState({});
  const [taskNotes, setTaskNotes] = useState({});

  // ── Global boolean switches that drive conditional logic ───────
  const [globalState, setGlobalState] = useState({
    galveston_order_signed: false,
  });

  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadLocalState() {
      try {
        const savedState = await AsyncStorage.getItem(LOCAL_STATE_KEY);
        if (!savedState || cancelled) return;

        const parsed = JSON.parse(savedState);
        if (parsed.taskStatuses && typeof parsed.taskStatuses === 'object') {
          setTaskStatuses((current) => ({ ...current, ...parsed.taskStatuses }));
        }
        if (parsed.subItemChecks && typeof parsed.subItemChecks === 'object') {
          setSubItemChecks(parsed.subItemChecks);
        }
        if (parsed.taskNotes && typeof parsed.taskNotes === 'object') {
          setTaskNotes(parsed.taskNotes);
        }
        if (parsed.globalState && typeof parsed.globalState === 'object') {
          setGlobalState((current) => ({ ...current, ...parsed.globalState }));
        }
      } catch (error) {
        console.warn('Unable to load local SmartTodo state', error);
      } finally {
        if (!cancelled) setHasHydrated(true);
      }
    }

    loadLocalState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;

    const nextState = JSON.stringify({
      taskStatuses,
      subItemChecks,
      taskNotes,
      globalState,
    });

    AsyncStorage.setItem(LOCAL_STATE_KEY, nextState).catch((error) => {
      console.warn('Unable to save local SmartTodo state', error);
    });
  }, [hasHydrated, taskStatuses, subItemChecks, taskNotes, globalState]);

  // ────────────────────────────────────────────────────────────────
  // Condition evaluator
  // ────────────────────────────────────────────────────────────────
  const evaluateCondition = useCallback(
    (conditionString) => {
      if (!conditionString) return false;

      // "galveston_order_signed == true"
      if (conditionString.includes('galveston_order_signed == true')) {
        return globalState.galveston_order_signed === true;
      }
      // "galveston_order_signed == false && current_date >= 2026-06-15"
      if (conditionString.includes('galveston_order_signed == false')) {
        const dateMatch = conditionString.match(/current_date\s*>=\s*(\d{4}-\d{2}-\d{2})/);
        const orderPending = !globalState.galveston_order_signed;
        if (dateMatch) {
          return orderPending && startOfLocalDay(new Date()) >= parseLocalDate(dateMatch[1]);
        }
        return orderPending;
      }
      return false;
    },
    [globalState],
  );

  // ────────────────────────────────────────────────────────────────
  // Dependency resolution
  // ────────────────────────────────────────────────────────────────
  const isTaskLocked = useCallback(
    (task) => {
      if (!task.dependencies || task.dependencies.length === 0) return false;
      return task.dependencies.some((depId) => taskStatuses[depId] !== 'COMPLETE');
    },
    [taskStatuses],
  );

  // ────────────────────────────────────────────────────────────────
  // Task visibility (conditional_skip_if / activation_condition)
  // ────────────────────────────────────────────────────────────────
  const isTaskVisible = useCallback(
    (task) => {
      // If this task has a skip condition and it evaluates true → hide it
      if (task.conditional_skip_if && evaluateCondition(task.conditional_skip_if)) {
        return false;
      }
      // If this task is CONDITIONAL, only show when its activation fires
      if (task.status === 'CONDITIONAL' || task.is_conditional) {
        if (task.activation_condition) {
          return evaluateCondition(task.activation_condition);
        }
        return false; // CONDITIONAL with no activation_condition stays hidden
      }
      return true;
    },
    [evaluateCondition],
  );

  // ────────────────────────────────────────────────────────────────
  // Effective status: overlays runtime logic on top of raw status
  // ────────────────────────────────────────────────────────────────
  const getEffectiveStatus = useCallback(
    (task) => {
      const raw = taskStatuses[task.id] || task.status;

      // Already completed by the user
      if (raw === 'COMPLETE') return 'COMPLETE';

      // Skipped by condition
      if (task.conditional_skip_if && evaluateCondition(task.conditional_skip_if)) {
        return 'SKIPPED';
      }

      // Conditional task that just activated → promote to TODO
      if (raw === 'CONDITIONAL' && task.activation_condition && evaluateCondition(task.activation_condition)) {
        return 'TODO';
      }

      // Locked behind a dependency
      if (isTaskLocked(task)) return 'LOCKED';

      return raw; // TODO | IN_PROGRESS
    },
    [taskStatuses, evaluateCondition, isTaskLocked],
  );

  // ────────────────────────────────────────────────────────────────
  // Filtered task tree (for the Phases UI)
  // ────────────────────────────────────────────────────────────────
  const getFilteredTasks = useCallback(() => {
    return seedData.map((phase) => ({
      ...phase,
      tasks: phase.tasks.filter((task) => isTaskVisible(task)),
    }));
  }, [seedData, isTaskVisible]);

  // ────────────────────────────────────────────────────────────────
  // Today's priority tasks
  // ────────────────────────────────────────────────────────────────
  const getTodaysPriorityTasks = useCallback(() => {
    const today = startOfLocalDay(new Date());

    const allTasks = seedData.flatMap((phase) => phase.tasks);
    return allTasks.filter((task) => {
      if (!isTaskVisible(task)) return false;
      const status = getEffectiveStatus(task);
      if (status === 'COMPLETE' || status === 'SKIPPED') return false;

      // High-priority flag
      if (task.is_high_priority) {
        // Check if the task's target date is today (or past-due)
        const taskDate = task.target_start || task.target_end || task.target_date;
        if (taskDate) {
          const taskDay = startOfLocalDay(parseLocalDate(taskDate));
          if (taskDay <= today) return true;
        }
      }
      return false;
    });
  }, [seedData, isTaskVisible, getEffectiveStatus]);

  const getTimelineTasks = useCallback(
    (mode) => {
      const today = startOfLocalDay(new Date());
      const allTasks = seedData.flatMap((phase) =>
        phase.tasks.map((task) => ({ ...task, phase: phase.phase, phaseId: phase.phaseId })),
      );

      return allTasks
        .filter((task) => {
          if (!isTaskVisible(task)) return false;
          const status = getEffectiveStatus(task);
          if (status === 'COMPLETE' || status === 'SKIPPED') return false;

          const taskDate = getTaskDate(task);
          if (!taskDate) return mode === 'all';
          const taskDay = startOfLocalDay(parseLocalDate(taskDate));

          if (mode === 'today') return taskDay <= today;
          if (mode === 'upcoming') return taskDay > today;
          return true;
        })
        .sort((a, b) => {
          const aDate = getTaskDate(a);
          const bDate = getTaskDate(b);
          if (!aDate && !bDate) return a.title.localeCompare(b.title);
          if (!aDate) return 1;
          if (!bDate) return -1;
          return parseLocalDate(aDate) - parseLocalDate(bDate);
        });
    },
    [seedData, isTaskVisible, getEffectiveStatus],
  );

  // ────────────────────────────────────────────────────────────────
  // Case progress (percentage of visible, non-conditional tasks done)
  // ────────────────────────────────────────────────────────────────
  const getCaseProgress = useCallback(() => {
    const visible = seedData
      .flatMap((p) => p.tasks)
      .filter((t) => isTaskVisible(t));
    if (visible.length === 0) return 0;

    const done = visible.filter((t) => {
      const s = getEffectiveStatus(t);
      return s === 'COMPLETE' || s === 'SKIPPED';
    });
    return Math.round((done.length / visible.length) * 100);
  }, [seedData, isTaskVisible, getEffectiveStatus]);

  // ────────────────────────────────────────────────────────────────
  // Mutations
  // ────────────────────────────────────────────────────────────────

  /** Mark a task as COMPLETE (respects dependency locks) */
  const completeTask = useCallback(
    (taskId) => {
      const task = seedData.flatMap((p) => p.tasks).find((t) => t.id === taskId);
      if (!task) return;
      if (isTaskLocked(task)) {
        console.warn(`⛔ Cannot complete ${taskId} — blocked by dependencies`);
        return;
      }

      // If the task has physical sub-items, verify all are checked
      const assets = task.metadata?.required_physical_assets;
      if (assets && assets.length > 0) {
        const checks = subItemChecks[taskId] || [];
        if (checks.length < assets.length || checks.some((v) => !v)) {
          console.warn(`⛔ Cannot complete ${taskId} — not all sub-items checked`);
          return;
        }
      }

      setTaskStatuses((prev) => ({ ...prev, [taskId]: 'COMPLETE' }));
    },
    [seedData, isTaskLocked, subItemChecks],
  );

  /** Toggle a task between TODO and IN_PROGRESS */
  const toggleTaskProgress = useCallback(
    (taskId) => {
      setTaskStatuses((prev) => {
        const current = prev[taskId] || 'TODO';
        if (current === 'COMPLETE') return prev; // can't un-complete here
        return {
          ...prev,
          [taskId]: current === 'IN_PROGRESS' ? 'TODO' : 'IN_PROGRESS',
        };
      });
    },
    [],
  );

  /** Toggle a sub-item checkbox (for required_physical_assets) */
  const toggleSubItem = useCallback((taskId, index) => {
    setSubItemChecks((prev) => {
      const current = [...(prev[taskId] || [])];
      current[index] = !current[index];
      return { ...prev, [taskId]: current };
    });
  }, []);

  const updateTaskNote = useCallback((taskId, note) => {
    setTaskNotes((prev) => ({ ...prev, [taskId]: note }));
  }, []);

  /** Convenience: flip the galveston_order_signed switch to true */
  const receiveGalvestonOrder = useCallback(() => {
    setGlobalState((prev) => ({ ...prev, galveston_order_signed: true }));
  }, []);

  // ────────────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────────────
  return {
    // State
    globalState,
    setGlobalState,
    taskStatuses,
    subItemChecks,
    taskNotes,
    hasHydrated,

    // Queries
    getFilteredTasks,
    getTodaysPriorityTasks,
    getTimelineTasks,
    getCaseProgress,
    getEffectiveStatus,
    isTaskLocked,
    isTaskVisible,

    // Mutations
    completeTask,
    toggleTaskProgress,
    toggleSubItem,
    updateTaskNote,
    receiveGalvestonOrder,
  };
}

function getTaskDate(task) {
  return task.target_start || task.target_end || task.target_date || null;
}

function parseLocalDate(dateString) {
  if (!dateString || dateString.includes('T')) return new Date(dateString);
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
