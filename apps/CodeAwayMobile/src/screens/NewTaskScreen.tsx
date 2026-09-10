import React, { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native'
import api from '../services/api'
import { useTaskStore } from '../store/taskStore'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import type { RootStackParamList } from '../navigation/types'

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'NewTask'>
  route: RouteProp<RootStackParamList, 'NewTask'>
}

export default function NewTaskScreen({ navigation, route }: Props) {
  const addTask = useTaskStore((s) => s.addTask)
  const [devices, setDevices] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>(route.params?.deviceId ?? '')
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/devices').then((r) => {
      setDevices(r.data)
      if (!selectedDevice && r.data[0]) setSelectedDevice(r.data[0]._id)
    })
  }, [])

  useEffect(() => {
    if (selectedDevice) {
      api.get(`/projects?device_id=${selectedDevice}`).then((r) => {
        setProjects(r.data)
        if (r.data[0]) setSelectedProject(r.data[0]._id)
      })
    }
  }, [selectedDevice])

  const handleRun = async () => {
    if (!prompt.trim()) return Alert.alert('Error', 'Please enter a task description')
    if (!selectedDevice) return Alert.alert('Error', 'Please select a computer')
    if (!selectedProject) return Alert.alert('Error', 'Please select a project')
    setLoading(true)
    try {
      const res = await api.post('/tasks', {
        device_id: selectedDevice,
        project_id: selectedProject,
        prompt: prompt.trim(),
      })
      addTask(res.data)
      navigation.replace('TaskDetail', { taskId: res.data._id })
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error ?? err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>New Task</Text>

        {/* Device picker */}
        <Text style={styles.label}>Computer</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {devices.map((d) => (
            <TouchableOpacity
              key={d._id}
              style={[styles.chip, selectedDevice === d._id && styles.chipActive]}
              onPress={() => setSelectedDevice(d._id)}
            >
              <Text style={[styles.chipText, selectedDevice === d._id && styles.chipTextActive]}>
                {d.status === 'online' ? '🟢' : '🔴'} {d.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Project picker */}
        <Text style={styles.label}>Project</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {projects.map((p) => (
            <TouchableOpacity
              key={p._id}
              style={[styles.chip, selectedProject === p._id && styles.chipActive]}
              onPress={() => setSelectedProject(p._id)}
            >
              <Text style={[styles.chipText, selectedProject === p._id && styles.chipTextActive]}>
                📁 {p.name}
              </Text>
            </TouchableOpacity>
          ))}
          {projects.length === 0 && (
            <Text style={styles.noProject}>No projects — run `codeaway connect` first</Text>
          )}
        </ScrollView>

        {/* Prompt */}
        <Text style={styles.label}>What should I build?</Text>
        <TextInput
          style={styles.promptInput}
          multiline
          numberOfLines={8}
          placeholder="e.g. Add employee attendance tracking screen. Follow existing TypeScript architecture. Run TypeScript checks after."
          placeholderTextColor="#444"
          value={prompt}
          onChangeText={setPrompt}
          textAlignVertical="top"
        />

        <Text style={styles.hint}>💡 Be specific. Mention architecture, style rules, and checks to run.</Text>
      </ScrollView>

      {/* Run button */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.runBtn} onPress={handleRun} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.runBtnText}>🚀 Run Task</Text>}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = (StyleSheet as any).create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  scroll: { padding: 20, paddingBottom: 100 },
  heading: { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 24 },
  label: { fontSize: 11, fontWeight: '700', color: '#555', letterSpacing: 1.1, marginBottom: 10, marginTop: 20 },
  chipRow: { flexDirection: 'row', marginBottom: 4 },
  chip: {
    backgroundColor: '#16161e', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    marginRight: 8, borderWidth: 1, borderColor: '#2a2a3a',
  },
  chipActive: { backgroundColor: '#6c63ff', borderColor: '#6c63ff' },
  chipText: { color: '#888', fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  noProject: { color: '#444', fontSize: 13, paddingVertical: 10 },
  promptInput: {
    backgroundColor: '#16161e', borderRadius: 14, padding: 16,
    color: '#fff', fontSize: 15, lineHeight: 22,
    borderWidth: 1, borderColor: '#2a2a3a', minHeight: 160,
  },
  hint: { color: '#444', fontSize: 12, marginTop: 12, lineHeight: 18 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: '#0a0a0f' },
  runBtn: {
    backgroundColor: '#6c63ff', borderRadius: 16, padding: 18,
    alignItems: 'center',
    shadowColor: '#6c63ff', shadowOpacity: 0.4, shadowRadius: 20, elevation: 8,
  },
  runBtnText: { color: '#fff', fontWeight: '800', fontSize: 17 },
})
