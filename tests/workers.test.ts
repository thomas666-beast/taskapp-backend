import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'
import { makeApp, truncateAll, registerUser, auth } from './helpers.js'

describe('workers', () => {
  let app: FastifyInstance

  before(async () => { app = await makeApp() })
  after(async () => { await app.close() })
  beforeEach(async () => { await truncateAll(app) })

  test('worker can set their description', async () => {
    const bob = await registerUser(app, 'bob', 'WORKER')
    const res = await app.inject({
      method: 'PUT',
      url: '/me/worker-profile',
      headers: auth(bob.token),
      payload: { description: 'I fix laptops.' },
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.json().profile.description, 'I fix laptops.')
  })

  test('worker can update their description (upsert)', async () => {
    const bob = await registerUser(app, 'bob', 'WORKER')
    await app.inject({
      method: 'PUT',
      url: '/me/worker-profile',
      headers: auth(bob.token),
      payload: { description: 'first' },
    })
    const res = await app.inject({
      method: 'PUT',
      url: '/me/worker-profile',
      headers: auth(bob.token),
      payload: { description: 'second' },
    })
    assert.equal(res.json().profile.description, 'second')
  })

  test('non-worker cannot set worker profile', async () => {
    const alice = await registerUser(app, 'alice', 'USER')
    const res = await app.inject({
      method: 'PUT',
      url: '/me/worker-profile',
      headers: auth(alice.token),
      payload: { description: 'nope' },
    })
    assert.equal(res.statusCode, 403)
  })

  test('GET /workers lists only workers', async () => {
    const alice = await registerUser(app, 'alice', 'USER')
    await registerUser(app, 'bob', 'WORKER')
    await registerUser(app, 'carol', 'WORKER')

    const res = await app.inject({
      method: 'GET',
      url: '/workers',
      headers: auth(alice.token),
    })
    assert.equal(res.statusCode, 200)
    const workers = res.json().workers
    assert.equal(workers.length, 2)
    const names = workers.map((w: any) => w.username).sort()
    assert.deepEqual(names, ['bob', 'carol'])
  })

  test('GET /workers/:id returns worker details', async () => {
    const alice = await registerUser(app, 'alice', 'USER')
    const bob = await registerUser(app, 'bob', 'WORKER')

    await app.inject({
      method: 'PUT',
      url: '/me/worker-profile',
      headers: auth(bob.token),
      payload: { description: 'Plumber.' },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/workers/${bob.id}`,
      headers: auth(alice.token),
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.json().worker.description, 'Plumber.')
  })

  test('GET /workers/:id rejects user id (non-worker)', async () => {
    const alice = await registerUser(app, 'alice', 'USER')
    const res = await app.inject({
      method: 'GET',
      url: `/workers/${alice.id}`,
      headers: auth(alice.token),
    })
    assert.equal(res.statusCode, 404)
  })
})
