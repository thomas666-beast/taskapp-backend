import type { FastifyInstance } from 'fastify'
import { createMessageSchema } from './messages.schemas.js'
import { loadTaskForParticipant } from '../tasks/tasks.access.js'
import { broadcastToTask } from '../../ws/server.js'
import type { Message } from '../../types.js'

export default async function messagesRoutes(app: FastifyInstance) {
  app.post(
    '/tasks/:id/messages',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id: taskId } = req.params as { id: string }

      const parsed = createMessageSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
      }

      const access = await loadTaskForParticipant(app, req, taskId)
      if (!access.ok) return reply.code(access.code).send({ error: access.error })

      if (access.task.status === 'COMPLETED') {
        return reply.code(409).send({ error: 'Task is completed, chat is locked' })
      }
      if (access.task.status === 'CANCELLED') {
        return reply.code(409).send({ error: 'Task is cancelled, chat is locked' })
      }

      const { sub: senderId } = req.user
      const data = parsed.data

      const { rows } = await app.db.query<Message>(
        `INSERT INTO messages (task_id, sender_id, type, text, file_url, file_name, file_size)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id,
                   task_id   AS "taskId",
                   sender_id AS "senderId",
                   type, text,
                   file_url  AS "fileUrl",
                   file_name AS "fileName",
                   file_size AS "fileSize",
                   created_at AS "createdAt"`,
        [
          taskId,
          senderId,
          data.type,
          data.type === 'TEXT' ? data.text : null,
          data.type === 'TEXT' ? null : data.fileUrl,
          data.type === 'TEXT' ? null : data.fileName,
          data.type === 'TEXT' ? null : data.fileSize,
        ]
      )

      const message = rows[0]

      // ⬇⬇⬇ THIS IS THE LINE THAT WAS PROBABLY MISSING ⬇⬇⬇
      broadcastToTask(app, taskId, { type: 'message:new', message })

      return reply.code(201).send({ message })
    }
  )

  app.get(
    '/tasks/:id/messages',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id: taskId } = req.params as { id: string }

      const access = await loadTaskForParticipant(app, req, taskId)
      if (!access.ok) return reply.code(access.code).send({ error: access.error })

      const { rows } = await app.db.query<Message>(
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

      return reply.send({ messages: rows })
    }
  )
}
