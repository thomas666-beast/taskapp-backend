import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'
import { makeApp, truncateAll, registerUser, auth } from './helpers.js'

describe('auth', () => {
  let app: FastifyInstance

  before(async () => { app = await makeApp() })
  after(async () => { await app.close() })
  beforeEach(async () => { await truncateAll(app) })

  test('register creates a user and returns a token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'alice', password: 'secret123', role: 'USER' },
    })
    assert.equal(res.statusCode, 201)
    const body = res.json()
    assert.equal(body.user.username, 'alice')
    assert.equal(body.user.role, 'USER')
    assert.ok(body.token)
    assert.ok(!('passwordHash' in body.user))
  })

  test('register rejects duplicate username', async () => {
    await registerUser(app, 'alice')
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'alice', password: 'secret123', role: 'USER' },
    })
    assert.equal(res.statusCode, 409)
  })

  test('register rejects short password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'alice', password: '123', role: 'USER' },
    })
    assert.equal(res.statusCode, 400)
  })

  test('register rejects ADMIN role', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'alice', password: 'secret123', role: 'ADMIN' },
    })
    assert.equal(res.statusCode, 400)
  })

  test('login returns token for valid credentials', async () => {
    await registerUser(app, 'alice')
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'alice', password: 'secret123' },
    })
    assert.equal(res.statusCode, 200)
    assert.ok(res.json().token)
  })

  test('login rejects wrong password', async () => {
    await registerUser(app, 'alice')
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'alice', password: 'wrongpass' },
    })
    assert.equal(res.statusCode, 401)
  })

  test('GET /me requires token', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' })
    assert.equal(res.statusCode, 401)
  })

  test('GET /me returns the logged-in user', async () => {
    const alice = await registerUser(app, 'alice')
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: auth(alice.token),
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.json().user.username, 'alice')
  })
})
