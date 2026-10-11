import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcrypt'
import { registerSchema, loginSchema } from './auth.schemas'
import type { Role } from '../../types'

type UserRow = {
  id: string
  username: string
  password_hash: string
  role: Role
  created_at: Date
}

export default async function authRoutes(app: FastifyInstance) {
  // ── Register ──────────────────────────────────────────
  app.post('/auth/register', async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
    }
    const { username, password, role } = parsed.data

    const existing = await app.db.query(
      'SELECT 1 FROM users WHERE username = $1',
      [username]
    )
    if (existing.rowCount) {
      return reply.code(409).send({ error: 'Username taken' })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const { rows } = await app.db.query<UserRow>(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, username, role, created_at`,
      [username, passwordHash, role]
    )
    const user = rows[0]

    const token = app.jwt.sign({ sub: user.id, role: user.role })
    return reply.code(201).send({
      user: { id: user.id, username: user.username, role: user.role, createdAt: user.created_at },
      token,
    })
  })

  // ── Login ─────────────────────────────────────────────
  app.post('/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' })

    const { username, password } = parsed.data

    const { rows } = await app.db.query<UserRow>(
      'SELECT id, username, password_hash, role, created_at FROM users WHERE username = $1',
      [username]
    )
    const user = rows[0]
    if (!user) return reply.code(401).send({ error: 'Invalid credentials' })

    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) return reply.code(401).send({ error: 'Invalid credentials' })

    const token = app.jwt.sign({ sub: user.id, role: user.role })
    return reply.send({
      user: { id: user.id, username: user.username, role: user.role },
      token,
    })
  })

  // ── Me ────────────────────────────────────────────────
  app.get('/me', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { sub } = req.user
    const { rows } = await app.db.query(
      'SELECT id, username, role, created_at FROM users WHERE id = $1',
      [sub]
    )
    const user = rows[0]
    if (!user) return reply.code(404).send({ error: 'User not found' })
    return reply.send({
      user: { id: user.id, username: user.username, role: user.role, createdAt: user.created_at },
    })
  })
}
