import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'
import { makeApp, truncateAll, registerUser, auth } from './helpers.js'

describe('file messages', () => {
  let app: FastifyInstance

  before(async () => { app = await makeApp() })
  after(async () => { await app.close() })
  beforeEach(async () => { await truncateAll(app) })

  async function setup() {
    const alice = await registerUser(app, 'alice', 'USER')
    const bob = await registerUser(app, 'bob', 'WORKER')
    const res = await app.inject({
      method: 'POST', url: '/tasks', headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'Fix laptop' },
    })
    return { alice, bob, task: res.json().task }
  }

  test('user sends an IMAGE message', async () => {
    const { alice, task } = await setup()
    const res = await app.inject({
      method: 'POST', url: `/tasks/${task.id}/messages`,
      headers: auth(alice.token),
      payload: {
        type: 'IMAGE',
        fileUrl: 'http://localhost:4000/uploads/abc.png',
        fileName: 'screen.png',
        fileSize: 1234,
      },
    })
    assert.equal(res.statusCode, 201)
    const msg = res.json().message
    assert.equal(msg.type, 'IMAGE')
    assert.equal(msg.text, null)
    assert.equal(msg.fileName, 'screen.png')
    assert.equal(msg.fileSize, 1234)
  })

  test('AUDIO message round-trips', async () => {
    const { alice, task } = await setup()
    const res = await app.inject({
      method: 'POST', url: `/tasks/${task.id}/messages`,
      headers: auth(alice.token),
      payload: {
        type: 'AUDIO',
        fileUrl: 'http://localhost:4000/uploads/voice.mp3',
        fileName: 'voice.mp3',
        fileSize: 5000,
      },
    })
    assert.equal(res.statusCode, 201)
    assert.equal(res.json().message.type, 'AUDIO')
  })

  test('IMAGE message without fileUrl is rejected', async () => {
    const { alice, task } = await setup()
    const res = await app.inject({
      method: 'POST', url: `/tasks/${task.id}/messages`,
      headers: auth(alice.token),
      payload: { type: 'IMAGE' },
    })
    assert.equal(res.statusCode, 400)
  })
})
