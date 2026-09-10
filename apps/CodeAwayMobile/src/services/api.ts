import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const DEFAULT_API_URL = 'https://codeaway-backend-fp72.onrender.com'

export const api = axios.create({
  baseURL: DEFAULT_API_URL,
  timeout: 15000,
})

// Dynamically set baseURL and attach stored JWT to every request
api.interceptors.request.use(async (config) => {
  const customUrl = await AsyncStorage.getItem('server_url')
  if (customUrl) {
    config.baseURL = customUrl
  }
  const token = await AsyncStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export async function getServerUrl(): Promise<string> {
  const saved = await AsyncStorage.getItem('server_url')
  return saved || DEFAULT_API_URL
}

export async function setServerUrl(url: string): Promise<void> {
  const clean = url.trim().replace(/\/$/, '')
  await AsyncStorage.setItem('server_url', clean)
  api.defaults.baseURL = clean
}

export default api
