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
  onNewTask?: (params?: { deviceId?: string }) => void
}

interface DeviceItem {
  _id: string
  name: string
  hostname: string
  platform: string
  status: 'online' | 'offline'
  last_heartbeat?: string
  available_models?: Array<{
    id: string
    name: string
    provider: string
    status: 'ready' | 'api_key_required'
  }>
}

export default function DevicesScreen({ navigation, onNewTask }: Props) {
  const [devices, setDevices] = useState<DeviceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadData = async () => {
    try {
      const res = await api.get('/devices')
      setDevices(res.data)
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

  const renderItem = ({ item }: { item: DeviceItem }) => {
    const isOnline = item.status === 'online'
    const lastSeen = item.last_heartbeat
      ? new Date(item.last_heartbeat).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        })
      : null

    return (
      <View style={[styles.card, isOnline && styles.cardOnline]}>
        <View style={styles.cardHeader}>
          <View style={styles.deviceTitleRow}>
            <View style={[styles.dotLarge, isOnline ? styles.dotOnline : styles.dotOffline]} />
            <View>
              <Text style={styles.deviceName}>{item.name}</Text>
              <Text style={styles.hostnameText}>
                {item.hostname} · {item.platform}
              </Text>
            </View>
          </View>
          <View style={[styles.statusPill, isOnline ? styles.statusPillOnline : styles.statusPillOffline]}>
            <Text style={[styles.statusPillText, isOnline ? styles.statusPillTextOnline : styles.statusPillTextOffline]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>

        {lastSeen && (
          <View style={styles.heartbeatRow}>
            <Text style={styles.heartbeatLabel}>Heartbeat:</Text>
            <Text style={styles.heartbeatValue}>
              {isOnline ? `Active (last: ${lastSeen})` : `Last seen ${lastSeen}`}
            </Text>
          </View>
        )}

        {/* Available AI Models */}
        {item.available_models && item.available_models.length > 0 && (
          <View style={styles.modelsContainer}>
            <Text style={styles.modelsLabel}>CONFIGURED AI AGENTS</Text>
            <View style={styles.modelsRow}>
              {item.available_models.map((m) => {
                const isReady = m.status === 'ready'
                return (
                  <View
                    key={m.id}
                    style={[styles.modelChip, isReady ? styles.modelChipReady : styles.modelChipKeyNeeded]}
                  >
                    <Text style={styles.modelChipEmoji}>{isReady ? '✓' : '⚠️'}</Text>
                    <Text style={[styles.modelChipName, isReady ? styles.modelChipNameReady : styles.modelChipNameKeyNeeded]}>
                      {m.name || m.id}
                    </Text>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {isOnline && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => {
              if (onNewTask) onNewTask({ deviceId: item._id })
              else navigation.navigate('NewTask', { deviceId: item._id })
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.actionBtnText}>Run Task on this Mac →</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Computers</Text>
          <Text style={styles.subtitle}>
            {devices.filter((d) => d.status === 'online').length} online of {devices.length} registered
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#6c63ff" />
          <Text style={styles.loadingText}>Discovering machines...</Text>
        </View>
      ) : (
        <FlatList
          data={devices}
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
          ListFooterComponent={
            <View style={styles.guideContainer}>
              <Text style={styles.guideTitle}>⚡ Connect a New Computer</Text>
              <Text style={styles.guideDesc}>
                Run the following commands in the terminal of any Mac or Linux machine where you want CodeAway to write code:
              </Text>
              <View style={styles.codeSnippetBox}>
                <Text style={styles.codeComment}># 1. Install CodeAway globally</Text>
                <Text style={styles.codeText}>npm install -g codeaway</Text>
                <Text style={styles.codeComment}>{'\n'}# 2. Authenticate your terminal</Text>
                <Text style={styles.codeText}>codeaway login</Text>
                <Text style={styles.codeComment}>{'\n'}# 3. Connect as autonomous daemon</Text>
                <Text style={styles.codeText}>codeaway connect</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>💻</Text>
              <Text style={styles.emptyTitle}>No Computers Connected</Text>
              <Text style={styles.emptySubtitle}>
                No execution machine registered to your account yet. Connect your Mac to enable autonomous coding.
              </Text>
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
    gap: 16,
  },
  card: {
    backgroundColor: '#13131c',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1e1e2c',
    gap: 12,
  },
  cardOnline: {
    borderColor: '#232048',
    backgroundColor: '#141322',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deviceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  dotLarge: { width: 10, height: 10, borderRadius: 5 },
  dotOnline: { backgroundColor: '#4ade80', shadowColor: '#4ade80', shadowRadius: 6, shadowOpacity: 0.5 },
  dotOffline: { backgroundColor: '#6b7280' },
  deviceName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  hostnameText: { fontSize: 12, color: '#9ca3af', marginTop: 2 },

  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillOnline: { backgroundColor: '#0d2218' },
  statusPillOffline: { backgroundColor: '#1e1e28' },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  statusPillTextOnline: { color: '#4ade80' },
  statusPillTextOffline: { color: '#9ca3af' },

  heartbeatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
  },
  heartbeatLabel: { fontSize: 11, color: '#6b7280' },
  heartbeatValue: { fontSize: 11, color: '#a5b4fc', fontWeight: '500' },

  modelsContainer: {
    backgroundColor: '#0a0a0f',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e1e2c',
    gap: 8,
  },
  modelsLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6b7280',
    letterSpacing: 0.6,
  },
  modelsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  modelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  modelChipReady: {
    backgroundColor: '#0d2218',
    borderColor: '#166534',
    borderWidth: 1,
  },
  modelChipKeyNeeded: {
    backgroundColor: '#261418',
    borderColor: '#991b1b',
    borderWidth: 1,
  },
  modelChipEmoji: { fontSize: 10 },
  modelChipName: { fontSize: 11, fontWeight: '600' },
  modelChipNameReady: { color: '#4ade80' },
  modelChipNameKeyNeeded: { color: '#f87171' },

  actionBtn: {
    backgroundColor: '#1e1b4b',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6c63ff',
    marginTop: 4,
  },
  actionBtnText: { color: '#a5b4fc', fontSize: 13, fontWeight: '700' },

  guideContainer: {
    backgroundColor: '#13131c',
    borderRadius: 16,
    padding: 18,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#222232',
  },
  guideTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 6 },
  guideDesc: { fontSize: 12, color: '#9ca3af', lineHeight: 18, marginBottom: 14 },
  codeSnippetBox: {
    backgroundColor: '#0a0a0f',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e1e2c',
  },
  codeComment: { fontFamily: 'monospace', fontSize: 11, color: '#6b7280' },
  codeText: { fontFamily: 'monospace', fontSize: 13, color: '#34d399', fontWeight: '600' },

  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyIcon: { fontSize: 40, marginBottom: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 4 },
  emptySubtitle: { fontSize: 12, color: '#9ca3af', textAlign: 'center', maxWidth: 260 },
})
