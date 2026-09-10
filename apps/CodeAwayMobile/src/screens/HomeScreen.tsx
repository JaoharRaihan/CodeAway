import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import { useTaskStore } from '../store/taskStore'
import { logout } from '../services/auth'
import { connectSocket } from '../services/socket'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/types'

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Home'> }

const STATUS_EMOJI: Record<string, string> = {
  queued: '⏳',
  running: '🔄',
  waiting_approval: '⚠️',
  completed: '✅',
  failed: '❌',
  cancelled: '🚫',
}

export default function HomeScreen({ navigation }: Props) {
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
      </View>
    )
  }

  const onlineDevices = devices.filter((d) => d.status === 'online')

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData() }} tintColor="#6c63ff" />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good morning 👋</Text>
            <Text style={styles.userName}>{user?.name}</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Computers */}
        <Text style={styles.sectionTitle}>YOUR COMPUTERS</Text>
        {devices.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No computers connected yet</Text>
            <Text style={styles.emptyHint}>Run `codeaway connect` on your laptop</Text>
          </View>
        ) : (
          devices.map((device) => (
            <View key={device._id} style={styles.deviceCard}>
              <View style={[styles.dot, device.status === 'online' ? styles.dotOnline : styles.dotOffline]} />
              <View style={styles.deviceStatusFlex}>
                <Text style={styles.deviceName}>{device.name}</Text>
                <Text style={styles.deviceSub}>{device.hostname} · {device.platform}</Text>
              </View>
              <Text style={styles.deviceStatus}>{device.status === 'online' ? '🟢 Online' : '🔴 Offline'}</Text>
            </View>
          ))
        )}

        {/* Recent Tasks */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>RECENT TASKS</Text>
        </View>

        {tasks.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No tasks yet</Text>
            <Text style={styles.emptyHint}>Tap + New Task to get started</Text>
          </View>
        ) : (
          tasks.slice(0, 10).map((task) => (
            <TouchableOpacity
              key={task._id}
              style={styles.taskCard}
              onPress={() => navigation.navigate('TaskDetail', { taskId: task._id })}
            >
              <Text style={styles.taskEmoji}>{STATUS_EMOJI[task.status] ?? '⏳'}</Text>
              <View style={styles.deviceStatusFlex}>
                <Text style={styles.taskPrompt} numberOfLines={2}>{task.prompt}</Text>
                <Text style={styles.taskDate}>{new Date(task.created_at).toLocaleDateString()}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('NewTask', { deviceId: onlineDevices[0]?._id })}
      >
        <Text style={styles.fabText}>＋ New Task</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = (StyleSheet as any).create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0f' },
  scroll: { padding: 20, paddingBottom: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  greeting: { fontSize: 14, color: '#888' },
  userName: { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 2 },
  logoutBtn: { backgroundColor: '#1e1e2a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  logoutText: { color: '#888', fontSize: 13 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#555', letterSpacing: 1.2, marginBottom: 12 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 12 },
  deviceCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#16161e', borderRadius: 14, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: '#2a2a3a',
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  dotOnline: { backgroundColor: '#4ade80' },
  dotOffline: { backgroundColor: '#f87171' },
  deviceName: { color: '#fff', fontWeight: '600', fontSize: 15 },
  deviceSub: { color: '#666', fontSize: 12, marginTop: 2 },
  deviceStatus: { color: '#888', fontSize: 12 },
  taskCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#16161e', borderRadius: 14, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: '#2a2a3a',
  },
  taskEmoji: { fontSize: 20, marginRight: 12, marginTop: 2 },
  taskPrompt: { color: '#fff', fontSize: 14, fontWeight: '500', lineHeight: 20 },
  taskDate: { color: '#555', fontSize: 12, marginTop: 4 },
  deviceStatusFlex: { flex: 1 },
  emptyCard: {
    backgroundColor: '#16161e', borderRadius: 14, padding: 24,
    alignItems: 'center', borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 10,
  },
  emptyText: { color: '#666', fontSize: 14, fontWeight: '500' },
  emptyHint: { color: '#444', fontSize: 12, marginTop: 6 },
  fab: {
    position: 'absolute', bottom: 32, right: 20,
    backgroundColor: '#6c63ff', borderRadius: 28,
    paddingHorizontal: 24, paddingVertical: 14,
    shadowColor: '#6c63ff', shadowOpacity: 0.5, shadowRadius: 16, elevation: 8,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
