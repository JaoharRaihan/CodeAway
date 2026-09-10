import { Server } from 'socket.io'
import { Device } from '../models/Device'
import { Task } from '../models/Task'
import { TaskEvent } from '../models/TaskEvent'
import { TaskFile } from '../models/TaskFile'

// Module-level singleton — import getIO() in routes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _io: Server | null = null

export function getIO(): Server {
  if (!_io) throw new Error('Socket.IO not initialised yet')
  return _io
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function initSocket(httpServer: any): Server {
  _io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  })

  _io!.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`)

    // ── Mobile client joins its personal room ─────────────────────────────
    socket.on('user:join', ({ userId }) => {
      socket.join(`user:${userId}`)
      console.log(`📱 User ${userId} joined room`)
    })

    // ── Laptop agent registers itself ─────────────────────────────────────
    socket.on('agent:connect', async ({ deviceId }) => {
      socket.join(`device:${deviceId}`)
      await Device.findByIdAndUpdate(deviceId, {
        status: 'online',
        socket_id: socket.id,
        last_seen_at: new Date(),
      })
      console.log(`💻 Agent connected — device: ${deviceId}`)
    })

    // ── Heartbeat ─────────────────────────────────────────────────────────
    socket.on('agent:heartbeat', async ({ deviceId }) => {
      await Device.findByIdAndUpdate(deviceId, { last_seen_at: new Date() })
    })

    // ── AI progress event from agent → forward to phone ───────────────────
    socket.on('task:event:emit', async ({ taskId, userId, event }) => {
      // Persist
      await TaskEvent.create({
        task_id: taskId,
        event_type: event.type,
        message: event.message,
        metadata: event.metadata,
      })
      // Broadcast
      _io!.to(`user:${userId}`).emit('task:event', { taskId, event })
    })

    // ── Task completed ────────────────────────────────────────────────────
    socket.on('task:complete', async ({ taskId, userId, result, files }) => {
      // Persist files
      if (files?.length) {
        await TaskFile.insertMany(
          files.map((f: { file_path: string; action: string; diff?: string }) => ({
            task_id: taskId,
            file_path: f.file_path,
            action: f.action,
            diff: f.diff,
          }))
        )
      }

      await Task.findByIdAndUpdate(taskId, {
        status: 'completed',
        result,
        completed_at: new Date(),
      })

      _io!.to(`user:${userId}`).emit('task:completed', { taskId, result, files })
    })

    // ── Approval request from agent ───────────────────────────────────────
    socket.on('approval:request', async ({ taskId, userId, approvalId, command, reason }) => {
      await Task.findByIdAndUpdate(taskId, { status: 'waiting_approval' })
      _io!.to(`user:${userId}`).emit('approval:required', {
        taskId,
        approvalId,
        command,
        reason,
      })
    })

    // ── Disconnect — mark device offline ─────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`)
      await Device.findOneAndUpdate(
        { socket_id: socket.id },
        { status: 'offline', socket_id: null }
      )
    })
  })

  return _io
}
