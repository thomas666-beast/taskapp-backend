import type { FastifyInstance } from 'fastify'
import type { Task, Message, Role } from '../../types.js'

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

type AdminUserRow = {
  id: string
  username: string
  role: Role
  createdAt: Date
}

export default async function adminRoutes(app: FastifyInstance) {
  // ── GET /admin/users ──────────────────────────────────
  // Query: ?role=USER|WORKER|ADMIN (optional)
  app.get(
    '/admin/users',
    { preHandler: [app.requireRole('ADMIN')] },
    async (req, reply) => {
      const { role } = req.query as { role?: Role }

      const params: unknown[] = []
      let where = ''
      if (role) {
        where = 'WHERE role = $1'
        params.push(role)
      }

      const { rows } = await app.db.query<AdminUserRow>(
        `SELECT id, username, role, created_at AS "createdAt"
         FROM users
         ${where}
         ORDER BY created_at DESC
         LIMIT 500`,
        params
      )

      return reply.send({ users: rows })
    }
  )

  // ── GET /admin/tasks ──────────────────────────────────
  // Query: ?status=OPEN|WORKER_CONFIRMED|COMPLETED|CANCELLED (optional)
  app.get(
    '/admin/tasks',
    { preHandler: [app.requireRole('ADMIN')] },
    async (req, reply) => {
      const { status } = req.query as { status?: string }

      const params: unknown[] = []
      let where = ''
      if (status) {
        where = 'WHERE status = $1'
        params.push(status)
      }

      const { rows } = await app.db.query<Task>(
        `SELECT ${TASK_COLUMNS}
         FROM tasks
         ${where}
         ORDER BY created_at DESC
         LIMIT 500`,
        params
      )

      return reply.send({ tasks: rows })
    }
  )

  // ── GET /admin/tasks/:id ──────────────────────────────
  // Full detail: task + all messages
  app.get(
    '/admin/tasks/:id',
    { preHandler: [app.requireRole('ADMIN')] },
    async (req, reply) => {
      const { id: taskId } = req.params as { id: string }

      const { rows: taskRows } = await app.db.query<Task>(
        `SELECT ${TASK_COLUMNS} FROM tasks WHERE id = $1`,
        [taskId]
      )
      const task = taskRows[0]
      if (!task) return reply.code(404).send({ error: 'Task not found' })

      const { rows: messages } = await app.db.query<Message>(
        `SELECT id,
                task_id   AS "taskId",
                sender_id AS "senderId",
                type, text,
                file_url  AS "fileUrl",
                file_name AS "fileName",
                file_size AS "fileSize",
                created_at AS "createdAt"
         FROM messages
         WHERE task_id = $1
         ORDER BY created_at ASC`,
        [taskId]
      )

      return reply.send({ task, messages })
    }
  )
}
