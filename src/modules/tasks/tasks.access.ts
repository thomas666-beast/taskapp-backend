import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Task } from '../../types.js'

export type AccessResult =
  | { ok: true; task: Task }
  | { ok: false; code: number; error: string }

export async function loadTaskForParticipant(
  app: FastifyInstance,
  req: FastifyRequest,
  taskId: string
): Promise<AccessResult> {
  const { rows } = await app.db.query<Task>(
    `SELECT id, user_id AS "userId", worker_id AS "workerId",
            title, status, rating,
            worker_confirmed_at AS "workerConfirmedAt",
            user_confirmed_at AS "userConfirmedAt",
            auto_confirm_at AS "autoConfirmAt",
            created_at AS "createdAt", updated_at AS "updatedAt",
            closed_at AS "closedAt"
     FROM tasks WHERE id = $1`,
    [taskId]
  )
  const task = rows[0]
  if (!task) return { ok: false, code: 404, error: 'Task not found' }

  const { sub: userId, role } = req.user
  const isParticipant = task.userId === userId || task.workerId === userId
  if (!isParticipant && role !== 'ADMIN') {
    return { ok: false, code: 403, error: 'Forbidden' }
  }

  return { ok: true, task }
}
