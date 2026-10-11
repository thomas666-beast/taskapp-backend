import type { FastifyInstance } from 'fastify'
import { updateWorkerProfileSchema } from './workers.schemas.js'
import type { PublicWorker } from '../../types.js'

export default async function workersRoutes(app: FastifyInstance) {
  // ── Worker: update own description ────────────────────
  app.put(
    '/me/worker-profile',
    { preHandler: [app.requireRole('WORKER')] },
    async (req, reply) => {
      const parsed = updateWorkerProfileSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
      }
      const { description } = parsed.data
      const { sub: userId } = req.user

      const { rows } = await app.db.query(
        `INSERT INTO worker_profiles (user_id, description)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE
           SET description = EXCLUDED.description,
               updated_at  = now()
         RETURNING user_id, description, updated_at`,
        [userId, description]
      )

      return reply.send({ profile: rows[0] })
    }
  )

  // ── Any authenticated user: list workers ──────────────
  app.get(
    '/workers',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { rows } = await app.db.query<PublicWorker>(
        `SELECT u.id,
                u.username,
                COALESCE(wp.description, '') AS description,
                u.created_at AS "createdAt"
         FROM users u
         LEFT JOIN worker_profiles wp ON wp.user_id = u.id
         WHERE u.role = 'WORKER'
         ORDER BY u.created_at DESC
         LIMIT 100`
      )
      return reply.send({ workers: rows })
    }
  )

  // ── Any authenticated user: single worker profile ─────
  app.get(
    '/workers/:id',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string }

      const { rows } = await app.db.query<PublicWorker>(
        `SELECT u.id,
                u.username,
                COALESCE(wp.description, '') AS description,
                u.created_at AS "createdAt"
         FROM users u
         LEFT JOIN worker_profiles wp ON wp.user_id = u.id
         WHERE u.id = $1 AND u.role = 'WORKER'`,
        [id]
      )

      const worker = rows[0]
      if (!worker) return reply.code(404).send({ error: 'Worker not found' })
      return reply.send({ worker })
    }
  )
}
