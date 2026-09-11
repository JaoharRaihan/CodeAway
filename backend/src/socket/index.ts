import { Server } from 'socket.io'
import { Device } from '../models/Device'
import { Project } from '../models/Project'
import { Task, isValidTaskTransition } from '../models/Task'
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
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 20000,
  })

  _io!.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`)

    // ── Mobile client joins its personal room ─────────────────────────────
    socket.on('user:join', ({ userId }) => {
      socket.join(`user:${userId}`)
      console.log(`📱 User ${userId} joined room`)
    })

    // ── Laptop agent registers itself ─────────────────────────────────────
    socket.on('agent:connect', async (payload: any) => {
      const { deviceId, availableModels, currentProject, workspacePath, workspaces, version } = payload
      socket.join(`device:${deviceId}`)
      const update: Record<string, unknown> = {
        status: 'online',
        socket_id: socket.id,
        last_seen_at: new Date(),
      }
      if (availableModels) update.available_models = availableModels
      if (currentProject) update.current_project = currentProject
      if (version) update.agent_version = version

      const device = await Device.findByIdAndUpdate(deviceId, update, { new: true })
      console.log(`💻 Agent connected — device: ${deviceId} (${currentProject || 'no project'})`)

      // Auto-register real project workspaces in MongoDB
      if (device) {
        const workspaceList: Array<{ name: string; path: string }> = []
        if (Array.isArray(workspaces) && workspaces.length > 0) {
          workspaceList.push(...workspaces)
        } else if (currentProject) {
          workspaceList.push({ name: currentProject, path: workspacePath || currentProject })
        }

        for (const ws of workspaceList) {
          if (ws.name && ws.path) {
            await Project.findOneAndUpdate(
              { device_id: deviceId, name: ws.name },
              {
                user_id: device.user_id,
                device_id: deviceId,
                name: ws.name,
                path: ws.path,
              },
              { upsert: true, new: true }
            )
          }
        }
      }
    })

    // ── Heartbeat ─────────────────────────────────────────────────────────
    socket.on('agent:heartbeat', async (payload: any) => {
      const { deviceId, availableModels, currentProject, version } = payload
      const update: Record<string, unknown> = { last_seen_at: new Date() }
      if (availableModels) update.available_models = availableModels
      if (currentProject) update.current_project = currentProject
      if (version) update.agent_version = version

      await Device.findByIdAndUpdate(deviceId, update)
    })

    // ── AI progress event from agent → forward to phone ───────────────────
    socket.on('task:event:emit', async ({ taskId, userId, event }) => {
      // Persist
      const saved = await TaskEvent.create({
        task_id: taskId,
        event_type: event.type,
        message: event.message,
        metadata: event.metadata,
      })
      // Broadcast with persistent id for client idempotency
      _io!.to(`user:${userId}`).emit('task:event', {
        taskId,
        event: {
          ...event,
          id: saved.id as string,
        },
      })
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

    // ── Daemon status acknowledgement (confirmed stop, pause, resume) ────
    socket.on('task:status:ack', async ({ taskId, userId, status, message }) => {
      const task = await Task.findById(taskId)
      if (task && isValidTaskTransition(task.status, status)) {
        await Task.findByIdAndUpdate(taskId, { status })
        if (message) {
          const saved = await TaskEvent.create({
            task_id: taskId,
            event_type: status === 'stopped' ? 'error' : 'assistant_message',
            message,
          })
          _io!.to(`user:${userId}`).emit('task:status_changed', { taskId, status, message })
          _io!.to(`user:${userId}`).emit('task:event', {
            taskId,
            event: {
              id: saved.id as string,
              type: status === 'stopped' ? 'error' : 'assistant_message',
              message,
            },
          })
        }
      }
    })

    // ── Disconnect — mark device offline and fail interrupted tasks ───────
    socket.on('disconnect', async () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`)
      const device = await Device.findOneAndUpdate(
        { socket_id: socket.id },
        { status: 'offline', socket_id: null }
      )
      if (device) {
        // Detect tasks that were running on this device and fail them safely
        const interruptedTasks = await Task.find({
          device_id: device._id,
          status: { $in: ['running', 'waiting_approval', 'testing'] },
        })

        for (const t of interruptedTasks) {
          t.status = 'failed'
          t.error = 'Mac agent disconnected while this task was running.'
          await t.save()

          const eventMsg = '⚠️ Your Mac agent disconnected while this task was running.'
          const saved = await TaskEvent.create({
            task_id: t._id,
            event_type: 'error',
            message: eventMsg,
          })

          _io!.to(`user:${t.user_id}`).emit('task:status_changed', {
            taskId: t.id,
            status: 'failed',
            message: eventMsg,
          })
          _io!.to(`user:${t.user_id}`).emit('task:event', {
            taskId: t.id,
            event: { id: saved.id as string, type: 'error', message: eventMsg },
          })
        }
      }
    })
  })

  return _io
}
