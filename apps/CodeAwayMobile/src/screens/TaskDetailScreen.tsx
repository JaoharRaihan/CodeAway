import React, { useEffect, useRef, useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
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
  user_message: '💬',
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

  const [followUpText, setFollowUpText] = useState('')
  const [sending, setSending] = useState(false)

  const task = tasks.find((t) => t._id === taskId)
  const events = liveEvents[taskId] ?? []

  useEffect(() => {
    // Load task events history
    api.get(`/tasks/${taskId}/events`).then((r) => {
      r.data.forEach((e: any) => {
        addLiveEvent(taskId, { type: e.event_type, message: e.message, metadata: e.metadata })
      })
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
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

  const handleSendFollowUp = async () => {
    const trimmed = followUpText.trim()
    if (!trimmed || sending) return
    setSending(true)
    setFollowUpText('')

    try {
      await api.post(`/tasks/${taskId}/messages`, { message: trimmed })
      addLiveEvent(taskId, {
        type: 'user_message',
        message: trimmed,
        metadata: { sender: 'user' },
      })
      updateTaskStatus(taskId, 'running')
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error ?? err.message)
      setFollowUpText(trimmed)
    } finally {
      setSending(false)
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        {/* Status bar header */}
        <View style={styles.statusBar}>
          <View>
            <Text style={styles.statusText}>
              Status:{' '}
              <Text style={[styles.statusBadge, { color: STATUS_COLOR[task?.status ?? 'queued'] }]}>
                {task?.status?.toUpperCase() ?? 'LOADING'}
              </Text>
            </Text>
          </View>
          {(task?.status === 'running' || task?.status === 'queued') && (
            <TouchableOpacity onPress={cancelTask} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Conversation stream */}
        <ScrollView
          ref={scrollRef}
          style={styles.eventList}
          contentContainerStyle={styles.eventListContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {/* Initial user prompt */}
          <View style={styles.userBubble}>
            <View style={styles.bubbleHeader}>
              <Text style={styles.userBadge}>YOU</Text>
            </View>
            <Text style={styles.userBubbleText}>{task?.prompt ?? '...'}</Text>
          </View>

          {events.length === 0 && (
            <View style={styles.waitingWrap}>
              <ActivityIndicator color="#6c63ff" />
              <Text style={styles.waitingText}>Connecting to laptop agent...</Text>
            </View>
          )}

          {/* Chronological event items */}
          {events.map((e, i) => {
            if (e.event.type === 'user_message') {
              return (
                <View key={i} style={styles.userBubble}>
                  <View style={styles.bubbleHeader}>
                    <Text style={styles.userBadge}>YOU (FOLLOW-UP)</Text>
                  </View>
                  <Text style={styles.userBubbleText}>{e.event.message}</Text>
                </View>
              )
            }

            if (e.event.type === 'task_completed') {
              return (
                <View key={i} style={styles.resultCard}>
                  <Text style={styles.resultLabel}>✅ RESULT</Text>
                  <Text style={styles.resultText}>{e.event.message}</Text>
                </View>
              )
            }

            return (
              <View key={i} style={styles.eventRow}>
                <Text style={styles.eventIcon}>{EVENT_ICONS[e.event.type] ?? '•'}</Text>
                <Text style={styles.eventMsg}>{e.event.message}</Text>
              </View>
            )
          })}

          {/* Running indicator when agent is processing */}
          {task?.status === 'running' && (
            <View style={styles.agentActiveRow}>
              <ActivityIndicator size="small" color="#6c63ff" />
              <Text style={styles.agentActiveText}>Agent is working on your request...</Text>
            </View>
          )}
        </ScrollView>

        {/* Sticky Chat Input Bar */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.inputField}
            placeholder="Send follow-up instruction (e.g. now add KeyboardAvoidingView)..."
            placeholderTextColor="#666"
            value={followUpText}
            onChangeText={setFollowUpText}
            multiline
            maxLength={4000}
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!followUpText.trim() || sending) && styles.sendBtnDisabled]}
            disabled={!followUpText.trim() || sending}
            onPress={handleSendFollowUp}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendIcon}>➤</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = (StyleSheet as any).create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  keyboardAvoid: {
    flex: 1,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#16161e',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3a',
  },
  statusText: { color: '#888', fontSize: 13 },
  statusBadge: { fontWeight: '700' },
  cancelBtn: {
    backgroundColor: '#2a2a3a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cancelText: { color: '#f87171', fontSize: 13, fontWeight: '600' },

  eventList: { flex: 1 },
  eventListContent: { padding: 16, paddingBottom: 24 },

  userBubble: {
    backgroundColor: '#1c1b33',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#3b3866',
    alignSelf: 'stretch',
  },
  bubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  userBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#818cf8',
    letterSpacing: 1.2,
  },
  userBubbleText: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 20,
  },

  waitingWrap: { alignItems: 'center', padding: 32, gap: 12 },
  waitingText: { color: '#555', fontSize: 14, marginTop: 8 },

  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  eventIcon: { fontSize: 16, marginRight: 10, marginTop: 1 },
  eventMsg: { color: '#ccc', fontSize: 13, flex: 1, lineHeight: 20 },

  agentActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 10,
  },
  agentActiveText: {
    color: '#818cf8',
    fontSize: 13,
    fontStyle: 'italic',
  },

  resultCard: {
    marginVertical: 12,
    backgroundColor: '#0d2218',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1a4a2e',
  },
  resultLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4ade80',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  resultText: { color: '#a7f3d0', fontSize: 13, lineHeight: 20 },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#16161e',
    borderTopWidth: 1,
    borderTopColor: '#2a2a3a',
    gap: 8,
  },
  inputField: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    backgroundColor: '#0a0a0f',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#6c63ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#2a2a3a',
    opacity: 0.5,
  },
  sendIcon: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
})
