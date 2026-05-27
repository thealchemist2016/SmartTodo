import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView, TouchableOpacity, Alert } from 'react-native';
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
                caseId: 'litigation_case_001',
                taskId: task.id,
                dependsOnTaskId: depId,
                dependencyType: 'hard',
                triggerCondition: 'task_completed',
                notes: `${task.id} waits for ${depId}`,
              }
            );
          }
        }
      }
    }
    console.log('✓ Dependencies created');

    Alert.alert('✅ Success!', 'Appwrite collections initialized!\n\nReload the app to see tasks.');
    return true;
  } catch (error) {
    console.error('❌ Error:', error);
    Alert.alert('Error', `Failed to initialize: ${error.message}`);
    return false;
  }
}

export default function App() {
  const [taskData, setTaskData] = useState(seedTasks);
  const taskState = useTaskState(taskData);

  useEffect(() => {
    console.log('📱 SmartTodo app loaded');
    console.log('✅ State management ready');
    console.log('📋 Seed tasks loaded:', seedTasks.length, 'phases');
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>SmartTodo</Text>
          <Text style={styles.subtitle}>Litigation Calendar Demo</Text>
          <Text style={styles.progress}>Progress: {taskState.getCaseProgress()}%</Text>
        </View>

        {/* Setup Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚙️ Setup Instructions</Text>
          
          <View style={styles.setupCard}>
            <Text style={styles.setupStep}>1. Update DATABASE_ID in App.js line 8</Text>
            <Text style={styles.setupStep}>2. Create 8 collections in Appwrite (see docs)</Text>
            <Text style={styles.setupStep}>3. Tap button below to initialize</Text>
          </View>

          <TouchableOpacity style={styles.initButton} onPress={initializeAppwriteCollections}>
            <Text style={styles.initButtonText}>⚙️ Initialize Appwrite Database</Text>
          </TouchableOpacity>
        </View>

        {/* Priority Tasks */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔴 Today's Priority Tasks</Text>
          {taskState.getTodaysPriorityTasks().length === 0 ? (
            <Text style={styles.emptyText}>No priority tasks today</Text>
          ) : (
            taskState.getTodaysPriorityTasks().map((task) => (
              <View key={task.id} style={styles.taskCard}>
                <Text style={styles.taskTitle}>{task.title}</Text>
                <Text style={styles.taskSubtitle}>{task.alert_text}</Text>
              </View>
            ))
          )}
        </View>

        {/* Phases Overview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Phases</Text>
          {taskState.getFilteredTasks().map((phase) => (
            <View key={phase.phaseId} style={styles.phaseCard}>
              <Text style={styles.phaseName}>{phase.phase}</Text>
              <Text style={styles.phaseCount}>{phase.tasks.length} tasks</Text>
            </View>
          ))}
        </View>

        {/* Scenario Control */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚡ Conditional Scenarios</Text>
          <Text style={styles.scenarioStatus}>
            Current: {taskState.globalState.galveston_order_signed ? '✓ Order Signed' : '✗ Order Pending'}
          </Text>

          <TouchableOpacity
            style={[styles.scenarioButton, taskState.globalState.galveston_order_signed && styles.scenarioButtonActive]}
            onPress={() => taskState.receiveGalvestonOrder()}
          >
            <Text style={styles.scenarioButtonText}>✓ Scenario A: Order Signed</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.scenarioButton, !taskState.globalState.galveston_order_signed && styles.scenarioButtonActive]}
            onPress={() =>
              taskState.setGlobalState((prev) => ({
                ...prev,
                galveston_order_signed: false,
              }))
            }
          >
            <Text style={styles.scenarioButtonText}>✗ Scenario B: Order Pending</Text>
          </TouchableOpacity>

          <Text style={styles.scenarioExplain}>
            {taskState.globalState.galveston_order_signed
              ? '→ Tasks 5 & 6 hidden, Task 7 visible'
              : '→ Tasks 5 & 6 visible (polling), Task 8 visible'}
          </Text>
        </View>

        {/* Test Data Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>📋 Test Data Loaded</Text>
          <Text style={styles.infoText}>Litigation Calendar: 9 tasks across 4 phases</Text>
          <Text style={styles.infoText}>Ready for Appwrite integration</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  scrollView: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#CBD5E1',
    marginBottom: 8,
  },
  progress: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 12,
  },
  setupCard: {
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  setupStep: {
    fontSize: 12,
    color: '#CBD5E1',
    marginBottom: 6,
    lineHeight: 16,
  },
  initButton: {
    backgroundColor: '#1E40AF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  initButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    padding: 16,
  },
  taskCard: {
    backgroundColor: '#1E293B',
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  taskTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  taskSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 14,
  },
  phaseCard: {
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  phaseName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
    flex: 1,
  },
  phaseCount: {
    fontSize: 12,
    color: '#94A3B8',
  },
  scenarioStatus: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FCD34D',
    marginBottom: 12,
  },
  scenarioButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#334155',
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  scenarioButtonActive: {
    backgroundColor: '#1E40AF',
    borderColor: '#3B82F6',
  },
  scenarioButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
    textAlign: 'center',
  },
  scenarioExplain: {
    fontSize: 11,
    color: '#FCD34D',
    marginTop: 8,
    fontStyle: 'italic',
  },
  infoCard: {
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 8,
    marginBottom: 32,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 6,
  },
  infoText: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 4,
  },
});
