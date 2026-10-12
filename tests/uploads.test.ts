import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'
import { makeApp, truncateAll, registerUser, auth } from './helpers.js'

describe('uploads', () => {
  let app: FastifyInstance

  before(async () => { app = await makeApp() })
  after(async () => { await app.close() })
  beforeEach(async () => { await truncateAll(app) })

  function formData(fields: Record<string, { value: Buffer; filename: string; contentType: string }>) {
    const boundary = '----test' + Math.random().toString(36).slice(2)
    const chunks: Buffer[] = []
    for (const [name, f] of Object.entries(fields)) {
      chunks.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${name}"; filename="${f.filename}"\r\n` +
        `Content-Type: ${f.contentType}\r\n\r\n`
      ))
      chunks.push(f.value)
      chunks.push(Buffer.from('\r\n'))
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`))
    return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` }
  }

  test('upload a PNG returns url + name + size + mime', async () => {
    const alice = await registerUser(app, 'alice')
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const fd = formData({ file: { value: png, filename: 'test.png', contentType: 'image/png' } })

    const res = await app.inject({
      method: 'POST', url: '/uploads',
      headers: { ...auth(alice.token), 'content-type': fd.contentType },
      payload: fd.body,
    })
    assert.equal(res.statusCode, 201)
    const body = res.json()
    assert.match(body.url, /\/uploads\/[a-f0-9-]+\.png$/)
    assert.equal(body.name, 'test.png')
    assert.equal(body.mime, 'image/png')
    assert.equal(body.size, png.length)
  })

  test('rejects disallowed mime type', async () => {
    const alice = await registerUser(app, 'alice')
    const fd = formData({ file: { value: Buffer.from('MZ'), filename: 'evil.exe', contentType: 'application/x-msdownload' } })
    const res = await app.inject({
      method: 'POST', url: '/uploads',
      headers: { ...auth(alice.token), 'content-type': fd.contentType },
      payload: fd.body,
    })
    assert.equal(res.statusCode, 415)
  })

  test('upload requires auth', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const fd = formData({ file: { value: png, filename: 'test.png', contentType: 'image/png' } })
    const res = await app.inject({
      method: 'POST', url: '/uploads',
      headers: { 'content-type': fd.contentType },
      payload: fd.body,
    })
    assert.equal(res.statusCode, 401)
  })
})
