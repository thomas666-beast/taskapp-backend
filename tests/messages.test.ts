import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'
import { makeApp, truncateAll, registerUser, auth } from './helpers.js'

describe('messages', () => {
  let app: FastifyInstance

  before(async () => { app = await makeApp() })
  after(async () => { await app.close() })
  beforeEach(async () => { await truncateAll(app) })

  async function setupWithTask() {
    const alice = await registerUser(app, 'alice', 'USER')
    const bob = await registerUser(app, 'bob', 'WORKER')
    const createRes = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'Fix laptop' },
    })
    const task = createRes.json().task
    return { alice, bob, task }
  }

  test('user sends a text message', async () => {
    const { alice, task } = await setupWithTask()
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/messages`,
      headers: auth(alice.token),
      payload: { type: 'TEXT', text: 'Hi, laptop makes a noise' },
    })
    assert.equal(res.statusCode, 201)
    const msg = res.json().message
    assert.equal(msg.text, 'Hi, laptop makes a noise')
    assert.equal(msg.type, 'TEXT')
    assert.equal(msg.senderId, alice.id)
    assert.equal(msg.taskId, task.id)
  })

  test('worker sends a text message', async () => {
    const { bob, task } = await setupWithTask()
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/messages`,
      headers: auth(bob.token),
      payload: { type: 'TEXT', text: 'On it' },
    })
    assert.equal(res.statusCode, 201)
    assert.equal(res.json().message.senderId, bob.id)
  })

  test('message history is ordered chronologically', async () => {
    const { alice, bob, task } = await setupWithTask()
    const url = `/tasks/${task.id}/messages`

    await app.inject({ method: 'POST', url, headers: auth(alice.token), payload: { type: 'TEXT', text: 'one' } })
    await app.inject({ method: 'POST', url, headers: auth(bob.token), payload: { type: 'TEXT', text: 'two' } })
    await app.inject({ method: 'POST', url, headers: auth(alice.token), payload: { type: 'TEXT', text: 'three' } })

    const res = await app.inject({ method: 'GET', url, headers: auth(alice.token) })
    assert.equal(res.statusCode, 200)
    const texts = res.json().messages.map((m: any) => m.text)
    assert.deepEqual(texts, ['one', 'two', 'three'])
  })

  test('non-participant cannot post message', async () => {
    const { task } = await setupWithTask()
    const carol = await registerUser(app, 'carol', 'USER')
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/messages`,
      headers: auth(carol.token),
      payload: { type: 'TEXT', text: 'intruder' },
    })
    assert.equal(res.statusCode, 403)
  })

  test('non-participant cannot read messages', async () => {
    const { alice, task } = await setupWithTask()
    await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/messages`,
      headers: auth(alice.token),
      payload: { type: 'TEXT', text: 'secret' },
    })
    const carol = await registerUser(app, 'carol', 'USER')
    const res = await app.inject({
      method: 'GET',
      url: `/tasks/${task.id}/messages`,
      headers: auth(carol.token),
    })
    assert.equal(res.statusCode, 403)
  })

  test('cannot post message to completed task', async () => {
    const { alice, task } = await setupWithTask()
    // Force-complete directly in DB for this test
    await app.db.query(`UPDATE tasks SET status = 'COMPLETED' WHERE id = $1`, [task.id])

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/messages`,
      headers: auth(alice.token),
      payload: { type: 'TEXT', text: 'too late' },
    })
    assert.equal(res.statusCode, 409)
    assert.match(res.json().error, /locked/i)
  })

  test('can still read messages after task completed', async () => {
    const { alice, task } = await setupWithTask()
    await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/messages`,
      headers: auth(alice.token),
      payload: { type: 'TEXT', text: 'before completion' },
    })
    await app.db.query(`UPDATE tasks SET status = 'COMPLETED' WHERE id = $1`, [task.id])

    const res = await app.inject({
      method: 'GET',
      url: `/tasks/${task.id}/messages`,
      headers: auth(alice.token),
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.json().messages.length, 1)
  })

  test('rejects empty text', async () => {
    const { alice, task } = await setupWithTask()
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/messages`,
      headers: auth(alice.token),
      payload: { type: 'TEXT', text: '   ' },
    })
    assert.equal(res.statusCode, 400)
  })

  test('rejects non-TEXT type in V1', async () => {
    const { alice, task } = await setupWithTask()
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/messages`,
      headers: auth(alice.token),
      payload: { type: 'IMAGE', fileUrl: 'x' },
    })
    assert.equal(res.statusCode, 400)
  })

  test('messages require auth', async () => {
    const { task } = await setupWithTask()
    const res = await app.inject({
      method: 'GET',
      url: `/tasks/${task.id}/messages`,
    })
    assert.equal(res.statusCode, 401)
  })
})
