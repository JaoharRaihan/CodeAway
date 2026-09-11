import React, { useState, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, RefreshControl, ActivityIndicator,
} from 'react-native'
import api from '../services/api'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/types'

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, any>
  onNewTask?: (params?: { deviceId?: string; projectId?: string }) => void
}

interface ProjectItem {
  _id: string
  name: string
  path: string
  device_id: string
  user_id: string
  created_at: string
}

export default function ProjectsScreen({ navigation, onNewTask }: Props) {
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [devices, setDevices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadData = async () => {
    try {
      const [projRes, devRes] = await Promise.all([
        api.get('/projects'),
        api.get('/devices'),
      ])
      setProjects(projRes.data)
      setDevices(devRes.data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleStartTask = (proj: ProjectItem) => {
    const params = { deviceId: proj.device_id, projectId: proj._id }
    if (onNewTask) {
      onNewTask(params)
    } else {
      navigation.navigate('NewTask', params)
    }
  }

  const renderItem = ({ item }: { item: ProjectItem }) => {
    const matchedDevice = devices.find((d) => d._id === item.device_id)
    const isDeviceOnline = matchedDevice?.status === 'online'
    const dateStr = new Date(item.created_at).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.titleRow}>
            <Text style={styles.folderIcon}>📁</Text>
            <Text style={styles.projectName}>{item.name}</Text>
          </View>
          <Text style={styles.dateText}>{dateStr}</Text>
        </View>

        <View style={styles.pathBox}>
          <Text style={styles.pathText} numberOfLines={2}>
            {item.path}
          </Text>
        </View>

        <View style={styles.footerRow}>
          <View style={styles.deviceTag}>
            <View style={[styles.dot, isDeviceOnline ? styles.dotOnline : styles.dotOffline]} />
            <Text style={styles.deviceNameText}>
              {matchedDevice?.name ?? 'Connected Mac'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.taskBtn, !isDeviceOnline && styles.taskBtnDisabled]}
            onPress={() => handleStartTask(item)}
            activeOpacity={0.8}
          >
            <Text style={styles.taskBtnText}>＋ Start Task</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Projects</Text>
          <Text style={styles.subtitle}>
            Workspaces registered across your Mac agents
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#6c63ff" />
          <Text style={styles.loadingText}>Loading workspaces...</Text>
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                loadData()
              }}
              tintColor="#6c63ff"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📂</Text>
              <Text style={styles.emptyTitle}>No Projects Registered</Text>
              <Text style={styles.emptySubtitle}>
                Projects are automatically detected and synced when you start the CodeAway agent in any directory on your computer.
              </Text>

              <View style={styles.guideBox}>
                <Text style={styles.guideHeader}>Connect a Project from your Mac:</Text>
                <Text style={styles.guideCode}>
                  cd /path/to/your-project{'\n'}codeaway connect
                </Text>
              </View>
            </View>
          }
        />
      )}
    </View>
  )
}

const styles = (StyleSheet as any).create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#888', fontSize: 13 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  title: { fontSize: 24, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 13, color: '#9ca3af', marginTop: 2 },

  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
    gap: 14,
  },
  card: {
    backgroundColor: '#13131c',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e1e2c',
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  folderIcon: { fontSize: 18 },
  projectName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    flexShrink: 1,
  },
  dateText: { fontSize: 12, color: '#6b7280' },

  pathBox: {
    backgroundColor: '#0a0a0f',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e1e2c',
  },
  pathText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#9ca3af',
  },

  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  deviceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOnline: { backgroundColor: '#4ade80' },
  dotOffline: { backgroundColor: '#6b7280' },
  deviceNameText: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '500',
  },

  taskBtn: {
    backgroundColor: '#1e1b4b',
    borderWidth: 1,
    borderColor: '#6c63ff',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  taskBtnDisabled: {
    opacity: 0.6,
  },
  taskBtnText: {
    color: '#a5b4fc',
    fontSize: 12,
    fontWeight: '700',
  },

  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#fff', marginBottom: 8 },
  emptySubtitle: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  guideBox: {
    width: '100%',
    backgroundColor: '#13131c',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222232',
  },
  guideHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#818cf8',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  guideCode: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#34d399',
    backgroundColor: '#0a0a0f',
    padding: 12,
    borderRadius: 8,
    lineHeight: 20,
  },
})
