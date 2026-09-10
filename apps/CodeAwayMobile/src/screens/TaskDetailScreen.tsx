import React, { useEffect, useRef } from 'react'
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, Alert,
} from 'react-native'
import api from '../services/api'
import { connectSocket } from '../services/socket'
import { useTaskStore } from '../store/taskStore'
import { useAuthStore } from '../store/authStore'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import type { RootStackParamList } from '../navigation/types'

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'TaskDetail'>
  route: RouteProp<RootStackParamList, 'TaskDetail'>
}

const EVENT_ICONS: Record<string, string> = {
  task_started: '🤖',
  file_read: '📄',
  file_modified: '✏️',
  command_started: '▶️',
  command_finished: '✅',
  approval_required: '⚠️',
  error: '❌',
  task_completed: '🎉',
}

const STATUS_COLOR: Record<string, string> = {
  queued: '#888',
  running: '#6c63ff',
  waiting_approval: '#f59e0b',
  completed: '#4ade80',
  failed: '#f87171',
  cancelled: '#666',
}

export default function TaskDetailScreen({ route, navigation }: Props) {
  const { taskId } = route.params
  const { user } = useAuthStore()
  const { tasks, liveEvents, addLiveEvent, updateTaskStatus } = useTaskStore()
  const scrollRef = useRef<any>(null)

  const task = tasks.find((t) => t._id === taskId)
  const events = liveEvents[taskId] ?? []

  useEffect(() => {
    // Load task events history
    api.get(`/tasks/${taskId}/events`).then((r) => {
      r.data.forEach((e: any) => {
        addLiveEvent(taskId, { type: e.event_type, message: e.message, metadata: e.metadata })
      })
    })

    // Subscribe to live events
    if (user) {
      connectSocket(user.id).then((socket) => {
        socket.on('task:event', ({ taskId: tid, event }) => {
          if (tid === taskId) {
            addLiveEvent(taskId, event)
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
          }
        })
        socket.on('task:status_changed', ({ taskId: tid, status }) => {
          if (tid === taskId) updateTaskStatus(taskId, status)
        })
        socket.on('approval:required', ({ taskId: tid, approvalId, command, reason }) => {
          if (tid === taskId) {
            Alert.alert(
              '⚠️ Approval Required',
              `AI wants to run:\n\n${command}\n\nReason: ${reason}`,
              [
                { text: 'Reject', style: 'destructive', onPress: () => api.post(`/approvals/${approvalId}/respond`, { decision: 'rejected' }) },
                { text: 'Approve', onPress: () => api.post(`/approvals/${approvalId}/respond`, { decision: 'approved' }) },
              ]
            )
          }
        })
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  const cancelTask = async () => {
    await api.patch(`/tasks/${taskId}/cancel`)
    updateTaskStatus(taskId, 'cancelled')
    navigation.goBack()
  }

  return (
    <View style={styles.container}>
      {/* Status bar */}
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          Status: <Text style={[styles.statusBadge, { color: STATUS_COLOR[task?.status ?? 'queued'] }]}>
            {task?.status?.toUpperCase() ?? 'LOADING'}
          </Text>
        </Text>
        {(task?.status === 'running' || task?.status === 'queued') && (
          <TouchableOpacity onPress={cancelTask} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Prompt */}
      <View style={styles.promptCard}>
        <Text style={styles.promptLabel}>TASK</Text>
        <Text style={styles.promptText}>{task?.prompt ?? '...'}</Text>
      </View>

      {/* Live event stream */}
      <ScrollView
        ref={scrollRef}
        style={styles.eventList}
        contentContainerStyle={styles.eventListContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {events.length === 0 && (
          <View style={styles.waitingWrap}>
            <ActivityIndicator color="#6c63ff" />
            <Text style={styles.waitingText}>Waiting for agent...</Text>
          </View>
        )}
        {events.map((e, i) => (
          <View key={i} style={styles.eventRow}>
            <Text style={styles.eventIcon}>{EVENT_ICONS[e.event.type] ?? '•'}</Text>
            <Text style={styles.eventMsg}>{e.event.message}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Result */}
      {task?.status === 'completed' && task.result && (
        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>✅ RESULT</Text>
          <Text style={styles.resultText}>{task.result}</Text>
        </View>
      )}
    </View>
  )
}

const styles = (StyleSheet as any).create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  statusBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, backgroundColor: '#16161e', borderBottomWidth: 1, borderBottomColor: '#2a2a3a',
  },
  statusText: { color: '#888', fontSize: 13 },
  statusBadge: { fontWeight: '700' },
  cancelBtn: { backgroundColor: '#2a2a3a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  cancelText: { color: '#f87171', fontSize: 13, fontWeight: '600' },
  promptCard: { margin: 16, backgroundColor: '#16161e', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#2a2a3a' },
  promptLabel: { fontSize: 10, fontWeight: '700', color: '#555', letterSpacing: 1.2, marginBottom: 8 },
  promptText: { color: '#ccc', fontSize: 14, lineHeight: 20 },
  eventList: { flex: 1 },
  eventListContent: { padding: 16 },
  waitingWrap: { alignItems: 'center', padding: 32, gap: 12 },
  waitingText: { color: '#555', fontSize: 14, marginTop: 8 },
  eventRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  eventIcon: { fontSize: 16, marginRight: 10, marginTop: 1 },
  eventMsg: { color: '#ccc', fontSize: 13, flex: 1, lineHeight: 20 },
  resultCard: {
    margin: 16, backgroundColor: '#0d2218', borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: '#1a4a2e',
  },
  resultLabel: { fontSize: 10, fontWeight: '700', color: '#4ade80', letterSpacing: 1.2, marginBottom: 8 },
  resultText: { color: '#a7f3d0', fontSize: 13, lineHeight: 20 },
})
