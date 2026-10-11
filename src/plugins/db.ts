import fp from 'fastify-plugin'
import { Pool } from 'pg'

export default fp(async (app) => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
  })

  // Fail fast if DB unreachable at boot
  await pool.query('SELECT 1')

  app.decorate('db', pool)

  app.addHook('onClose', async () => {
    await pool.end()
  })
})

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool
  }
}
