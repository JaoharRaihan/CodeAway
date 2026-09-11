import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, StatusBar, Platform,
} from 'react-native'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import { useTaskStore } from '../store/taskStore'
import { logout } from '../services/auth'
import { connectSocket } from '../services/socket'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/types'

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, any>
  onSwitchTab?: (tab: any) => void
  onNewTask?: (params?: { deviceId?: string }) => void
}

const STATUS_CONFIG: Record<string, { emoji: string; label: string; bg: string; color: string }> = {
  queued: { emoji: '⏳', label: 'Queued', bg: '#1f1e2c', color: '#a09ff5' },
  running: { emoji: '🔄', label: 'Running', bg: '#1a183b', color: '#818cf8' },
  waiting_approval: { emoji: '⚠️', label: 'Needs Approval', bg: '#2b2316', color: '#fbbf24' },
  completed: { emoji: '✅', label: 'Completed', bg: '#0d2218', color: '#4ade80' },
  failed: { emoji: '❌', label: 'Failed', bg: '#261418', color: '#f87171' },
  cancelled: { emoji: '🚫', label: 'Cancelled', bg: '#1e1e28', color: '#9ca3af' },
}

export default function HomeScreen({ navigation, onSwitchTab, onNewTask }: Props) {
  const { user, setUser } = useAuthStore()
  const { tasks, setTasks, updateTaskStatus, addLiveEvent } = useTaskStore()
  const [devices, setDevices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadData = async () => {
    try {
      const [tasksRes, devicesRes] = await Promise.all([
        api.get('/tasks'),
        api.get('/devices'),
      ])
      setTasks(tasksRes.data)
      setDevices(devicesRes.data)
    } catch { /* ignore */ }
    finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
    // Connect socket for real-time
    if (user) {
      connectSocket(user.id).then((socket) => {
        socket.on('task:status_changed', ({ taskId, status }) => {
          updateTaskStatus(taskId, status)
        })
        socket.on('task:event', ({ taskId, event }) => {
          addLiveEvent(taskId, event)
        })
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogout = async () => {
    await logout()
    setUser(null)
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6c63ff" />
        <Text style={styles.loadingText}>Syncing CodeAway...</Text>
      </View>
    )
  }

  const onlineDevices = devices.filter((d) => d.status === 'online')
  const activeTasksCount = tasks.filter((t) => t.status === 'running' || t.status === 'waiting_approval').length
  const activeTask = tasks.find((t) => t.status === 'running' || t.status === 'waiting_approval')

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning ☀️'
    if (hour < 18) return 'Good afternoon 🌤️'
    return 'Good evening 🌙'
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadData() }}
            tintColor="#6c63ff"
          />
        }
      >
        {/* Header with User Info & Logout */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatarBadge}>
              <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase() ?? 'U'}</Text>
            </View>
            <View>
              <Text style={styles.greeting}>{getGreeting()}</Text>
              <Text style={styles.userName}>{user?.name ?? 'Developer'}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} activeOpacity={0.7}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Stats Summary Banner */}
        <View style={styles.bannerCard}>
          <TouchableOpacity
            style={styles.bannerItem}
            onPress={() => onSwitchTab && onSwitchTab('devices')}
            activeOpacity={0.7}
          >
            <Text style={styles.bannerNumber}>{devices.length}</Text>
            <Text style={styles.bannerLabel}>Connected PCs</Text>
          </TouchableOpacity>
          <View style={styles.bannerDivider} />
          <TouchableOpacity
            style={styles.bannerItem}
            onPress={() => onSwitchTab && onSwitchTab('tasks')}
            activeOpacity={0.7}
          >
            <Text style={[styles.bannerNumber, activeTasksCount > 0 && { color: '#818cf8' }]}>
              {activeTasksCount}
            </Text>
            <Text style={styles.bannerLabel}>Active Tasks</Text>
          </TouchableOpacity>
          <View style={styles.bannerDivider} />
          <TouchableOpacity
            style={styles.bannerItem}
            onPress={() => onSwitchTab && onSwitchTab('tasks')}
            activeOpacity={0.7}
          >
            <Text style={styles.bannerNumber}>{tasks.length}</Text>
            <Text style={styles.bannerLabel}>Total Tasks</Text>
          </TouchableOpacity>
        </View>

        {/* Active Task Hero Card */}
        {activeTask && (
          <TouchableOpacity
            style={styles.activeTaskHero}
            onPress={() => navigation.navigate('TaskDetail', { taskId: activeTask._id })}
            activeOpacity={0.85}
          >
            <View style={styles.activeTaskTop}>
              <View style={styles.activePill}>
                <Text style={styles.activePillDot}>🟢</Text>
                <Text style={styles.activePillText}>
                  {activeTask.status === 'waiting_approval' ? 'APPROVAL NEEDED' : 'AGENT WORKING'}
                </Text>
              </View>
              <Text style={styles.activeTaskJump}>Live Session →</Text>
            </View>
            <Text style={styles.activeTaskPrompt} numberOfLines={2}>
              {activeTask.prompt}
            </Text>
            <Text style={styles.activeTaskSub}>
              {activeTask.status === 'waiting_approval'
                ? '⚠️ Waiting for your review in task timeline'
                : '⚡ Autonomous agent is analyzing code and executing changes...'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Computers Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>YOUR COMPUTERS</Text>
          <View style={styles.onlineBadgeCount}>
            <View style={[styles.dot, onlineDevices.length > 0 ? styles.dotOnline : styles.dotOffline]} />
            <Text style={styles.onlineBadgeText}>{onlineDevices.length} online</Text>
          </View>
        </View>

        {devices.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>💻</Text>
            <Text style={styles.emptyText}>No computers connected yet</Text>
            <Text style={styles.emptyHint}>Run <Text style={styles.codeSnippet}>codeaway connect</Text> in your laptop terminal</Text>
          </View>
        ) : (
          devices.map((device) => {
            const isOnline = device.status === 'online'
            return (
              <View key={device._id} style={[styles.deviceCard, isOnline && styles.deviceCardOnline]}>
                <View style={[styles.dotLarge, isOnline ? styles.dotOnline : styles.dotOffline]} />
                <View style={styles.deviceInfo}>
                  <View style={styles.deviceNameRow}>
                    <Text style={styles.deviceName}>{device.name}</Text>
                    <View style={[styles.statusPill, isOnline ? styles.statusPillOnline : styles.statusPillOffline]}>
                      <Text style={[styles.statusPillText, isOnline ? styles.statusPillTextOnline : styles.statusPillTextOffline]}>
                        {isOnline ? 'Online' : 'Offline'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.deviceSub}>{device.hostname} · <Text style={styles.platformText}>{device.platform}</Text></Text>
                </View>
              </View>
            )
          })
        )}

        {/* Recent Tasks Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>RECENT TASKS</Text>
          {tasks.length > 0 && (
            <TouchableOpacity onPress={() => navigation.navigate('NewTask', { deviceId: onlineDevices[0]?._id })}>
              <Text style={styles.seeAllText}>+ New Task</Text>
            </TouchableOpacity>
          )}
        </View>

        {tasks.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🚀</Text>
            <Text style={styles.emptyText}>No tasks created yet</Text>
            <Text style={styles.emptyHint}>Tap "＋ New Task" below to ask your AI agent to write code</Text>
            <TouchableOpacity
              style={styles.emptyActionBtn}
              onPress={() => navigation.navigate('NewTask', { deviceId: onlineDevices[0]?._id })}
            >
              <Text style={styles.emptyActionText}>Start Your First Task</Text>
            </TouchableOpacity>
          </View>
        ) : (
          tasks.slice(0, 15).map((task) => {
            const cfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.queued
            const dateStr = new Date(task.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            return (
              <TouchableOpacity
                key={task._id}
                style={styles.taskCard}
                onPress={() => navigation.navigate('TaskDetail', { taskId: task._id })}
                activeOpacity={0.75}
              >
                <View style={styles.taskTopRow}>
                  <View style={[styles.taskStatusTag, { backgroundColor: cfg.bg }]}>
                    <Text style={styles.taskEmoji}>{cfg.emoji}</Text>
                    <Text style={[styles.taskStatusText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                  <Text style={styles.taskDate}>{dateStr}</Text>
                </View>
                <Text style={styles.taskPrompt} numberOfLines={2}>{task.prompt}</Text>
                <View style={styles.taskFooterRow}>
                  <Text style={styles.tapToView}>Tap to view agent stream & actions →</Text>
                </View>
              </TouchableOpacity>
            )
          })
        )}
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('NewTask', { deviceId: onlineDevices[0]?._id })}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>＋</Text>
        <Text style={styles.fabText}>New Task</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = (StyleSheet as any).create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0f', gap: 16 },
  loadingText: { color: '#888', fontSize: 14, fontWeight: '500' },
  scroll: { padding: 20, paddingBottom: 120 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 22,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#6c63ff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6c63ff',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 4,
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  greeting: { fontSize: 13, color: '#888', fontWeight: '500' },
  userName: { fontSize: 20, fontWeight: '800', color: '#fff', marginTop: 1 },
  logoutBtn: {
    backgroundColor: '#16161e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  logoutText: { color: '#9ca3af', fontSize: 13, fontWeight: '600' },

  // Summary Banner
  bannerCard: {
    flexDirection: 'row',
    backgroundColor: '#13131c',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: '#222232',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  bannerItem: {
    alignItems: 'center',
    flex: 1,
  },
  bannerNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 2,
  },
  bannerLabel: {
    fontSize: 11,
    color: '#777',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  bannerDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#222232',
  },

  // Active Task Hero Banner
  activeTaskHero: {
    backgroundColor: '#16132e',
    borderRadius: 16,
    padding: 18,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#4338ca',
    shadowColor: '#6c63ff',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
    gap: 8,
  },
  activeTaskTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1b4b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
  },
  activePillDot: { fontSize: 10 },
  activePillText: { fontSize: 11, fontWeight: '800', color: '#a5b4fc', letterSpacing: 0.5 },
  activeTaskJump: { fontSize: 12, fontWeight: '700', color: '#818cf8' },
  activeTaskPrompt: { fontSize: 15, fontWeight: '700', color: '#fff', lineHeight: 21 },
  activeTaskSub: { fontSize: 12, color: '#9ca3af', lineHeight: 16 },


  // Sections
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    letterSpacing: 1.4,
  },
  onlineBadgeCount: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#13131c',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222232',
  },
  onlineBadgeText: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '600',
  },
  seeAllText: {
    fontSize: 12,
    color: '#818cf8',
    fontWeight: '700',
  },

  // Devices
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#13131c',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222232',
  },
  deviceCardOnline: {
    borderColor: '#1e3a29',
    backgroundColor: '#131818',
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  dotLarge: { width: 12, height: 12, borderRadius: 6, marginRight: 16 },
  dotOnline: { backgroundColor: '#4ade80', shadowColor: '#4ade80', shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
  dotOffline: { backgroundColor: '#f87171' },
  deviceInfo: { flex: 1 },
  deviceNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  deviceName: { color: '#fff', fontWeight: '700', fontSize: 16 },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusPillOnline: { backgroundColor: '#0d2218' },
  statusPillOffline: { backgroundColor: '#261418' },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  statusPillTextOnline: { color: '#4ade80' },
  statusPillTextOffline: { color: '#f87171' },
  deviceSub: { color: '#888', fontSize: 12 },
  platformText: { color: '#aaa', textTransform: 'capitalize' },

  // Tasks
  taskCard: {
    backgroundColor: '#13131c',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222232',
  },
  taskTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  taskStatusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 6,
  },
  taskEmoji: { fontSize: 13 },
  taskStatusText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  taskDate: { color: '#666', fontSize: 11, fontWeight: '500' },
  taskPrompt: { color: '#f3f4f6', fontSize: 15, fontWeight: '600', lineHeight: 22, marginBottom: 10 },
  taskFooterRow: {
    borderTopWidth: 1,
    borderTopColor: '#1e1e2d',
    paddingTop: 10,
    marginTop: 2,
  },
  tapToView: { color: '#818cf8', fontSize: 12, fontWeight: '600' },

  // Empty States
  emptyCard: {
    backgroundColor: '#13131c',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222232',
    marginBottom: 12,
  },
  emptyIcon: { fontSize: 36, marginBottom: 12 },
  emptyText: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  emptyHint: { color: '#888', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  codeSnippet: { color: '#818cf8', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  emptyActionBtn: {
    marginTop: 18,
    backgroundColor: '#6c63ff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#6c63ff',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 4,
  },
  emptyActionText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6c63ff',
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 15,
    shadowColor: '#6c63ff',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 10,
    gap: 8,
  },
  fabIcon: { color: '#fff', fontSize: 18, fontWeight: '900' },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 15 },
})
