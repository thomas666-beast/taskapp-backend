import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'
import { makeApp, truncateAll, registerUser, auth } from './helpers.js'

describe('rating', () => {
  let app: FastifyInstance

  before(async () => { app = await makeApp() })
  after(async () => { await app.close() })
  beforeEach(async () => { await truncateAll(app) })

  async function setupCompletedTask() {
    const alice = await registerUser(app, 'alice', 'USER')
    const bob = await registerUser(app, 'bob', 'WORKER')
    const createRes = await app.inject({
      method: 'POST', url: '/tasks', headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'Fix laptop' },
    })
    const task = createRes.json().task

    await app.inject({
      method: 'POST', url: `/tasks/${task.id}/worker-confirm`,
      headers: auth(bob.token),
    })
    await app.inject({
      method: 'POST', url: `/tasks/${task.id}/user-confirm`,
      headers: auth(alice.token),
    })

    return { alice, bob, taskId: task.id }
  }

  test('user rates a completed task', async () => {
    const { alice, taskId } = await setupCompletedTask()
    const res = await app.inject({
      method: 'POST', url: `/tasks/${taskId}/rate`,
      headers: auth(alice.token),
      payload: { rating: 5 },
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.json().task.rating, 5)
  })

  test('rating below 1 is rejected', async () => {
    const { alice, taskId } = await setupCompletedTask()
    const res = await app.inject({
      method: 'POST', url: `/tasks/${taskId}/rate`,
      headers: auth(alice.token),
      payload: { rating: 0 },
    })
    assert.equal(res.statusCode, 400)
  })

  test('rating above 5 is rejected', async () => {
    const { alice, taskId } = await setupCompletedTask()
    const res = await app.inject({
      method: 'POST', url: `/tasks/${taskId}/rate`,
      headers: auth(alice.token),
      payload: { rating: 6 },
    })
    assert.equal(res.statusCode, 400)
  })

  test('non-integer rating is rejected', async () => {
    const { alice, taskId } = await setupCompletedTask()
    const res = await app.inject({
      method: 'POST', url: `/tasks/${taskId}/rate`,
      headers: auth(alice.token),
      payload: { rating: 3.5 },
    })
    assert.equal(res.statusCode, 400)
  })

  test('worker cannot rate', async () => {
    const { bob, taskId } = await setupCompletedTask()
    const res = await app.inject({
      method: 'POST', url: `/tasks/${taskId}/rate`,
      headers: auth(bob.token),
      payload: { rating: 5 },
    })
    assert.equal(res.statusCode, 403)
  })

  test('cannot rate an OPEN task', async () => {
    const alice = await registerUser(app, 'alice', 'USER')
    const bob = await registerUser(app, 'bob', 'WORKER')
    const createRes = await app.inject({
      method: 'POST', url: '/tasks', headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'Not done' },
    })
    const taskId = createRes.json().task.id

    const res = await app.inject({
      method: 'POST', url: `/tasks/${taskId}/rate`,
      headers: auth(alice.token),
      payload: { rating: 5 },
    })
    assert.equal(res.statusCode, 409)
  })

  test('cannot rate twice', async () => {
    const { alice, taskId } = await setupCompletedTask()
    await app.inject({
      method: 'POST', url: `/tasks/${taskId}/rate`,
      headers: auth(alice.token),
      payload: { rating: 5 },
    })
    const res = await app.inject({
      method: 'POST', url: `/tasks/${taskId}/rate`,
      headers: auth(alice.token),
      payload: { rating: 1 },
    })
    assert.equal(res.statusCode, 409)
  })

  test('another user cannot rate someone else task', async () => {
    const { taskId } = await setupCompletedTask()
    const carol = await registerUser(app, 'carol', 'USER')
    const res = await app.inject({
      method: 'POST', url: `/tasks/${taskId}/rate`,
      headers: auth(carol.token),
      payload: { rating: 5 },
    })
    assert.equal(res.statusCode, 403)
  })
})
