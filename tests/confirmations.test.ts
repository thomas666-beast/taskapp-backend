import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'
import { makeApp, truncateAll, registerUser, auth } from './helpers.js'

describe('confirmations', () => {
  let app: FastifyInstance

  before(async () => { app = await makeApp() })
  after(async () => { await app.close() })
  beforeEach(async () => { await truncateAll(app) })

  async function setupWithTask() {
    const alice = await registerUser(app, 'alice', 'USER')
    const bob = await registerUser(app, 'bob', 'WORKER')
    const res = await app.inject({
      method: 'POST', url: '/tasks', headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'Fix laptop' },
    })
    return { alice, bob, task: res.json().task }
  }

  test('worker confirms an OPEN task', async () => {
    const { bob, task } = await setupWithTask()
    const res = await app.inject({
      method: 'POST', url: `/tasks/${task.id}/worker-confirm`,
      headers: auth(bob.token),
    })
    assert.equal(res.statusCode, 200)
    const t = res.json().task
    assert.equal(t.status, 'WORKER_CONFIRMED')
    assert.ok(t.workerConfirmedAt)
    assert.ok(t.autoConfirmAt)
  })

  test('user cannot worker-confirm', async () => {
    const { alice, task } = await setupWithTask()
    const res = await app.inject({
      method: 'POST', url: `/tasks/${task.id}/worker-confirm`,
      headers: auth(alice.token),
    })
    assert.equal(res.statusCode, 403)
  })

  test('user confirms after worker', async () => {
    const { alice, bob, task } = await setupWithTask()
    await app.inject({
      method: 'POST', url: `/tasks/${task.id}/worker-confirm`,
      headers: auth(bob.token),
    })
    const res = await app.inject({
      method: 'POST', url: `/tasks/${task.id}/user-confirm`,
      headers: auth(alice.token),
    })
    assert.equal(res.statusCode, 200)
    const t = res.json().task
    assert.equal(t.status, 'COMPLETED')
    assert.ok(t.userConfirmedAt)
    assert.ok(t.closedAt)
  })

  test('user cannot confirm before worker', async () => {
    const { alice, task } = await setupWithTask()
    const res = await app.inject({
      method: 'POST', url: `/tasks/${task.id}/user-confirm`,
      headers: auth(alice.token),
    })
    assert.equal(res.statusCode, 409)
  })

  test('worker cannot user-confirm', async () => {
    const { alice, bob, task } = await setupWithTask()
    await app.inject({
      method: 'POST', url: `/tasks/${task.id}/worker-confirm`,
      headers: auth(bob.token),
    })
    const res = await app.inject({
      method: 'POST', url: `/tasks/${task.id}/user-confirm`,
      headers: auth(bob.token),
    })
    assert.equal(res.statusCode, 403)
  })

  test('cannot worker-confirm a COMPLETED task', async () => {
    const { alice, bob, task } = await setupWithTask()
    await app.inject({
      method: 'POST', url: `/tasks/${task.id}/worker-confirm`,
      headers: auth(bob.token),
    })
    await app.inject({
      method: 'POST', url: `/tasks/${task.id}/user-confirm`,
      headers: auth(alice.token),
    })
    const res = await app.inject({
      method: 'POST', url: `/tasks/${task.id}/worker-confirm`,
      headers: auth(bob.token),
    })
    assert.equal(res.statusCode, 409)
  })

  test('auto-confirm completes overdue tasks', async () => {
    const { bob, task } = await setupWithTask()
    await app.inject({
      method: 'POST', url: `/tasks/${task.id}/worker-confirm`,
      headers: auth(bob.token),
    })
    // Force auto_confirm_at into the past
    await app.db.query(
      `UPDATE tasks SET auto_confirm_at = now() - interval '1 minute' WHERE id = $1`,
      [task.id]
    )
    await app.autoConfirmTick()

    const res = await app.inject({
      method: 'GET', url: `/tasks/${task.id}`,
      headers: auth(bob.token),
    })
    assert.equal(res.json().task.status, 'COMPLETED')
  })

  test('auto-confirm ignores not-yet-due tasks', async () => {
    const { bob, task } = await setupWithTask()
    await app.inject({
      method: 'POST', url: `/tasks/${task.id}/worker-confirm`,
      headers: auth(bob.token),
    })
    // auto_confirm_at is now + 1h in the future
    await app.autoConfirmTick()

    const res = await app.inject({
      method: 'GET', url: `/tasks/${task.id}`,
      headers: auth(bob.token),
    })
    assert.equal(res.json().task.status, 'WORKER_CONFIRMED')
  })

  test('chat locks after completion', async () => {
    const { alice, bob, task } = await setupWithTask()
    await app.inject({
      method: 'POST', url: `/tasks/${task.id}/worker-confirm`,
      headers: auth(bob.token),
    })
    await app.inject({
      method: 'POST', url: `/tasks/${task.id}/user-confirm`,
      headers: auth(alice.token),
    })
    const res = await app.inject({
      method: 'POST', url: `/tasks/${task.id}/messages`,
      headers: auth(alice.token),
      payload: { type: 'TEXT', text: 'one more thing' },
    })
    assert.equal(res.statusCode, 409)
  })
})
