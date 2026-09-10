import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { Device } from '../models/Device'

const createDeviceSchema = z.object({
  name: z.string().min(1),
  platform: z.string().optional(),
  hostname: z.string().optional(),
  agent_version: z.string().optional(),
})

const deviceRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /devices
  fastify.get('/', { onRequest: [fastify.authenticate] }, async (request) => {
    return Device.find({ user_id: request.user.userId }).sort({ created_at: -1 })
  })

  // POST /devices  — called by the laptop agent on first `codeaway connect`
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const body = createDeviceSchema.parse(request.body)
    const device = await Device.create({
      user_id: request.user.userId,
      ...body,
    })
    return reply.status(201).send(device)
  })

  // GET /devices/:id
  fastify.get('/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const device = await Device.findOne({ _id: id, user_id: request.user.userId })
    if (!device) return reply.status(404).send({ error: 'Device not found' })
    return device
  })

  // PATCH /devices/:id  — agent updates its own status / version
  fastify.patch('/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as Partial<{
      name: string
      agent_version: string
      status: 'online' | 'offline'
    }>
    const device = await Device.findOneAndUpdate(
      { _id: id, user_id: request.user.userId },
      body,
      { new: true }
    )
    if (!device) return reply.status(404).send({ error: 'Device not found' })
    return device
  })

  // DELETE /devices/:id
  fastify.delete('/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const device = await Device.findOneAndDelete({ _id: id, user_id: request.user.userId })
    if (!device) return reply.status(404).send({ error: 'Device not found' })
    return reply.status(204).send()
  })
}

export default deviceRoutes
