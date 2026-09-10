import { FastifyRequest, FastifyReply } from 'fastify'

// Extend @fastify/jwt types so request.user is typed
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; email: string }
    user: { userId: string; email: string }
  }
}

// Extend Fastify instance with our authenticate decorator
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>
  }
}
