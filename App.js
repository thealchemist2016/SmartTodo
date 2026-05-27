import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  StatusBar,
} from 'react-native';
import { databases, ID } from './lib/appwrite';
import useTaskState from './useTaskState';
import seedTasks from './seed_tasks.json';

// UPDATE THIS: Get your Database ID from Appwrite Dashboard → Databases
const DATABASE_ID = 'YOUR_DATABASE_ID_HERE';  // ← Replace this

/**
 * Initialize Appwrite Collections from seed data
 * Run once to populate your database with the litigation calendar
 */
async function initializeAppwriteCollections() {
  try {
    console.log('🔄 Initializing Appwrite collections...');

    // 1. Create Case document
    const caseDoc = await databases.createDocument(
      DATABASE_ID,
      'cases',
      'litigation_case_001',
      {
        userId: 'user_123',
        caseNumber: '25-FD-1502 / 135860-F',
        caseName: 'Smith v. Jones (Modification)',
        jurisdiction: 'Galveston & Brazoria Counties',
        status: 'active',
        description: 'Family law modification case with multi-county coordination.',
      }
    );
    console.log('✓ Case created');

    // 2. Create Phases
    for (const phase of seedTasks) {
      await databases.createDocument(
        DATABASE_ID,
        'phases',
        phase.phaseId,
        {
          caseId: 'litigation_case_001',
          phase: phase.phase_number,
          title: phase.phase,
          status: 'pending',
          targetStartDate: null,
          targetEndDate: null,
        }
      );
    }
    console.log('✓ Phases created');

    // 3. Create Tasks
    for (const phase of seedTasks) {
      for (const task of phase.tasks) {
        await databases.createDocument(
          DATABASE_ID,
          'tasks',
          task.id,
          {
            caseId: 'litigation_case_001',
            phaseId: phase.phaseId,
            taskNumber: parseInt(task.id.split('_')[1]),
            title: task.title,
            description: task.alert_text || '',
            status: task.status,
            isConditional: task.is_conditional || false,
            conditionalLogic: task.activation_condition || task.conditional_skip_if || null,
            targetDate: task.target_start || task.target_date || null,
            targetStartTime: task.target_start ? new Date(task.target_start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : null,
            targetEndTime: task.target_end ? new Date(task.target_end).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : null,
            dueDate: task.target_end || task.target_date || null,
            actionType: task.metadata?.action_type || 'review',
            contactPhone: task.metadata?.phone || null,
            contactEmail: task.metadata?.recipient || null,
            alertReminder: task.alert_text || '',
            isHighPriority: task.is_high_priority || false,
            requiresScreenshot: task.metadata?.verification ? true : false,
            requiresFileUpload: task.requires_artifact || false,
            notes: JSON.stringify(task.metadata),
          }
        );
      }
    }
    console.log('✓ Tasks created');

    // 4. Create Dependencies
    for (const phase of seedTasks) {
      for (const task of phase.tasks) {
        if (task.dependencies && task.dependencies.length > 0) {
          for (const depId of task.dependencies) {
            await databases.createDocument(
              DATABASE_ID,
              'task_dependencies',
              ID.unique(),
              {
                taskId: task.id,
                dependsOnTaskId: depId,
              }
            );
          }
        }
      }
    }
    console.log('✓ Dependencies created');
    Alert.alert('Success', 'Database initialized with litigation calendar.');
  } catch (error) {
    console.error('Initialization failed:', error);
    Alert.alert('Error', 'Failed to initialize database. Check console.');
  }
}

// ─────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────
function formatTimeWindow(task) {
  if (task.target_start && task.target_end) {
    const start = new Date(task.target_start);
    const end = new Date(task.target_end);
    const dateStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const startTime = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const endTime = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${dateStr}  •  ${startTime} – ${endTime}`;
  }
  if (task.target_date) {
    return new Date(task.target_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  if (task.target_start) {
      return new Date(task.target_start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  return '';
}

const STATUS_COLORS = {
  TODO:        { border: '#3B82F6', bg: '#1E3A5F', badge: '#3B82F6', text: '#93C5FD' },
  IN_PROGRESS: { border: '#F59E0B', bg: '#422006', badge: '#F59E0B', text: '#FDE68A' },
  COMPLETE:    { border: '#10B981', bg: '#064E3B', badge: '#10B981', text: '#6EE7B7' },
  LOCKED:      { border: '#475569', bg: '#1E293B', badge: '#475569', text: '#94A3B8' },
  SKIPPED:     { border: '#6B7280', bg: '#1F2937', badge: '#6B7280', text: '#9CA3AF' },
  CONDITIONAL: { border: '#A855F7', bg: '#3B0764', badge: '#A855F7', text: '#D8B4FE' },
};

const STATUS_LABELS = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  COMPLETE: 'Done',
  LOCKED: '🔒 Locked',
  SKIPPED: 'Skipped',
  CONDITIONAL: 'Conditional',
};

// ─── Phase colour accents ────────────────────────────────────────
const PHASE_ACCENTS = ['#EF4444', '#F59E0B', '#A855F7', '#10B981'];

// ═════════════════════════════════════════════════════════════════
//  TaskCard Component
// ═════════════════════════════════════════════════════════════════
function TaskCard({ task, taskState, phaseIndex }) {
  const status = taskState.getEffectiveStatus(task);
  const locked = status === 'LOCKED';
  const colors = STATUS_COLORS[status] || STATUS_COLORS.TODO;
  const subItems = task.metadata?.required_physical_assets;
  const checks = taskState.subItemChecks[task.id] || [];

  const handlePress = useCallback(() => {
    if (locked) {
      const depNames = task.dependencies
        .map((id) => id.replace('task_', 'Task '))
        .join(', ');
      Alert.alert('🔒 Blocked', `Complete ${depNames} first.`);
      return;
    }
    if (status === 'COMPLETE') return;
    taskState.toggleTaskProgress(task.id);
  }, [locked, status, task]);

  const handleComplete = useCallback(() => {
    if (locked) return;
    taskState.completeTask(task.id);
  }, [locked, task.id]);

  const isLegalCompliance = task.metadata?.action_type === 'EFILE_SERVICE' || task.metadata?.action_type === 'EMAIL';

  return (
    <View style={[styles.taskCard, { borderLeftColor: colors.border, backgroundColor: colors.bg }, locked && styles.taskCardLocked]}>
      {/* Header row */}
      <View style={styles.taskHeader}>
        <TouchableOpacity
          onPress={handlePress}
          style={[styles.statusCheckbox, { borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          {status === 'COMPLETE' && <Text style={styles.checkMark}>✓</Text>}
          {status === 'IN_PROGRESS' && <View style={[styles.progressDot, { backgroundColor: colors.badge }]} />}
          {status === 'LOCKED' && <Text style={styles.lockIcon}>🔒</Text>}
        </TouchableOpacity>

        <View style={styles.taskHeaderText}>
          <Text style={[styles.taskTitle, locked && styles.taskTitleLocked]} numberOfLines={2}>
            {task.title}
          </Text>
          <View style={styles.badgeRow}>
            <View style={[styles.statusBadge, { backgroundColor: colors.badge + '22', borderColor: colors.badge }]}>
              <Text style={[styles.statusBadgeText, { color: colors.text }]}>
                {STATUS_LABELS[status]}
              </Text>
            </View>
            {task.requires_artifact && (
              <View style={[styles.statusBadge, styles.artifactBadge]}>
                <Text style={[styles.statusBadgeText, styles.artifactBadgeText]}>
                  📸 Artifact Required
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Time window */}
      {formatTimeWindow(task) !== '' && (
        <Text style={styles.timeWindow}>🕐  {formatTimeWindow(task)}</Text>
      )}

      {/* Alert / description text — Legal actions get high-visibility warning */}
      {task.alert_text && status !== 'COMPLETE' && !locked && (
        <View style={[
          styles.alertBox,
          isLegalCompliance && styles.protectiveOrderAlert,
        ]}>
          <Text style={[
            styles.alertText,
            isLegalCompliance && styles.protectiveOrderText,
          ]}>
            {isLegalCompliance ? '⚠️ LEGAL COMPLIANCE: ' : ''}
            {task.alert_text}
          </Text>
        </View>
      )}
      {task.alert_text && (status === 'COMPLETE' || locked) && (
        <Text style={[styles.alertText, locked && styles.alertTextLocked]}>{task.alert_text}</Text>
      )}

      {/* Action steps (for CONDITIONAL / multi-step tasks) */}
      {task.action_steps && task.action_steps.length > 0 && (
        <View style={styles.actionStepsContainer}>
          <Text style={styles.actionStepsLabel}>Action Steps:</Text>
          {task.action_steps.map((step, i) => (
            <Text key={i} style={styles.actionStep}>
              {i + 1}. {step}
            </Text>
          ))}
        </View>
      )}

      {/* Deep-link buttons (phone / email) */}
      <View style={styles.deepLinkRow}>
        {task.metadata?.phone && (
          <TouchableOpacity
            style={styles.deepLinkButton}
            onPress={() => Linking.openURL(`tel:${task.metadata.phone.replace(/[^0-9+]/g, '')}`)}
          >
            <Text style={styles.deepLinkText}>📞  {task.metadata.phone}</Text>
          </TouchableOpacity>
        )}
        {task.metadata?.recipient && task.metadata?.action_type === 'EMAIL' && (
          <TouchableOpacity
            style={[styles.deepLinkButton, styles.emailButton]}
            onPress={() => Linking.openURL(`mailto:${task.metadata.recipient}`)}
          >
            <Text style={styles.deepLinkText}>📧  Send Service Email</Text>
          </TouchableOpacity>
        )}
        {task.metadata?.portal_url && (
          <TouchableOpacity
            style={[styles.deepLinkButton, styles.eFileButton]}
            onPress={() => Linking.openURL(task.metadata.portal_url)}
          >
            <Text style={styles.deepLinkText}>🔐  Open E-File Portal</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Location (for court appearances) */}
      {task.metadata?.address && (
        <TouchableOpacity
          style={styles.locationRow}
          onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(task.metadata.address)}`)}
        >
          <Text style={styles.locationText}>
            📍  {task.metadata.address}{task.metadata.room ? `  •  ${task.metadata.room}` : ''}
          </Text>
        </TouchableOpacity>
      )}

      {/* Physical assets sub-checklist */}
      {subItems && subItems.length > 0 && (
        <View style={styles.subItemsContainer}>
          <Text style={styles.subItemsLabel}>Required Assets:</Text>
          {subItems.map((item, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.subItemRow}
              onPress={() => taskState.toggleSubItem(task.id, idx)}
              activeOpacity={0.7}
            >
              <View style={[styles.subItemCheck, checks[idx] && styles.subItemChecked]}>
                {checks[idx] && <Text style={styles.subItemCheckMark}>✓</Text>}
              </View>
              <Text style={[styles.subItemText, checks[idx] && styles.subItemTextDone]}>
                {item}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Dependency note */}
      {task.dependencies && task.dependencies.length > 0 && (
        <Text style={styles.depNote}>
          ⛓  Depends on: {task.dependencies.map((d) => d.replace('task_', '#')).join(', ')}
        </Text>
      )}

      {/* Complete button (only for non-locked, non-complete tasks) */}
      {status !== 'COMPLETE' && status !== 'LOCKED' && status !== 'SKIPPED' && (
        <TouchableOpacity
          style={[styles.completeButton, { backgroundColor: colors.border }]}
          onPress={handleComplete}
        >
          <Text style.completeButtonText}>Mark Complete ✓</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════
//  App Root
// ═════════════════════════════════════════════════════════════════
export default function App() {
  const [taskData] = useState(seedTasks);
  const taskState = useTaskState(taskData);
  const [expandedPhases, setExpandedPhases] = useState({});
  const [showSetup, setShowSetup] = useState(false);

  // Initial expand: Phase 1
  useEffect(() => {
    setExpandedPhases({ phase_001: true });
  }, []);

  const togglePhase = (id) => {
    setExpandedPhases((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const progress = taskState.getCaseProgress();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>⚖️ SmartTodo</Text>
          <Text style={styles.subtitle}>Litigation Calendar  •  Smith v. Jones</Text>

          <View style={styles.progressContainer}>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.progressLabel}>{progress}% complete</Text>
          </View>
        </View>

        {/* ── Scenario Controls (Simulating Galveston) ───────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚡ Galveston Order Status</Text>
          <View style={styles.scenarioRow}>
            <TouchableOpacity
              style={[styles.scenarioChip, taskState.globalState.galveston_order_signed && styles.scenarioChipActive]}
              onPress={taskState.receiveGalvestonOrder}
            >
              <Text style={styles.scenarioChipText}>✓ Order Signed</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.scenarioChip, !taskState.globalState.galveston_order_signed && styles.scenarioChipActive]}
              onPress={() => taskState.setGlobalState(prev => ({...prev, galveston_order_signed: false}))}
            >
              <Text style={styles.scenarioChipText}>✘ Still Pending</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.scenarioExplain}>
            {taskState.globalState.galveston_order_signed
              ? '→ Scenario A active: Prepare to file in Brazoria'
              : '→ Scenario B active: Tasks 5 & 6 polling, Task 8 ready when date arrives'}
          </Text>
        </View>

        {/* ── Phases ─────────────────────────────────────────── */}
        {taskState.getFilteredTasks().map((phase, phaseIdx) => (
          <View key={phase.phaseId} style={styles.section}>
            <TouchableOpacity
              style={styles.phaseHeader}
              onPress={() => togglePhase(phase.phaseId)}
              activeOpacity={0.8}
            >
              <View style={[styles.phaseAccent, { backgroundColor: PHASE_ACCENTS[phaseIdx % PHASE_ACCENTS.length] }]} />
              <View style={styles.phaseHeaderText}>
                <Text style={styles.phaseName}>{phase.phase}</Text>
                <Text style={styles.phaseCount}>
                  {phase.tasks.filter((t) => taskState.getEffectiveStatus(t) === 'COMPLETE').length}/{phase.tasks.length} done
                </Text>
              </View>
              <Text style={styles.chevron}>
                {expandedPhases[phase.phaseId] ? '▼' : '▶'}
              </Text>
            </TouchableOpacity>

            {expandedPhases[phase.phaseId] &&
              phase.tasks.map((task) => (
                <TaskCard key={task.id} task={task} taskState={taskState} phaseIndex={phaseIdx} />
              ))}
          </View>
        ))}

        {/* ── Setup Section (collapsed by default) ────────────── */}
        <TouchableOpacity
          style={styles.setupToggle}
          onPress={() => setShowSetup(!showSetup)}
        >
          <Text style={styles.setupToggleText}>
            {showSetup ? '▼' : '▶'}  ⚙️ Appwrite Setup
          </Text>
        </TouchableOpacity>

        {showSetup && (
          <View style={styles.setupCard}>
            <Text style={styles.setupStep}>1. Update DATABASE_ID in App.js line 17</Text>
            <Text style={styles.setupStep}>2. Update Project ID in lib/appwrite.js</Text>
            <Text style={styles.setupStep}>3. Create collections: cases, phases, tasks, task_dependencies</Text>
            <Text style={styles.setupStep}>4. Tap button below to seed data</Text>
            <TouchableOpacity style={styles.initButton} onPress={initializeAppwriteCollections}>
              <Text style={styles.initButtonText}>⚙️  Initialize Appwrite Database</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}



// ═════════════════════════════════════════════════════════════════
//  Styles
// ═════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  scrollView: {
    padding: 16,
  },

  // ── Header ───────────────────────────────
  header: {
    marginBottom: 24,
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 16,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: '#1E293B',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 4,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B82F6',
    minWidth: 80,
    textAlign: 'right',
  },

  // ── Sections ─────────────────────────────
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 12,
    letterSpacing: 0.3,
  },

  // ── Phase Accordion ──────────────────────
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  phaseAccent: {
    width: 4,
    height: 32,
    borderRadius: 2,
    marginRight: 12,
  },
  phaseHeaderText: {
    flex: 1,
  },
  phaseName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 2,
  },
  phaseCount: {
    fontSize: 11,
    color: '#64748B',
  },
  chevron: {
    fontSize: 12,
    color: '#64748B',
    marginLeft: 8,
  },

  // ── Task Card ────────────────────────────
  taskCard: {
    backgroundColor: '#1E293B',
    borderLeftWidth: 4,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    marginLeft: 8,
  },
  taskCardLocked: {
    opacity: 0.55,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  statusCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  checkMark: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: 'bold',
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  lockIcon: {
    fontSize: 11,
  },
  taskHeaderText: {
    flex: 1,
    flexDirection: 'column',
  },
  taskTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F1F5F9',
    lineHeight: 18,
    marginBottom: 6,
  },
  taskTitleLocked: {
    color: '#64748B',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ── Time / Alert ─────────────────────────
  timeWindow: {
    fontSize: 11,
    color: '#93C5FD',
    marginBottom: 6,
    fontWeight: '600',
  },
  alertText: {
    fontSize: 12,
    color: '#CBD5E1',
    lineHeight: 17,
    marginBottom: 8,
  },
  alertTextLocked: {
    color: '#475569',
  },

  // ── Action Steps ─────────────────────────
  actionStepsContainer: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  actionStepsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionStep: {
    fontSize: 12,
    color: '#CBD5E1',
    lineHeight: 18,
    marginBottom: 3,
    paddingLeft: 4,
  },

  // ── Deep Links (phone / email) ───────────
  deepLinkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  deepLinkButton: {
    backgroundColor: '#164E63',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  emailButton: {
    backgroundColor: '#4C1D95',
  },
  deepLinkText: {
    color: '#E0F2FE',
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Location ─────────────────────────────
  locationRow: {
    backgroundColor: '#1A2332',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  locationText: {
    fontSize: 12,
    color: '#93C5FD',
    lineHeight: 16,
  },

  // ── Sub-Item Checklist ───────────────────
  subItemsContainer: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  subItemsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  subItemCheck: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#475569',
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  subItemChecked: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  subItemCheckMark: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  subItemText: {
    flex: 1,
    fontSize: 12,
    color: '#CBD5E1',
    lineHeight: 17,
  },
  subItemTextDone: {
    textDecorationLine: 'line-through',
    color: '#64748B',
  },

  // ── Dependency note ──────────────────────
  depNote: {
    fontSize: 10,
    color: '#64748B',
    fontStyle: 'italic',
    marginBottom: 8,
  },

  // ── Complete Button ──────────────────────
  completeButton: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  completeButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Scenario Control ─────────────────────
  scenarioRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  scenarioChip: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#1E293B',
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  scenarioChipActive: {
    backgroundColor: '#1E3A5F',
    borderColor: '#3B82F6',
  },
  scenarioChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  scenarioExplain: {
    fontSize: 11,
    color: '#FCD34D',
    fontStyle: 'italic',
  },

  // ── Setup ────────────────────────────────
  setupToggle: {
    paddingVertical: 12,
    marginBottom: 8,
  },
  setupToggleText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  setupCard: {
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
  },
  setupStep: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 8,
    lineHeight: 17,
  },
  initButton: {
    backgroundColor: '#1E40AF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  initButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Alert Box ────────────────────────────
  alertBox: {
    marginTop: 4,
    marginBottom: 8,
    padding: 10,
    backgroundColor: '#1A2332',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },

  // ── Protective Order / eFile Warning ─────
  protectiveOrderAlert: {
    backgroundColor: '#2D1215',
    borderLeftColor: '#EF4444',
    borderWidth: 1,
    borderColor: '#7F1D1D',
  },
  protectiveOrderText: {
    color: '#FCA5A5',
    fontWeight: 'bold',
  },

  // ── eFile Portal Button ──────────────────
  eFileButton: {
    backgroundColor: '#7F1D1D',
  },

  // ── Artifact Badge ───────────────────────
  artifactBadge: {
    backgroundColor: '#7F1D1D22',
    borderColor: '#FCA5A5',
  },
  artifactBadgeText: {
    color: '#FCA5A5',
  },
});
