import Fastify from 'fastify'
import cors from '@fastify/cors'
import dbPlugin from './plugins/db.js'
import authPlugin from './plugins/auth.js'
import authRoutes from './modules/auth/auth.routes.js'
import workersRoutes from './modules/workers/workers.routes.js'
import tasksRoutes from './modules/tasks/tasks.routes.js'
import messagesRoutes from './modules/messages/messages.routes.js'

export async function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })

  await app.register(cors, { origin: true })
  await app.register(dbPlugin)
  await app.register(authPlugin)

  await app.register(authRoutes)
  await app.register(workersRoutes)
  await app.register(tasksRoutes)
  await app.register(messagesRoutes)

  app.get('/health', async () => ({ ok: true, service: 'taskapp' }))

  return app
}
