import axios from 'axios'
import { getConfig } from './config'

export function createApiClient() {
  const config = getConfig()
  const client = axios.create({
    baseURL: config.apiUrl || 'http://localhost:3001',
    timeout: 15000,
  })

  // Attach JWT token to every request
  client.interceptors.request.use((req) => {
    const token = getConfig().token
    if (token) {
      req.headers.Authorization = `Bearer ${token}`
    }
    return req
  })

  return client
}

export const api = createApiClient()
