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

  // 4.1 Privacy policy (Google Play compliance)
  fastify.get('/privacy', async (request, reply) => {
    reply.type('text/html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CodeAway - Privacy Policy</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 24px; line-height: 1.6; color: #1e293b; background: #f8fafc; }
    h1 { color: #0f172a; font-size: 28px; }
    h2 { color: #1e293b; font-size: 20px; margin-top: 28px; }
    p, li { color: #475569; font-size: 15px; }
    .card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    a { color: #3b82f6; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Privacy Policy for CodeAway</h1>
    <p><strong>Effective Date:</strong> September 12, 2026</p>
    <p>CodeAway ("we," "our," or "us") provides a developer productivity platform enabling users to monitor, manage, and execute automated software engineering tasks on their local computers via a mobile application.</p>
    
    <h2>1. Information We Collect</h2>
    <p><strong>Account Information:</strong> We collect your email address and an encrypted hash of your password to authenticate your sessions.</p>
    <p><strong>Device Identifiers:</strong> Device name, hostname, and OS platform to pair your mobile app with authorized development workstations.</p>
    <p><strong>Task Logs:</strong> Operational summaries, command results, and test status generated during local task runs.</p>

    <h2>2. Data Usage & Privacy Safeguards</h2>
    <p>We do not sell, rent, or monetize your personal data or source code. We do not use your code for model training. Code execution and file modifications occur strictly on your local machine inside an isolated workspace jail.</p>

    <h2>3. Security</h2>
    <p>All network traffic is encrypted in transit using industry-standard TLS (HTTPS and WSS). Passwords are cryptographically hashed using bcrypt.</p>

    <h2>4. Contact & Deletion</h2>
    <p>For questions or account/data deletion requests, please contact us at <a href="mailto:support@codeaway.dev">support@codeaway.dev</a> or visit our <a href="https://github.com/JaoharRaihan/CodeAway">GitHub repository</a>.</p>
  </div>
</body>
</html>`)
  })

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
