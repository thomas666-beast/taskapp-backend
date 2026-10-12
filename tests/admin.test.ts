import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcrypt'
import { makeApp, truncateAll, registerUser, auth } from './helpers.js'

async function seedAdmin(app: FastifyInstance, username = 'admin', password = 'admin12345') {
  const hash = await bcrypt.hash(password, 10)
  const { rows } = await app.db.query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ($1, $2, 'ADMIN')
     RETURNING id, username, role`,
    [username, hash]
  )
  const loginRes = await app.inject({
    method: 'POST', url: '/auth/login',
    payload: { username, password },
  })
  return { id: rows[0].id, username, token: loginRes.json().token }
}

describe('admin', () => {
  let app: FastifyInstance

  before(async () => { app = await makeApp() })
  after(async () => { await app.close() })
  beforeEach(async () => { await truncateAll(app) })

  test('admin can list users', async () => {
    const admin = await seedAdmin(app)
    await registerUser(app, 'alice', 'USER')
    await registerUser(app, 'bob', 'WORKER')

    const res = await app.inject({
      method: 'GET', url: '/admin/users',
      headers: auth(admin.token),
    })
    assert.equal(res.statusCode, 200)
    const users = res.json().users
    assert.equal(users.length, 3) // admin + alice + bob
  })

  test('admin can filter users by role', async () => {
    const admin = await seedAdmin(app)
    await registerUser(app, 'alice', 'USER')
    await registerUser(app, 'bob', 'WORKER')

    const res = await app.inject({
      method: 'GET', url: '/admin/users?role=WORKER',
      headers: auth(admin.token),
    })
    const users = res.json().users
    assert.equal(users.length, 1)
    assert.equal(users[0].username, 'bob')
  })

  test('admin cannot see password hashes', async () => {
    const admin = await seedAdmin(app)
    await registerUser(app, 'alice', 'USER')

    const res = await app.inject({
      method: 'GET', url: '/admin/users',
      headers: auth(admin.token),
    })
    for (const u of res.json().users) {
      assert.ok(!('passwordHash' in u))
      assert.ok(!('password_hash' in u))
    }
  })

  test('user cannot access admin users', async () => {
    const alice = await registerUser(app, 'alice', 'USER')
    const res = await app.inject({
      method: 'GET', url: '/admin/users',
      headers: auth(alice.token),
    })
    assert.equal(res.statusCode, 403)
  })

  test('worker cannot access admin users', async () => {
    const bob = await registerUser(app, 'bob', 'WORKER')
    const res = await app.inject({
      method: 'GET', url: '/admin/users',
      headers: auth(bob.token),
    })
    assert.equal(res.statusCode, 403)
  })

  test('admin can list all tasks', async () => {
    const admin = await seedAdmin(app)
    const alice = await registerUser(app, 'alice', 'USER')
    const bob = await registerUser(app, 'bob', 'WORKER')

    await app.inject({
      method: 'POST', url: '/tasks', headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'Task 1' },
    })
    await app.inject({
      method: 'POST', url: '/tasks', headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'Task 2' },
    })

    const res = await app.inject({
      method: 'GET', url: '/admin/tasks',
      headers: auth(admin.token),
    })
    assert.equal(res.json().tasks.length, 2)
  })

  test('admin can filter tasks by status', async () => {
    const admin = await seedAdmin(app)
    const alice = await registerUser(app, 'alice', 'USER')
    const bob = await registerUser(app, 'bob', 'WORKER')

    const t1 = (await app.inject({
      method: 'POST', url: '/tasks', headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'Open task' },
    })).json().task

    const t2 = (await app.inject({
      method: 'POST', url: '/tasks', headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'Done task' },
    })).json().task

    await app.inject({
      method: 'POST', url: `/tasks/${t2.id}/worker-confirm`,
      headers: auth(bob.token),
    })

    const res = await app.inject({
      method: 'GET', url: '/admin/tasks?status=WORKER_CONFIRMED',
      headers: auth(admin.token),
    })
    const tasks = res.json().tasks
    assert.equal(tasks.length, 1)
    assert.equal(tasks[0].id, t2.id)
  })

  test('admin can see task detail with messages', async () => {
    const admin = await seedAdmin(app)
    const alice = await registerUser(app, 'alice', 'USER')
    const bob = await registerUser(app, 'bob', 'WORKER')

    const task = (await app.inject({
      method: 'POST', url: '/tasks', headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'Chat task' },
    })).json().task

    await app.inject({
      method: 'POST', url: `/tasks/${task.id}/messages`,
      headers: auth(alice.token),
      payload: { type: 'TEXT', text: 'hello' },
    })
    await app.inject({
      method: 'POST', url: `/tasks/${task.id}/messages`,
      headers: auth(bob.token),
      payload: { type: 'TEXT', text: 'hi there' },
    })

    const res = await app.inject({
      method: 'GET', url: `/admin/tasks/${task.id}`,
      headers: auth(admin.token),
    })
    assert.equal(res.statusCode, 200)
    const body = res.json()
    assert.equal(body.task.id, task.id)
    assert.equal(body.messages.length, 2)
    assert.equal(body.messages[0].text, 'hello')
    assert.equal(body.messages[1].text, 'hi there')
  })

  test('admin task detail 404 for unknown id', async () => {
    const admin = await seedAdmin(app)
    const res = await app.inject({
      method: 'GET', url: `/admin/tasks/00000000-0000-0000-0000-000000000000`,
      headers: auth(admin.token),
    })
    assert.equal(res.statusCode, 404)
  })

  test('all admin routes require auth', async () => {
    for (const url of ['/admin/users', '/admin/tasks']) {
      const res = await app.inject({ method: 'GET', url })
      assert.equal(res.statusCode, 401)
    }
  })
})
