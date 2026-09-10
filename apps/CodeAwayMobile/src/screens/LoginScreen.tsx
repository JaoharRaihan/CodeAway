import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native'
import { login, register } from '../services/auth'
import { useAuthStore } from '../store/authStore'
import { getServerUrl, setServerUrl } from '../services/api'

export default function LoginScreen() {
  const setUser = useAuthStore((s) => s.setUser)
  const [isRegister, setIsRegister] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showServerConfig, setShowServerConfig] = useState(false)
  const [serverUrl, setCustomServerUrl] = useState('')

  React.useEffect(() => {
    getServerUrl().then(setCustomServerUrl)
  }, [])

  const handleSaveServer = async () => {
    if (!serverUrl.trim()) return
    await setServerUrl(serverUrl)
    Alert.alert('Success', `Backend URL set to:\n${serverUrl.trim()}`)
    setShowServerConfig(false)
  }

  const handleSubmit = async () => {
    if (!email || !password) return Alert.alert('Error', 'Please fill in all fields')
    setLoading(true)
    try {
      const user = isRegister
        ? await register(name, email, password)
        : await login(email, password)
      setUser(user)
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error ?? err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={styles.logoWrap}>
          <Text style={styles.logoIcon}>⚡</Text>
          <Text style={styles.logoText}>CodeAway</Text>
          <Text style={styles.tagline}>Code while you're away</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{isRegister ? 'Create Account' : 'Welcome Back'}</Text>

          {isRegister && (
            <TextInput
              style={styles.input}
              placeholder="Full name"
              placeholderTextColor="#666"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          )}

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#666"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#666"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity style={styles.btn} onPress={handleSubmit} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>{isRegister ? 'Create Account' : 'Login'}</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setIsRegister(!isRegister)} style={styles.switchWrap}>
            <Text style={styles.switchText}>
              {isRegister ? 'Already have an account? ' : "Don't have an account? "}
              <Text style={styles.switchLink}>{isRegister ? 'Login' : 'Register'}</Text>
            </Text>
          </TouchableOpacity>

          {/* Server Config Toggle */}
          <TouchableOpacity
            onPress={() => setShowServerConfig(!showServerConfig)}
            style={styles.serverToggle}
          >
            <Text style={styles.serverToggleText}>
              {showServerConfig ? '▲ Hide Server Settings' : '⚙️ Server Settings (Cloud / Local)'}
            </Text>
          </TouchableOpacity>

          {showServerConfig && (
            <View style={styles.serverBox}>
              <Text style={styles.serverLabel}>Backend API URL (Render / LAN)</Text>
              <TextInput
                style={styles.serverInput}
                placeholder="https://your-backend.onrender.com"
                placeholderTextColor="#666"
                value={serverUrl}
                onChangeText={setCustomServerUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity style={styles.serverSaveBtn} onPress={handleSaveServer}>
                <Text style={styles.serverSaveText}>Save Server URL</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = (StyleSheet as any).create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoWrap: { alignItems: 'center', marginBottom: 40 },
  logoIcon: { fontSize: 56 },
  logoText: { fontSize: 32, fontWeight: '800', color: '#fff', marginTop: 8 },
  tagline: { fontSize: 14, color: '#888', marginTop: 4 },
  card: {
    backgroundColor: '#16161e',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  cardTitle: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 24 },
  input: {
    backgroundColor: '#1e1e2a',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  btn: {
    backgroundColor: '#6c63ff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  switchWrap: { marginTop: 20, alignItems: 'center' },
  switchText: { color: '#888', fontSize: 14 },
  switchLink: { color: '#6c63ff', fontWeight: '600' },
  serverToggle: { marginTop: 24, alignItems: 'center', padding: 8 },
  serverToggleText: { color: '#6c63ff', fontSize: 13, fontWeight: '600' },
  serverBox: {
    marginTop: 10,
    padding: 14,
    backgroundColor: '#111118',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  serverLabel: { color: '#aaa', fontSize: 12, marginBottom: 6 },
  serverInput: {
    backgroundColor: '#1e1e2a',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#3a3a4a',
    marginBottom: 8,
  },
  serverSaveBtn: {
    backgroundColor: '#4ade80',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  serverSaveText: { color: '#000', fontWeight: '700', fontSize: 13 },
})
