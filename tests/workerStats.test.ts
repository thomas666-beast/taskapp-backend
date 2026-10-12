import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'
import { makeApp, truncateAll, registerUser, auth } from './helpers.js'

describe('worker stats', () => {
  let app: FastifyInstance

  before(async () => { app = await makeApp() })
  after(async () => { await app.close() })
  beforeEach(async () => { await truncateAll(app) })

  async function createTask(alice: any, bobId: string, title: string) {
    const res = await app.inject({
      method: 'POST', url: '/tasks', headers: auth(alice.token),
      payload: { workerId: bobId, title },
    })
    return res.json().task
  }

  async function workerConfirm(bob: any, taskId: string) {
    return app.inject({
      method: 'POST', url: `/tasks/${taskId}/worker-confirm`,
      headers: auth(bob.token),
    })
  }

  async function userConfirm(alice: any, taskId: string) {
    return app.inject({
      method: 'POST', url: `/tasks/${taskId}/user-confirm`,
      headers: auth(alice.token),
    })
  }

  async function rate(alice: any, taskId: string, rating: number) {
    return app.inject({
      method: 'POST', url: `/tasks/${taskId}/rate`,
      headers: auth(alice.token),
      payload: { rating },
    })
  }

  test('worker with no tasks gets zeroed stats', async () => {
    const bob = await registerUser(app, 'bob', 'WORKER')
    const res = await app.inject({
      method: 'GET', url: '/me/worker/stats',
      headers: auth(bob.token),
    })
    assert.equal(res.statusCode, 200)
    const s = res.json().stats
    assert.equal(s.total, 0)
    assert.equal(s.open, 0)
    assert.equal(s.workerConfirmed, 0)
    assert.equal(s.completed, 0)
    assert.equal(s.cancelled, 0)
    assert.equal(s.rated, 0)
    assert.equal(s.averageRating, null)
  })

  test('stats count tasks by status correctly', async () => {
    const alice = await registerUser(app, 'alice', 'USER')
    const bob = await registerUser(app, 'bob', 'WORKER')

    // 1 open
    await createTask(alice, bob.id, 'Task A')

    // 1 worker-confirmed
    const t2 = await createTask(alice, bob.id, 'Task B')
    await workerConfirm(bob, t2.id)

    // 2 completed
    const t3 = await createTask(alice, bob.id, 'Task C')
    await workerConfirm(bob, t3.id)
    await userConfirm(alice, t3.id)

    const t4 = await createTask(alice, bob.id, 'Task D')
    await workerConfirm(bob, t4.id)
    await userConfirm(alice, t4.id)

    const res = await app.inject({
      method: 'GET', url: '/me/worker/stats',
      headers: auth(bob.token),
    })
    const s = res.json().stats
    assert.equal(s.total, 4)
    assert.equal(s.open, 1)
    assert.equal(s.workerConfirmed, 1)
    assert.equal(s.completed, 2)
    assert.equal(s.cancelled, 0)
    assert.equal(s.rated, 0)
    assert.equal(s.averageRating, null)
  })

  test('average rating only counts rated tasks', async () => {
    const alice = await registerUser(app, 'alice', 'USER')
    const bob = await registerUser(app, 'bob', 'WORKER')

    // 3 completed tasks, only 2 rated
    const t1 = await createTask(alice, bob.id, 'Task 1')
    await workerConfirm(bob, t1.id)
    await userConfirm(alice, t1.id)
    await rate(alice, t1.id, 5)

    const t2 = await createTask(alice, bob.id, 'Task 2')
    await workerConfirm(bob, t2.id)
    await userConfirm(alice, t2.id)
    await rate(alice, t2.id, 3)

    const t3 = await createTask(alice, bob.id, 'Task 3')
    await workerConfirm(bob, t3.id)
    await userConfirm(alice, t3.id)
    // no rating

    const res = await app.inject({
      method: 'GET', url: '/me/worker/stats',
      headers: auth(bob.token),
    })
    const s = res.json().stats
    assert.equal(s.completed, 3)
    assert.equal(s.rated, 2)
    assert.equal(s.averageRating, 4) // (5 + 3) / 2
  })

  test('average rating rounds to 2 decimals', async () => {
    const alice = await registerUser(app, 'alice', 'USER')
    const bob = await registerUser(app, 'bob', 'WORKER')

    const ratings = [5, 4, 4] // avg = 4.3333...
    for (let i = 0; i < ratings.length; i++) {
      const t = await createTask(alice, bob.id, `Task ${i}`)
      await workerConfirm(bob, t.id)
      await userConfirm(alice, t.id)
      await rate(alice, t.id, ratings[i])
    }

    const res = await app.inject({
      method: 'GET', url: '/me/worker/stats',
      headers: auth(bob.token),
    })
    assert.equal(res.json().stats.averageRating, 4.33)
  })

  test('user cannot access worker stats', async () => {
    const alice = await registerUser(app, 'alice', 'USER')
    const res = await app.inject({
      method: 'GET', url: '/me/worker/stats',
      headers: auth(alice.token),
    })
    assert.equal(res.statusCode, 403)
  })

  test('stats require auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/worker/stats' })
    assert.equal(res.statusCode, 401)
  })

  test('stats only count own tasks', async () => {
    const alice = await registerUser(app, 'alice', 'USER')
    const bob = await registerUser(app, 'bob', 'WORKER')
    const carol = await registerUser(app, 'carol', 'WORKER')

    // 2 tasks for bob, 1 for carol
    await createTask(alice, bob.id, 'Bob task 1')
    await createTask(alice, bob.id, 'Bob task 2')
    await createTask(alice, carol.id, 'Carol task')

    const res = await app.inject({
      method: 'GET', url: '/me/worker/stats',
      headers: auth(bob.token),
    })
    assert.equal(res.json().stats.total, 2)
  })
})
