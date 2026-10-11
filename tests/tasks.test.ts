import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'
import { makeApp, truncateAll, registerUser, auth } from './helpers.js'

describe('tasks', () => {
  let app: FastifyInstance

  before(async () => { app = await makeApp() })
  after(async () => { await app.close() })
  beforeEach(async () => { await truncateAll(app) })

  // Helper: create a worker and a user, return both
  async function setup() {
    const alice = await registerUser(app, 'alice', 'USER')
    const bob = await registerUser(app, 'bob', 'WORKER')
    return { alice, bob }
  }

  test('user creates a task for a worker', async () => {
    const { alice, bob } = await setup()

    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'Fix my laptop' },
    })

    assert.equal(res.statusCode, 201)
    const task = res.json().task
    assert.equal(task.title, 'Fix my laptop')
    assert.equal(task.status, 'OPEN')
    assert.equal(task.userId, alice.id)
    assert.equal(task.workerId, bob.id)
    assert.equal(task.rating, null)
  })

  test('worker cannot create a task', async () => {
    const { bob } = await setup()
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: auth(bob.token),
      payload: { workerId: bob.id, title: 'Self task' },
    })
    assert.equal(res.statusCode, 403)
  })

  test('creating task for non-worker fails', async () => {
    const { alice } = await setup()
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: auth(alice.token),
      payload: { workerId: alice.id, title: 'Task on self' },
    })
    assert.equal(res.statusCode, 404)
  })

  test('creating task with invalid body fails', async () => {
    const { alice, bob } = await setup()
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'a' }, // too short
    })
    assert.equal(res.statusCode, 400)
  })

  test('user sees tasks they created', async () => {
    const { alice, bob } = await setup()
    await app.inject({
      method: 'POST', url: '/tasks', headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'Task 1' },
    })
    await app.inject({
      method: 'POST', url: '/tasks', headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'Task 2' },
    })

    const res = await app.inject({
      method: 'GET', url: '/tasks', headers: auth(alice.token),
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.json().tasks.length, 2)
  })

  test('worker sees tasks assigned to them', async () => {
    const { alice, bob } = await setup()
    await app.inject({
      method: 'POST', url: '/tasks', headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'Task for bob' },
    })

    const res = await app.inject({
      method: 'GET', url: '/tasks', headers: auth(bob.token),
    })
    assert.equal(res.statusCode, 200)
    const tasks = res.json().tasks
    assert.equal(tasks.length, 1)
    assert.equal(tasks[0].title, 'Task for bob')
  })

  test('user does not see another user tasks', async () => {
    const { alice, bob } = await setup()
    const carol = await registerUser(app, 'carol', 'USER')

    await app.inject({
      method: 'POST', url: '/tasks', headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'Alice task' },
    })

    const res = await app.inject({
      method: 'GET', url: '/tasks', headers: auth(carol.token),
    })
    assert.equal(res.json().tasks.length, 0)
  })

  test('task detail accessible by user participant', async () => {
    const { alice, bob } = await setup()
    const createRes = await app.inject({
      method: 'POST', url: '/tasks', headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'Detail test' },
    })
    const taskId = createRes.json().task.id

    const res = await app.inject({
      method: 'GET', url: `/tasks/${taskId}`, headers: auth(alice.token),
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.json().task.id, taskId)
  })

  test('task detail accessible by worker participant', async () => {
    const { alice, bob } = await setup()
    const createRes = await app.inject({
      method: 'POST', url: '/tasks', headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'Detail test' },
    })
    const taskId = createRes.json().task.id

    const res = await app.inject({
      method: 'GET', url: `/tasks/${taskId}`, headers: auth(bob.token),
    })
    assert.equal(res.statusCode, 200)
  })

  test('task detail forbidden for non-participant', async () => {
    const { alice, bob } = await setup()
    const carol = await registerUser(app, 'carol', 'USER')

    const createRes = await app.inject({
      method: 'POST', url: '/tasks', headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'Private' },
    })
    const taskId = createRes.json().task.id

    const res = await app.inject({
      method: 'GET', url: `/tasks/${taskId}`, headers: auth(carol.token),
    })
    assert.equal(res.statusCode, 403)
  })

  test('task detail 404 for unknown id', async () => {
    const { alice } = await setup()
    const res = await app.inject({
      method: 'GET',
      url: `/tasks/00000000-0000-0000-0000-000000000000`,
      headers: auth(alice.token),
    })
    assert.equal(res.statusCode, 404)
  })

  test('GET /tasks requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/tasks' })
    assert.equal(res.statusCode, 401)
  })
})
