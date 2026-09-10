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
    const filter: Record<string, unknown> = {}
    if (task_id) filter.task_id = task_id
    return Approval.find(filter).sort({ created_at: -1 })
  })

  // POST /approvals — laptop agent creates an approval request
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { task_id, command, reason } = request.body as {
      task_id: string
      command: string
      reason: string
    }

    const approval = await Approval.create({
      task_id,
      command,
      reason,
      status: 'pending',
    })

    const task = await Task.findById(task_id)
    if (task) {
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
    }

    return reply.status(201).send(approval)
  })

  // POST /approvals/:id/respond — mobile app approves or rejects
  fastify.post('/:id/respond', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { decision } = respondSchema.parse(request.body)

    const approval = await Approval.findByIdAndUpdate(
      id,
      { status: decision, responded_at: new Date() },
      { new: true }
    )
    if (!approval) return reply.status(404).send({ error: 'Approval not found' })

    const task = await Task.findById(approval.task_id)
    if (task) {
      // Resume task status
      await Task.findByIdAndUpdate(task.id, { status: 'running' })

      // Notify the agent
      try {
        const io = getIO()
        io.to(`device:${task.device_id}`).emit('approval:response', {
          approvalId: id,
          taskId: task.id as string,
          decision,
        })
      } catch { /* agent offline */ }
    }

    return approval
  })
}

export default approvalRoutes
