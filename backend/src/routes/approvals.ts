import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { Approval } from '../models/Approval'
import { Task } from '../models/Task'
import { getIO } from '../socket'

const respondSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
})

const approvalRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /approvals?task_id=xxx
  fastify.get('/', { onRequest: [fastify.authenticate] }, async (request) => {
    const { task_id } = request.query as { task_id?: string }
    if (task_id) {
      const task = await Task.findOne({ _id: task_id, user_id: request.user.userId })
      if (!task) return []
      return Approval.find({ task_id }).sort({ created_at: -1 })
    }

    const userTasks = await Task.find({ user_id: request.user.userId }).select('_id')
    const taskIds = userTasks.map((t) => t._id)
    return Approval.find({ task_id: { $in: taskIds } }).sort({ created_at: -1 })
  })

  // POST /approvals — laptop agent creates an approval request
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { task_id, command, reason } = request.body as {
      task_id: string
      command: string
      reason: string
    }

    const task = await Task.findById(task_id)
    if (!task) return reply.status(404).send({ error: 'Task not found' })

    const approval = await Approval.create({
      task_id,
      command,
      reason,
      status: 'pending',
    })

    await Task.findByIdAndUpdate(task.id, { status: 'waiting_approval' })
    try {
      const io = getIO()
      io.to(`user:${task.user_id}`).emit('approval:required', {
        taskId: task.id as string,
        approvalId: approval.id as string,
        command,
        reason,
      })
    } catch { /* ignore */ }

    return reply.status(201).send(approval)
  })

  // POST /approvals/:id/respond — mobile app approves or rejects
  fastify.post('/:id/respond', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { decision } = respondSchema.parse(request.body)

    const approval = await Approval.findById(id)
    if (!approval) return reply.status(404).send({ error: 'Approval not found' })

    // Verify task ownership
    const task = await Task.findOne({ _id: approval.task_id, user_id: request.user.userId })
    if (!task) return reply.status(403).send({ error: 'Unauthorized' })

    approval.status = decision
    approval.responded_at = new Date()
    await approval.save()

    // Resume task status
    await Task.findByIdAndUpdate(task.id, { status: 'running' })

    // Notify the agent and user
    try {
      const io = getIO()
      io.to(`device:${task.device_id}`).emit('approval:response', {
        approvalId: id,
        taskId: task.id as string,
        decision,
      })
      io.to(`user:${task.user_id}`).emit('task:status_changed', {
        taskId: task.id,
        status: 'running',
        message: decision === 'approved' ? 'Action approved' : 'Action rejected',
      })
    } catch { /* agent offline */ }

    return approval
  })
}

export default approvalRoutes
