import Fastify from 'fastify'
import cors from '@fastify/cors'
import fastifyMultipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { join } from 'node:path'

import dbPlugin from './plugins/db.js'
import authPlugin from './plugins/auth.js'

import authRoutes from './modules/auth/auth.routes.js'
import workersRoutes from './modules/workers/workers.routes.js'
import tasksRoutes from './modules/tasks/tasks.routes.js'
import messagesRoutes from './modules/messages/messages.routes.js'
import uploadsRoutes from './modules/uploads/uploads.routes.js'
import wsRoutes from './ws/server.js'
import { startAutoConfirmJob } from './jobs/autoConfirm.js'
import workerStatsRoutes from './modules/workers/stats.routes.js'

declare module 'fastify' {
  interface FastifyInstance {
    autoConfirmTick: () => Promise<void>
  }
}

export async function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })

  const { tick: autoConfirmTick } = startAutoConfirmJob(app)

  await app.register(cors, { origin: true })

  await app.register(fastifyMultipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  })

  await app.register(fastifyStatic, {
    root: join(process.cwd(), process.env.UPLOAD_DIR || 'uploads'),
    prefix: '/uploads/',
    decorateReply: false,
  })

  await app.register(dbPlugin)
  await app.register(authPlugin)

  await app.register(authRoutes)
  await app.register(workersRoutes)
  await app.register(tasksRoutes)
  await app.register(messagesRoutes)
  await app.register(uploadsRoutes)
  await app.register(wsRoutes)
  await app.register(workerStatsRoutes)
  
  app.decorate('autoConfirmTick', autoConfirmTick)

  app.get('/health', async () => ({ ok: true, service: 'taskapp' }))

  return app
}
