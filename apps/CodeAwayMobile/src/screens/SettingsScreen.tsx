import React, { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native'
import { useAuthStore } from '../store/authStore'
import { logout } from '../services/auth'
import { getServerUrl, setServerUrl, DEFAULT_API_URL } from '../services/api'
import { connectSocket, disconnectSocket } from '../services/socket'

export default function SettingsScreen() {
  const { user, setUser } = useAuthStore()
  const [currentUrl, setCurrentUrl] = useState('')
  const [inputUrl, setInputUrl] = useState('')
  const [savingUrl, setSavingUrl] = useState(false)

  useEffect(() => {
    getServerUrl().then((url) => {
      setCurrentUrl(url)
      setInputUrl(url)
    })
  }, [])

  const handleSaveUrl = async (urlToSave?: string) => {
    const target = urlToSave || inputUrl
    if (!target.trim()) {
      return Alert.alert('Error', 'Server URL cannot be empty')
    }
    setSavingUrl(true)
    try {
      await setServerUrl(target)
      setCurrentUrl(target)
      setInputUrl(target)
      disconnectSocket()
      if (user?.id) {
        await connectSocket(user.id)
      }
      Alert.alert('Saved', `Server URL updated to:\n${target}\nSocket reconnected.`)
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update server URL')
    } finally {
      setSavingUrl(false)
    }
  }

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out of CodeAway?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            disconnectSocket()
            await logout()
            setUser(null)
          },
        },
      ]
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <Text style={styles.heading}>Settings</Text>

      {/* Account Info Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>ACCOUNT</Text>
        <View style={styles.userRow}>
          <View style={styles.avatarBadge}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase() ?? 'U'}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.name ?? 'Developer'}</Text>
            <Text style={styles.userEmail}>{user?.email ?? 'dev@codeaway.local'}</Text>
          </View>
        </View>
        <View style={styles.idRow}>
          <Text style={styles.idLabel}>User ID:</Text>
          <Text style={styles.idValue}>{user?.id ?? '—'}</Text>
        </View>
      </View>

      {/* Server Endpoint Configuration */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>BACKEND SERVER URL</Text>
        <Text style={styles.cardSubtitle}>
          Direct connection to your CodeAway backend coordinator.
        </Text>

        <TextInput
          style={styles.urlInput}
          value={inputUrl}
          onChangeText={setInputUrl}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://..."
          placeholderTextColor="#6b7280"
        />

        {/* Quick Presets */}
        <View style={styles.presetRow}>
          <TouchableOpacity
            style={[
              styles.presetBtn,
              currentUrl === DEFAULT_API_URL && styles.presetBtnActive,
            ]}
            onPress={() => handleSaveUrl(DEFAULT_API_URL)}
          >
            <Text style={[styles.presetText, currentUrl === DEFAULT_API_URL && styles.presetTextActive]}>
              ☁️ Render Cloud
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.presetBtn,
              currentUrl.includes('localhost') || currentUrl.includes('192.168') || currentUrl.includes('10.0') ? styles.presetBtnActive : null,
            ]}
            onPress={() => setInputUrl('http://192.168.1.100:3001')}
          >
            <Text style={styles.presetText}>🏠 Local LAN</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.saveBtn}
          onPress={() => handleSaveUrl()}
          disabled={savingUrl}
        >
          {savingUrl ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save & Reconnect</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* System Architecture Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>CODEAWAY ARCHITECTURE</Text>
        <View style={styles.archBox}>
          <Text style={styles.archTitle}>📱 Phone (Command Center)</Text>
          <Text style={styles.archDesc}>
            Task creation, real-time token streaming, action timelines, server-authoritative approvals, diff review.
          </Text>
          <Text style={[styles.archTitle, { marginTop: 10 }]}>💻 Mac / PC (Execution Machine)</Text>
          <Text style={styles.archDesc}>
            Autonomous AI agent with workspace security jail, terminal runner, and multi-model support.
          </Text>
        </View>
      </View>

      {/* Logout Button */}
      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={handleLogout}
        activeOpacity={0.8}
      >
        <Text style={styles.logoutBtnText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = (StyleSheet as any).create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  scroll: { padding: 20, paddingBottom: 100, gap: 18 },
  heading: { fontSize: 24, fontWeight: '800', color: '#fff', marginTop: 8 },

  card: {
    backgroundColor: '#13131c',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1e1e2c',
    gap: 12,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6b7280',
    letterSpacing: 0.6,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#9ca3af',
    lineHeight: 16,
  },

  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#6c63ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  userInfo: { flex: 1 },
  userName: { fontSize: 18, fontWeight: '700', color: '#fff' },
  userEmail: { fontSize: 13, color: '#9ca3af', marginTop: 2 },

  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e1e2c',
  },
  idLabel: { fontSize: 11, color: '#6b7280' },
  idValue: { fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' },

  urlInput: {
    backgroundColor: '#0a0a0f',
    borderWidth: 1,
    borderColor: '#222232',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontFamily: 'monospace',
    fontSize: 13,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetBtn: {
    flex: 1,
    backgroundColor: '#1c1b29',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2d2b42',
  },
  presetBtnActive: {
    borderColor: '#6c63ff',
    backgroundColor: '#262347',
  },
  presetText: { fontSize: 12, color: '#9ca3af', fontWeight: '600' },
  presetTextActive: { color: '#a5b4fc', fontWeight: '700' },

  saveBtn: {
    backgroundColor: '#6c63ff',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  archBox: {
    backgroundColor: '#0a0a0f',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e1e2c',
  },
  archTitle: { fontSize: 13, fontWeight: '700', color: '#818cf8' },
  archDesc: { fontSize: 12, color: '#9ca3af', lineHeight: 17, marginTop: 3 },

  logoutBtn: {
    backgroundColor: '#261418',
    borderColor: '#ef4444',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  logoutBtnText: { color: '#ef4444', fontSize: 15, fontWeight: '700' },
})
