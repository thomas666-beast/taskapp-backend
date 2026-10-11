import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

export async function makeApp(): Promise<FastifyInstance> {
  const app = await buildApp()
  await app.ready()
  return app
}

export async function truncateAll(app: FastifyInstance) {
  await app.db.query('TRUNCATE users RESTART IDENTITY CASCADE')
}

export type TestUser = { id: string; username: string; token: string }

export async function registerUser(
  app: FastifyInstance,
  username: string,
  role: 'USER' | 'WORKER' = 'USER'
): Promise<TestUser> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { username, password: 'secret123', role },
  })
  if (res.statusCode !== 201) {
    throw new Error(`register failed: ${res.statusCode} ${res.body}`)
  }
  const body = res.json()
  return { id: body.user.id, username: body.user.username, token: body.token }
}

export function auth(token: string) {
  return { authorization: `Bearer ${token}` }
}
