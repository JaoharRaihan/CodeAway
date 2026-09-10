import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { Project } from '../models/Project'

const createProjectSchema = z.object({
  device_id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  repository_url: z.string().url().optional(),
  branch: z.string().optional(),
})

const projectRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /projects?device_id=xxx
  fastify.get('/', { onRequest: [fastify.authenticate] }, async (request) => {
    const { device_id } = request.query as { device_id?: string }
    const filter: Record<string, unknown> = { user_id: request.user.userId }
    if (device_id) filter.device_id = device_id
    return Project.find(filter).sort({ created_at: -1 })
  })

  // POST /projects
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const body = createProjectSchema.parse(request.body)
    const project = await Project.create({
      user_id: request.user.userId,
      ...body,
    })
    return reply.status(201).send(project)
  })

  // GET /projects/:id
  fastify.get('/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const project = await Project.findOne({ _id: id, user_id: request.user.userId })
    if (!project) return reply.status(404).send({ error: 'Project not found' })
    return project
  })

  // DELETE /projects/:id
  fastify.delete('/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const project = await Project.findOneAndDelete({ _id: id, user_id: request.user.userId })
    if (!project) return reply.status(404).send({ error: 'Project not found' })
    return reply.status(204).send()
  })
}

export default projectRoutes
