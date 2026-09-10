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

declare module 'bcrypt' {
  export function hash(data: string | Buffer, saltOrRounds: string | number): Promise<string>
  export function compare(data: string | Buffer, encrypted: string): Promise<boolean>
  export function genSalt(rounds?: number): Promise<string>
}
