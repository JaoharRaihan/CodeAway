import React, { useState, useMemo } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, RefreshControl, ActivityIndicator,
} from 'react-native'
import api from '../services/api'
import { useTaskStore, Task } from '../store/taskStore'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/types'

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, any>
  onNewTask?: () => void
}

type FilterTab = 'all' | 'active' | 'completed' | 'failed'

const STATUS_CONFIG: Record<string, { emoji: string; label: string; bg: string; color: string }> = {
  queued: { emoji: '⏳', label: 'Queued', bg: '#1f1e2c', color: '#a09ff5' },
  running: { emoji: '🔄', label: 'Running', bg: '#1a183b', color: '#818cf8' },
  waiting_approval: { emoji: '⚠️', label: 'Needs Approval', bg: '#2b2316', color: '#fbbf24' },
  completed: { emoji: '✅', label: 'Completed', bg: '#0d2218', color: '#4ade80' },
  failed: { emoji: '❌', label: 'Failed', bg: '#261418', color: '#f87171' },
  cancelled: { emoji: '🚫', label: 'Cancelled', bg: '#1e1e28', color: '#9ca3af' },
}

export default function TasksScreen({ navigation, onNewTask }: Props) {
  const { tasks, setTasks } = useTaskStore()
  const [filter, setFilter] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const res = await api.get('/tasks')
      setTasks(res.data)
    } catch {
      // keep existing tasks on error
    } finally {
      setRefreshing(false)
    }
  }

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Filter by status tab
      if (filter === 'active') {
        if (t.status !== 'running' && t.status !== 'waiting_approval' && t.status !== 'queued') return false
      } else if (filter === 'completed') {
        if (t.status !== 'completed') return false
      } else if (filter === 'failed') {
        if (t.status !== 'failed' && t.status !== 'cancelled') return false
      }

      // Filter by search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const promptMatch = t.prompt?.toLowerCase().includes(q)
        const idMatch = t._id?.toLowerCase().includes(q)
        return promptMatch || idMatch
      }

      return true
    })
  }, [tasks, filter, searchQuery])

  const counts = useMemo(() => {
    let active = 0
    let completed = 0
    let failed = 0
    for (const t of tasks) {
      if (t.status === 'running' || t.status === 'waiting_approval' || t.status === 'queued') active++
      else if (t.status === 'completed') completed++
      else if (t.status === 'failed' || t.status === 'cancelled') failed++
    }
    return { all: tasks.length, active, completed, failed }
  }, [tasks])

  const renderItem = ({ item }: { item: Task }) => {
    const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.queued
    const dateStr = new Date(item.created_at).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('TaskDetail', { taskId: item._id })}
        activeOpacity={0.75}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            <Text style={styles.statusEmoji}>{cfg.emoji}</Text>
            <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <Text style={styles.timestamp}>{dateStr}</Text>
        </View>

        <Text style={styles.promptText} numberOfLines={3}>
          {item.prompt}
        </Text>

        <View style={styles.cardFooter}>
          <Text style={styles.taskIdText}>ID: {item._id.slice(-6)}</Text>
          <Text style={styles.viewTimeline}>View stream →</Text>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Tasks</Text>
          <Text style={styles.subtitle}>
            {tasks.length} total · {counts.active} active
          </Text>
        </View>
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => {
            if (onNewTask) onNewTask()
            else navigation.navigate('NewTask', {})
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.newBtnText}>＋ New</Text>
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search tasks..."
          placeholderTextColor="#6b7280"
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(
          [
            { id: 'all', label: 'All', count: counts.all },
            { id: 'active', label: 'Active', count: counts.active },
            { id: 'completed', label: 'Completed', count: counts.completed },
            { id: 'failed', label: 'Failed', count: counts.failed },
          ] as const
        ).map((f) => {
          const isActive = filter === f.id
          return (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterPill, isActive && styles.filterPillActive]}
              onPress={() => setFilter(f.id)}
            >
              <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                {f.label}
              </Text>
              <View style={[styles.filterCountBadge, isActive && styles.filterCountBadgeActive]}>
                <Text style={[styles.filterCountText, isActive && styles.filterCountTextActive]}>
                  {f.count}
                </Text>
              </View>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Task List */}
      <FlatList
        data={filteredTasks}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#6c63ff"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>
              {searchQuery ? 'No matching tasks' : 'No tasks in this view'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? `No tasks match "${searchQuery}"`
                : 'Tasks triggered from your mobile or CLI will appear here in real time.'}
            </Text>
            {!searchQuery && (
              <TouchableOpacity
                style={styles.emptyActionBtn}
                onPress={() => {
                  if (onNewTask) onNewTask()
                  else navigation.navigate('NewTask', {})
                }}
              >
                <Text style={styles.emptyActionBtnText}>Start a New Task</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
    </View>
  )
}

const styles = (StyleSheet as any).create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: { fontSize: 24, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  newBtn: {
    backgroundColor: '#6c63ff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: '#6c63ff',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  newBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#13131c',
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#222232',
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: {
    flex: 1,
    height: 40,
    color: '#fff',
    fontSize: 14,
  },
  clearBtn: { padding: 6 },
  clearBtnText: { color: '#6b7280', fontSize: 12 },

  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#13131c',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222232',
    gap: 6,
  },
  filterPillActive: {
    backgroundColor: '#1e1b4b',
    borderColor: '#6c63ff',
  },
  filterPillText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: '#a5b4fc',
    fontWeight: '700',
  },
  filterCountBadge: {
    backgroundColor: '#1f1e2c',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  filterCountBadgeActive: {
    backgroundColor: '#312e81',
  },
  filterCountText: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '700',
  },
  filterCountTextActive: {
    color: '#c7d2fe',
  },

  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
    gap: 12,
  },
  card: {
    backgroundColor: '#13131c',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e1e2c',
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 5,
  },
  statusEmoji: { fontSize: 11 },
  statusLabel: { fontSize: 12, fontWeight: '700' },
  timestamp: { fontSize: 12, color: '#6b7280' },

  promptText: {
    fontSize: 14,
    color: '#e5e7eb',
    lineHeight: 20,
    fontWeight: '500',
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#1a1a26',
  },
  taskIdText: {
    fontSize: 11,
    color: '#6b7280',
    fontFamily: 'monospace',
  },
  viewTimeline: {
    fontSize: 12,
    color: '#818cf8',
    fontWeight: '600',
  },

  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: '#9ca3af', textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  emptyActionBtn: {
    backgroundColor: '#6c63ff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyActionBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
})
