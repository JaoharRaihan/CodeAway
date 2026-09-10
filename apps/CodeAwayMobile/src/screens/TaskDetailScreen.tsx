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

  const [activeTab, setActiveTab] = useState<'chat' | 'files' | 'terminal'>('chat')
  const [followUpText, setFollowUpText] = useState('')
  const [sending, setSending] = useState(false)
  const [files, setFiles] = useState<any[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)

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

    // Load changed files
    loadChangedFiles()

    // Subscribe to live events
    if (user) {
      connectSocket(user.id).then((socket) => {
        socket.on('task:event', ({ taskId: tid, event }) => {
          if (tid === taskId) {
            addLiveEvent(taskId, event)
            if (event.type === 'file_modified' || event.type === 'task_completed') {
              loadChangedFiles()
            }
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

  const loadChangedFiles = async () => {
    try {
      setLoadingFiles(true)
      const res = await api.get(`/tasks/${taskId}/files`)
      setFiles(res.data)
    } catch {
      /* ignore */
    } finally {
      setLoadingFiles(false)
    }
  }

  const cancelTask = async () => {
    await api.patch(`/tasks/${taskId}/cancel`)
    updateTaskStatus(taskId, 'cancelled')
    navigation.goBack()
  }

  const handleEmergencyStop = () => {
    Alert.alert(
      'Emergency Stop',
      'Immediately terminate any running command on your Mac and stop this task?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: '🛑 Stop Now',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post(`/tasks/${taskId}/emergency-stop`)
              updateTaskStatus(taskId, 'cancelled')
              addLiveEvent(taskId, {
                type: 'error',
                message: '🛑 Emergency stop triggered: active command killed and agent halted.',
              })
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.error ?? err.message)
            }
          },
        },
      ]
    )
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

  const terminalEvents = events.filter((e) =>
    ['command_started', 'command_output', 'command_finished', 'error'].includes(e.event.type)
  )

  const modelName = (task as any)?.ai_model || (task as any)?.model || 'Gemini 3.5 Flash'
  const modelBadgeText = modelName.includes('claude')
    ? '🧠 Claude 3.7'
    : modelName.includes('gpt')
    ? '🌐 GPT-4o'
    : '⚡ Gemini'

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        {/* Status bar header */}
        <View style={styles.statusBar}>
          <View style={styles.statusLeft}>
            <Text style={styles.statusText}>
              Status:{' '}
              <Text style={[styles.statusBadge, { color: STATUS_COLOR[task?.status ?? 'queued'] }]}>
                {task?.status?.toUpperCase() ?? 'LOADING'}
              </Text>
            </Text>
            <View style={styles.modelPill}>
              <Text style={styles.modelPillText}>{modelBadgeText}</Text>
            </View>
          </View>
          {['running', 'waiting_approval', 'testing'].includes(task?.status ?? '') && (
            <TouchableOpacity onPress={handleEmergencyStop} style={styles.emergencyBtn}>
              <Text style={styles.emergencyText}>🛑 Stop</Text>
            </TouchableOpacity>
          )}
          {task?.status === 'queued' && (
            <TouchableOpacity onPress={cancelTask} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'chat' && styles.tabItemActive]}
            onPress={() => setActiveTab('chat')}
          >
            <Text style={[styles.tabText, activeTab === 'chat' && styles.tabTextActive]}>💬 Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'files' && styles.tabItemActive]}
            onPress={() => setActiveTab('files')}
          >
            <Text style={[styles.tabText, activeTab === 'files' && styles.tabTextActive]}>
              📝 Files {files.length > 0 ? `(${files.length})` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'terminal' && styles.tabItemActive]}
            onPress={() => setActiveTab('terminal')}
          >
            <Text style={[styles.tabText, activeTab === 'terminal' && styles.tabTextActive]}>
              ⚡ Terminal {terminalEvents.length > 0 ? `(${terminalEvents.length})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {/* TAB 1: Chat Stream */}
        {activeTab === 'chat' && (
          <>
            <ScrollView
              ref={scrollRef}
              style={styles.eventList}
              contentContainerStyle={styles.eventListContent}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
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
                placeholder="Send follow-up instruction..."
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
          </>
        )}

        {/* TAB 2: Files & Diffs */}
        {activeTab === 'files' && (
          <ScrollView style={styles.eventList} contentContainerStyle={styles.eventListContent}>
            {loadingFiles && files.length === 0 && (
              <ActivityIndicator color="#6c63ff" style={{ marginVertical: 20 }} />
            )}
            {files.length === 0 && !loadingFiles && (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyIcon}>📁</Text>
                <Text style={styles.emptyText}>No files modified by this task yet.</Text>
              </View>
            )}
            {files.map((f, i) => (
              <View key={i} style={styles.fileCard}>
                <View style={styles.fileHeader}>
                  <Text style={styles.filePath} numberOfLines={1}>
                    📄 {f.file_path}
                  </Text>
                  <View
                    style={[
                      styles.actionTag,
                      f.action === 'created'
                        ? styles.actionCreated
                        : f.action === 'deleted'
                        ? styles.actionDeleted
                        : styles.actionModified,
                    ]}
                  >
                    <Text style={styles.actionText}>{f.action.toUpperCase()}</Text>
                  </View>
                </View>
                {f.diff ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.diffBox}>
                    <Text style={styles.diffText}>
                      {f.diff.split('\n').map((line: string, li: number) => {
                        const isAdd = line.startsWith('+') && !line.startsWith('+++')
                        const isDel = line.startsWith('-') && !line.startsWith('---')
                        return (
                          <Text
                            key={li}
                            style={{
                              color: isAdd ? '#4ade80' : isDel ? '#f87171' : '#aaa',
                              backgroundColor: isAdd ? '#063818' : isDel ? '#380a0a' : 'transparent',
                            }}
                          >
                            {line + '\n'}
                          </Text>
                        )
                      })}
                    </Text>
                  </ScrollView>
                ) : (
                  <Text style={styles.noDiffText}>(New file content created)</Text>
                )}
              </View>
            ))}
          </ScrollView>
        )}

        {/* TAB 3: Terminal Outputs */}
        {activeTab === 'terminal' && (
          <ScrollView style={styles.eventList} contentContainerStyle={styles.eventListContent}>
            <View style={styles.terminalBox}>
              <View style={styles.terminalHeader}>
                <View style={styles.terminalDotRed} />
                <View style={styles.terminalDotYellow} />
                <View style={styles.terminalDotGreen} />
                <Text style={styles.terminalTitle}>Laptop Agent Shell</Text>
              </View>
              {terminalEvents.length === 0 ? (
                <Text style={styles.terminalEmpty}>No shell commands run yet for this task.</Text>
              ) : (
                terminalEvents.map((te, i) => (
                  <View key={i} style={styles.terminalLine}>
                    <Text style={styles.terminalLineText}>{te.event.message}</Text>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        )}
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
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusText: { color: '#888', fontSize: 13 },
  statusBadge: { fontWeight: '700' },
  modelPill: {
    backgroundColor: '#24204d',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#4338ca',
  },
  modelPillText: {
    color: '#a5b4fc',
    fontSize: 11,
    fontWeight: '700',
  },
  cancelBtn: {
    backgroundColor: '#2a2a3a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cancelText: { color: '#f87171', fontSize: 13, fontWeight: '600' },
  emergencyBtn: {
    backgroundColor: '#3b1016',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  emergencyText: { color: '#f87171', fontSize: 12, fontWeight: '700' },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#12121a',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3a',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: '#6c63ff',
    backgroundColor: '#161622',
  },
  tabText: {
    color: '#777',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '700',
  },

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

  /* Files & Diffs Styles */
  emptyWrap: {
    alignItems: 'center',
    padding: 40,
    gap: 10,
  },
  emptyIcon: { fontSize: 32 },
  emptyText: { color: '#666', fontSize: 14 },
  fileCard: {
    backgroundColor: '#16161e',
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    overflow: 'hidden',
  },
  fileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#1a1a24',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3a',
  },
  filePath: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    marginRight: 10,
  },
  actionTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  actionText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  actionCreated: { backgroundColor: '#166534' },
  actionModified: { backgroundColor: '#1e40af' },
  actionDeleted: { backgroundColor: '#991b1b' },
  diffBox: {
    padding: 12,
    backgroundColor: '#0a0a0f',
  },
  diffText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    lineHeight: 18,
  },
  noDiffText: {
    padding: 14,
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
  },

  /* Terminal Styles */
  terminalBox: {
    backgroundColor: '#050508',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    overflow: 'hidden',
  },
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#12121a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2d',
    gap: 6,
  },
  terminalDotRed: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444' },
  terminalDotYellow: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#f59e0b' },
  terminalDotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#10b981' },
  terminalTitle: {
    color: '#777',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  terminalEmpty: {
    padding: 24,
    color: '#555',
    fontSize: 12,
    textAlign: 'center',
  },
  terminalLine: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#0f0f18',
  },
  terminalLineText: {
    color: '#a5b4fc',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
})
