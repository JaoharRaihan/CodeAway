import './types'           // Fastify type augmentations (must be first)
import './config/env'      // Validate env early so bad config fails fast

import Fastify from 'fastify'
import cors from '@fastify/cors'
import fjwt from '@fastify/jwt'
import { Server } from 'socket.io'

import { env } from './config/env'
import { connectDatabase } from './config/database'
import { initSocket } from './socket'

import authPlugin from './middleware/auth'
import authRoutes from './routes/auth'
import deviceRoutes from './routes/devices'
import projectRoutes from './routes/projects'
import taskRoutes from './routes/tasks'
import approvalRoutes from './routes/approvals'

const fastify = Fastify({
  logger:
    env.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : true,
})

async function bootstrap() {
  // 1. Database
  await connectDatabase()

  // 2. Plugins
  await fastify.register(cors, { origin: true, credentials: true })
  await fastify.register(fjwt, { secret: env.JWT_SECRET })
  await fastify.register(authPlugin)

  // 3. Routes
  await fastify.register(authRoutes, { prefix: '/auth' })
  await fastify.register(deviceRoutes, { prefix: '/devices' })
  await fastify.register(projectRoutes, { prefix: '/projects' })
  await fastify.register(taskRoutes, { prefix: '/tasks' })
  await fastify.register(approvalRoutes, { prefix: '/approvals' })

  // 4. Health check
  fastify.get('/health', async () => ({
    status: 'ok',
    service: 'codeaway-backend',
    timestamp: new Date().toISOString(),
  }))

  // 5. Start HTTP server
  await fastify.listen({ port: env.PORT, host: '0.0.0.0' })

  // 6. Attach Socket.IO to the underlying http.Server
  initSocket(fastify.server)

  console.log(`
  ╔══════════════════════════════════╗
  ║   🚀 CodeAway Backend            ║
  ║   Port : ${env.PORT}                    ║
  ║   Env  : ${env.NODE_ENV}          ║
  ╚══════════════════════════════════╝
  `)
}

bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err)
  process.exit(1)
})
