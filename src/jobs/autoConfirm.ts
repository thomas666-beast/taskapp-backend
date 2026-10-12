import type { FastifyInstance } from 'fastify'
import { broadcastToTask } from '../ws/server.js'
import type { Task } from '../types.js'

const INTERVAL_MS = 5 * 60 * 1000 // every 5 minutes

const TASK_COLUMNS = `
  id,
  user_id            AS "userId",
  worker_id          AS "workerId",
  title,
  status,
  rating,
  worker_confirmed_at AS "workerConfirmedAt",
  user_confirmed_at   AS "userConfirmedAt",
  auto_confirm_at     AS "autoConfirmAt",
  created_at          AS "createdAt",
  updated_at          AS "updatedAt",
  closed_at           AS "closedAt"
`

export function startAutoConfirmJob(app: FastifyInstance) {
  let stopped = false

  const tick = async () => {
    if (stopped) return
    try {
      const { rows } = await app.db.query<Task>(
        `UPDATE tasks
            SET status = 'COMPLETED',
                user_confirmed_at = now(),
                closed_at = now(),
                updated_at = now()
          WHERE status = 'WORKER_CONFIRMED'
            AND auto_confirm_at IS NOT NULL
            AND auto_confirm_at <= now()
          RETURNING ${TASK_COLUMNS}`
      )

      for (const task of rows) {
        app.log.info({ taskId: task.id }, 'auto-confirmed task')
        broadcastToTask(app, task.id, { type: 'task:updated', task })
      }
    } catch (err) {
      app.log.error({ err }, 'auto-confirm job failed')
    }
  }

  const interval = setInterval(tick, INTERVAL_MS)
  app.addHook('onClose', async () => {
    stopped = true
    clearInterval(interval)
  })

  // Also expose a manual trigger for tests
  return { tick }
}
