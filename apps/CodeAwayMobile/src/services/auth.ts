import AsyncStorage from '@react-native-async-storage/async-storage'
import api from './api'

export interface AuthUser {
  id: string
  email: string
  name: string
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await api.post('/auth/login', { email, password })
  const { token, user } = res.data
  await AsyncStorage.setItem('token', token)
  await AsyncStorage.setItem('user', JSON.stringify(user))
  return user
}

export async function register(name: string, email: string, password: string): Promise<AuthUser> {
  const res = await api.post('/auth/register', { name, email, password })
  const { token, user } = res.data
  await AsyncStorage.setItem('token', token)
  await AsyncStorage.setItem('user', JSON.stringify(user))
  return user
}

export async function logout(): Promise<void> {
  await AsyncStorage.removeItem('token')
  await AsyncStorage.removeItem('user')
}

export async function getStoredUser(): Promise<AuthUser | null> {
  const raw = await AsyncStorage.getItem('user')
  return raw ? JSON.parse(raw) : null
}
