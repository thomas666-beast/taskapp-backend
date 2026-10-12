import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { mkdir } from 'node:fs/promises'
import { extname, join } from 'node:path'

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/mp4',
  'application/pdf', 'text/plain', 'application/zip',
])

const MAX_BYTES = 25 * 1024 * 1024 // 25 MB

export default async function uploadsRoutes(app: FastifyInstance) {
  app.post(
    '/uploads',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const data = await req.file({ limits: { fileSize: MAX_BYTES } })
      if (!data) return reply.code(400).send({ error: 'No file' })

      if (!ALLOWED_MIME.has(data.mimetype)) {
        return reply.code(415).send({ error: `Unsupported type: ${data.mimetype}` })
      }

      const uploadDir = process.env.UPLOAD_DIR || 'uploads'
      await mkdir(uploadDir, { recursive: true })

      const ext = extname(data.filename) || ''
      const stored = `${randomUUID()}${ext}`
      const dest = join(uploadDir, stored)

      await pipeline(data.file, createWriteStream(dest))

      // If multipart plugin detected size limit exceeded, the stream throws
      // before here, so we're safe to report the file.

      const url = `${process.env.PUBLIC_URL}/uploads/${stored}`
      return reply.code(201).send({
        url,
        name: data.filename,
        size: data.file.bytesRead,
        mime: data.mimetype,
      })
    }
  )
}
