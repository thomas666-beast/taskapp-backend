import type { FastifyInstance } from 'fastify'
import type { WorkerStats } from '../../types.js'

export default async function workerStatsRoutes(app: FastifyInstance) {
  app.get(
    '/me/worker/stats',
    { preHandler: [app.requireRole('WORKER')] },
    async (req, reply) => {
      const workerId = req.user.sub

      const { rows } = await app.db.query<{
        total: string
        open: string
        worker_confirmed: string
        completed: string
        cancelled: string
        rated: string
        average_rating: string | null
      }>(
        `SELECT
           COUNT(*)::text                                                      AS total,
           COUNT(*) FILTER (WHERE status = 'OPEN')::text                       AS open,
           COUNT(*) FILTER (WHERE status = 'WORKER_CONFIRMED')::text           AS worker_confirmed,
           COUNT(*) FILTER (WHERE status = 'COMPLETED')::text                  AS completed,
           COUNT(*) FILTER (WHERE status = 'CANCELLED')::text                  AS cancelled,
           COUNT(rating)::text                                                 AS rated,
           ROUND(AVG(rating)::numeric, 2)::text                                AS average_rating
         FROM tasks
         WHERE worker_id = $1`,
        [workerId]
      )

      const r = rows[0]
      const stats: WorkerStats = {
        total: Number(r.total),
        open: Number(r.open),
        workerConfirmed: Number(r.worker_confirmed),
        completed: Number(r.completed),
        cancelled: Number(r.cancelled),
        rated: Number(r.rated),
        averageRating: r.average_rating === null ? null : Number(r.average_rating),
      }

      return reply.send({ stats })
    }
  )
}
