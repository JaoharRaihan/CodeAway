import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { Task } from '../models/Task'
import { TaskEvent } from '../models/TaskEvent'
import { TaskFile } from '../models/TaskFile'
import { getIO } from '../socket'

const createTaskSchema = z.object({
  device_id: z.string().min(1),
  project_id: z.string().min(1),
  prompt: z.string().min(1).max(4000),
})

const taskRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /tasks — mobile app creates a task
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const body = createTaskSchema.parse(request.body)

    const task = await Task.create({
      user_id: request.user.userId,
      device_id: body.device_id,
      project_id: body.project_id,
      prompt: body.prompt,
      status: 'queued',
    })

    // Push new task to the laptop agent via Socket.IO
    try {
      const io = getIO()
      io.to(`device:${body.device_id}`).emit('task:new', {
        taskId: task.id as string,
        projectId: body.project_id,
        prompt: body.prompt,
        userId: request.user.userId,
      })
    } catch {
      // Agent may be offline — task stays queued
    }

    return reply.status(201).send(task)
  })

  // GET /tasks?project_id=&status=
  fastify.get('/', { onRequest: [fastify.authenticate] }, async (request) => {
    const { project_id, status, device_id } = request.query as {
      project_id?: string
      status?: string
      device_id?: string
    }
    const filter: Record<string, unknown> = { user_id: request.user.userId }
    if (project_id) filter.project_id = project_id
    if (device_id) filter.device_id = device_id
    if (status) filter.status = status
    return Task.find(filter).sort({ created_at: -1 }).limit(50)
  })

  // GET /tasks/:id
  fastify.get('/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const task = await Task.findOne({ _id: id, user_id: request.user.userId })
    if (!task) return reply.status(404).send({ error: 'Task not found' })
    return task
  })

  // GET /tasks/:id/events — full event history
  fastify.get('/:id/events', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const events = await TaskEvent.find({ task_id: id }).sort({ created_at: 1 })
    return events
  })

  // GET /tasks/:id/files — files changed by the agent
  fastify.get('/:id/files', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const files = await TaskFile.find({ task_id: id }).sort({ created_at: 1 })
    return files
  })

  // PATCH /tasks/:id/cancel
  fastify.patch('/:id/cancel', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const task = await Task.findOneAndUpdate(
      { _id: id, user_id: request.user.userId, status: { $in: ['queued', 'running', 'waiting_approval'] } },
      { status: 'cancelled' },
      { new: true }
    )
    if (!task) return reply.status(404).send({ error: 'Task not found or cannot be cancelled' })

    // Notify agent to abort
    try {
      const io = getIO()
      io.to(`device:${task.device_id}`).emit('task:new', {
        taskId: 'CANCELLED',
        projectId: '',
        prompt: '',
        userId: request.user.userId,
      })
    } catch { /* agent offline */ }

    return task
  })

  // POST /tasks/:id/messages — send follow-up message to task
  fastify.post('/:id/messages', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { message } = z.object({ message: z.string().min(1).max(4000) }).parse(request.body)

    const task = await Task.findOne({ _id: id, user_id: request.user.userId })
    if (!task) return reply.status(404).send({ error: 'Task not found' })

    // Record user message in event history
    const taskEvent = await TaskEvent.create({
      task_id: task._id,
      event_type: 'user_message',
      message,
      metadata: { sender: 'user' },
    })

    // Set task back to running
    task.status = 'running'
    await task.save()

    // Notify connected mobile clients
    try {
      const io = getIO()
      io.to(`user:${request.user.userId}`).emit('task:event', {
        taskId: task.id as string,
        event: {
          type: 'user_message',
          message,
          metadata: { sender: 'user' },
        },
      })
      io.to(`user:${request.user.userId}`).emit('task:status_changed', {
        taskId: task.id as string,
        status: 'running',
      })

      // Push follow-up instruction to the laptop agent
      io.to(`device:${task.device_id}`).emit('task:followup', {
        taskId: task.id as string,
        projectId: task.project_id.toString(),
        message,
        userId: request.user.userId,
      })
    } catch {
      // Agent or socket may be offline
    }

    return reply.status(200).send({ ok: true, event: taskEvent })
  })
}

export default taskRoutes
