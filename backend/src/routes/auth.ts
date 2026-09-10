import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { User } from '../models/User'

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(60),
  password: z.string().min(8),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /auth/register
  fastify.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body)

    const existing = await User.findOne({ email: body.email })
    if (existing) {
      return reply.status(409).send({ error: 'Email already in use' })
    }

    const user = await User.create(body)
    const token = fastify.jwt.sign(
      { userId: user.id, email: user.email },
      { expiresIn: '7d' }
    )

    return reply.status(201).send({
      token,
      user: { id: user.id, email: user.email, name: user.name },
    })
  })

  // POST /auth/login
  fastify.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)

    const user = await User.findOne({ email: body.email })
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const valid = await user.comparePassword(body.password)
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const token = fastify.jwt.sign(
      { userId: user.id, email: user.email },
      { expiresIn: '7d' }
    )

    return reply.send({
      token,
      user: { id: user.id, email: user.email, name: user.name },
    })
  })

  // GET /auth/me
  fastify.get('/me', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const user = await User.findById(request.user.userId).select('-password')
    if (!user) return reply.status(404).send({ error: 'User not found' })
    return user
  })
}

export default authRoutes
