import { io, Socket } from 'socket.io-client'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ServerToClientEvents, ClientToServerEvents } from '@codeaway/shared'
import { getServerUrl } from './api'

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null

export async function connectSocket(userId: string): Promise<Socket<ServerToClientEvents, ClientToServerEvents>> {
  if (socket?.connected) return socket

  const serverUrl = await getServerUrl()
  const token = await AsyncStorage.getItem('token')

  socket = io(serverUrl, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 5000,
  }) as Socket<ServerToClientEvents, ClientToServerEvents>

  socket.on('connect', () => {
    console.log('📡 Socket connected')
    socket!.emit('user:join', { userId })
  })

  socket.on('disconnect', () => {
    console.log('📡 Socket disconnected')
  })

  return socket
}

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> | null {
  return socket
}

export function disconnectSocket(): void {
  socket?.disconnect()
  socket = null
}
