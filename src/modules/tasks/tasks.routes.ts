import type { FastifyInstance } from 'fastify'
import { createTaskSchema } from './tasks.schemas.js'
import type { Task } from '../../types.js'

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

export default async function tasksRoutes(app: FastifyInstance) {
  // ── User creates a task assigned to a worker ──────────
  app.post(
    '/tasks',
    { preHandler: [app.requireRole('USER')] },
    async (req, reply) => {
      const parsed = createTaskSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
      }
      const { workerId, title } = parsed.data
      const userId = req.user.sub

      // Worker must exist and have role WORKER
      const { rowCount } = await app.db.query(
        `SELECT 1 FROM users WHERE id = $1 AND role = 'WORKER'`,
        [workerId]
      )
      if (!rowCount) {
        return reply.code(404).send({ error: 'Worker not found' })
      }

      const { rows } = await app.db.query<Task>(
        `INSERT INTO tasks (user_id, worker_id, title)
         VALUES ($1, $2, $3)
         RETURNING ${TASK_COLUMNS}`,
        [userId, workerId, title]
      )

      return reply.code(201).send({ task: rows[0] })
    }
  )

  // ── List my tasks (role-aware) ────────────────────────
  app.get(
    '/tasks',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { sub: userId, role } = req.user

      let query: string
      let params: unknown[]

      if (role === 'WORKER') {
        query = `SELECT ${TASK_COLUMNS} FROM tasks
                 WHERE worker_id = $1
                 ORDER BY created_at DESC LIMIT 100`
        params = [userId]
      } else if (role === 'ADMIN') {
        query = `SELECT ${TASK_COLUMNS} FROM tasks
                 ORDER BY created_at DESC LIMIT 100`
        params = []
      } else {
        query = `SELECT ${TASK_COLUMNS} FROM tasks
                 WHERE user_id = $1
                 ORDER BY created_at DESC LIMIT 100`
        params = [userId]
      }

      const { rows } = await app.db.query<Task>(query, params)
      return reply.send({ tasks: rows })
    }
  )

  // ── Task detail (participants or admin only) ──────────
  app.get(
    '/tasks/:id',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const { sub: userId, role } = req.user

      const { rows } = await app.db.query<Task>(
        `SELECT ${TASK_COLUMNS} FROM tasks WHERE id = $1`,
        [id]
      )
      const task = rows[0]
      if (!task) return reply.code(404).send({ error: 'Task not found' })

      const isParticipant = task.userId === userId || task.workerId === userId
      if (!isParticipant && role !== 'ADMIN') {
        return reply.code(403).send({ error: 'Forbidden' })
      }

      return reply.send({ task })
    }
  )
}
