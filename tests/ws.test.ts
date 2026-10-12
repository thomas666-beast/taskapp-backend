import { test, describe, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'
import { WebSocket } from 'ws'
import { makeApp, truncateAll, registerUser, auth } from './helpers.js'

type Client = {
  ws: WebSocket
  next: (timeoutMs?: number) => Promise<any>
  waitOpen: (timeoutMs?: number) => Promise<void>
  waitClose: (timeoutMs?: number) => Promise<number>
  terminate: () => void
}

describe('websocket', () => {
  let app: FastifyInstance
  let port: number
  const clients: Client[] = []

  before(async () => {
    app = await makeApp()
    await app.listen({ port: 0, host: '127.0.0.1' })
    port = (app.server.address() as any).port
  })

  after(async () => {
    for (const c of clients) c.terminate()
    clients.length = 0
    await app.close()
  })

  beforeEach(async () => { await truncateAll(app) })

  afterEach(async () => {
    for (const c of clients) c.terminate()
    clients.length = 0
  })

  function connect(token?: string): Client {
    const url = token
      ? `ws://127.0.0.1:${port}/ws?token=${token}`
      : `ws://127.0.0.1:${port}/ws`
    const ws = new WebSocket(url)

    // Attach the message listener IMMEDIATELY so no message is missed.
    const queue: any[] = []
    const waiters: Array<{ resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }> = []

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      const w = waiters.shift()
      if (w) {
        clearTimeout(w.timer)
        w.resolve(msg)
      } else {
        queue.push(msg)
      }
    })

    ws.on('error', () => { /* swallow — close handles it */ })

    const client: Client = {
      ws,
      next(timeoutMs = 3000) {
        if (queue.length) return Promise.resolve(queue.shift())
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            const i = waiters.findIndex((w) => w.timer === timer)
            if (i >= 0) waiters.splice(i, 1)
            reject(new Error('timeout waiting for message'))
          }, timeoutMs)
          waiters.push({ resolve, reject, timer })
        })
      },
      waitOpen(timeoutMs = 2000) {
        return new Promise((resolve, reject) => {
          if (ws.readyState === WebSocket.OPEN) return resolve()
          const timer = setTimeout(() => reject(new Error('timeout waiting for open')), timeoutMs)
          ws.once('open', () => { clearTimeout(timer); resolve() })
          ws.once('error', (err) => { clearTimeout(timer); reject(err) })
        })
      },
      waitClose(timeoutMs = 3000) {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('timeout waiting for close')), timeoutMs)
          ws.once('close', (code) => { clearTimeout(timer); resolve(code) })
        })
      },
      terminate() {
        try { ws.terminate() } catch {}
      },
    }

    clients.push(client)
    return client
  }

  test('rejects connection without token', async () => {
    const c = connect()
    const code = await c.waitClose()
    assert.equal(code, 4001)
  })

  test('rejects connection with invalid token', async () => {
    const c = connect('garbage')
    const code = await c.waitClose()
    assert.equal(code, 4001)
  })

  test('participant can join task room and receive message:new', async () => {
    const alice = await registerUser(app, 'alice', 'USER')
    const bob = await registerUser(app, 'bob', 'WORKER')
    const createRes = await app.inject({
      method: 'POST', url: '/tasks', headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'Live test' },
    })
    const taskId = createRes.json().task.id

    const aliceC = connect(alice.token)
    await aliceC.waitOpen()
    const ready1 = await aliceC.next()
    assert.equal(ready1.type, 'ready')

    aliceC.ws.send(JSON.stringify({ type: 'task:join', taskId }))
    const joined = await aliceC.next()
    assert.equal(joined.type, 'task:joined')

    const bobC = connect(bob.token)
    await bobC.waitOpen()
    const ready2 = await bobC.next()
    assert.equal(ready2.type, 'ready')

    bobC.ws.send(JSON.stringify({ type: 'task:join', taskId }))
    const joined2 = await bobC.next()
    assert.equal(joined2.type, 'task:joined')

    await app.inject({
      method: 'POST', url: `/tasks/${taskId}/messages`,
      headers: auth(bob.token),
      payload: { type: 'TEXT', text: 'hello live' },
    })
    const evt = await aliceC.next()
    assert.equal(evt.type, 'message:new')
    assert.equal(evt.message.text, 'hello live')
  })

  test('non-participant cannot join task room', async () => {
    const alice = await registerUser(app, 'alice', 'USER')
    const bob = await registerUser(app, 'bob', 'WORKER')
    const carol = await registerUser(app, 'carol', 'USER')
    const createRes = await app.inject({
      method: 'POST', url: '/tasks', headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'Private' },
    })
    const taskId = createRes.json().task.id

    const carolC = connect(carol.token)
    await carolC.waitOpen()
    const ready = await carolC.next()
    assert.equal(ready.type, 'ready')

    carolC.ws.send(JSON.stringify({ type: 'task:join', taskId }))
    const evt = await carolC.next()
    assert.equal(evt.type, 'error')
  })

  test('worker-confirm broadcasts task:updated', async () => {
    const alice = await registerUser(app, 'alice', 'USER')
    const bob = await registerUser(app, 'bob', 'WORKER')
    const createRes = await app.inject({
      method: 'POST', url: '/tasks', headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'Broadcast test' },
    })
    const taskId = createRes.json().task.id

    const aliceC = connect(alice.token)
    await aliceC.waitOpen()
    await aliceC.next() // ready
    aliceC.ws.send(JSON.stringify({ type: 'task:join', taskId }))
    await aliceC.next() // joined

    await app.inject({
      method: 'POST', url: `/tasks/${taskId}/worker-confirm`,
      headers: auth(bob.token),
    })

    const evt = await aliceC.next()
    assert.equal(evt.type, 'task:updated')
    assert.equal(evt.task.status, 'WORKER_CONFIRMED')
  })

  test('rating broadcasts task:updated', async () => {
    const alice = await registerUser(app, 'alice', 'USER')
    const bob = await registerUser(app, 'bob', 'WORKER')
    const createRes = await app.inject({
      method: 'POST', url: '/tasks', headers: auth(alice.token),
      payload: { workerId: bob.id, title: 'Rate broadcast' },
    })
    const taskId = createRes.json().task.id

    // Complete the task first
    await app.inject({
      method: 'POST', url: `/tasks/${taskId}/worker-confirm`,
      headers: auth(bob.token),
    })
    await app.inject({
      method: 'POST', url: `/tasks/${taskId}/user-confirm`,
      headers: auth(alice.token),
    })

    const bobC = connect(bob.token)
    await bobC.waitOpen()
    await bobC.next() // ready
    bobC.ws.send(JSON.stringify({ type: 'task:join', taskId }))
    await bobC.next() // joined

    await app.inject({
      method: 'POST', url: `/tasks/${taskId}/rate`,
      headers: auth(alice.token),
      payload: { rating: 5 },
    })

    const evt = await bobC.next()
    assert.equal(evt.type, 'task:updated')
    assert.equal(evt.task.rating, 5)
  })
})
