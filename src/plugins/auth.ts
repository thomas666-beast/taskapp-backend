import fp from 'fastify-plugin'
import fastifyJwt from '@fastify/jwt'
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Role } from '../types.js'

export type JwtPayload = {
  sub: string // user id
  role: Role
}

export default fp(async (app) => {
  await app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET as string,
  })

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify()
    } catch {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  app.decorate(
    'requireRole',
    (...roles: Role[]) =>
      async (req: FastifyRequest, reply: FastifyReply) => {
        try {
          await req.jwtVerify()
        } catch {
          return reply.code(401).send({ error: 'Unauthorized' })
        }
        const user = req.user as JwtPayload
        if (!roles.includes(user.role)) {
          return reply.code(403).send({ error: 'Forbidden' })
        }
      }
  )
})

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireRole: (
      ...roles: Role[]
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload
    user: JwtPayload
  }
}
