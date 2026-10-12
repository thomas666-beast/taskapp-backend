import { WebSocket } from 'ws'

const BASE = 'http://localhost:4000'

async function register(username, role) {
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'secret123', role }),
  })
  return res.json()
}

async function createTask(token, workerId) {
  const res = await fetch(`${BASE}/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ workerId, title: 'WS manual test' }),
  })
  return res.json()
}

const suffix = Date.now()
const alice = await register(`alice_${suffix}`, 'USER')
const bob = await register(`bob_${suffix}`, 'WORKER')
const { task } = await createTask(alice.token, bob.user.id)
console.log('task created:', task.id)

const ws = new WebSocket(`ws://localhost:4000/ws?token=${alice.token}`)

ws.on('open', () => console.log('CLIENT: open'))
ws.on('error', (e) => console.log('CLIENT: error', e.message))
ws.on('close', (c, r) => console.log('CLIENT: close', c, r.toString()))
ws.on('message', (raw) => {
  const text = raw.toString()
  console.log('CLIENT: message →', text)
  const msg = JSON.parse(text)
  if (msg.type === 'ready') {
    console.log('CLIENT: sending task:join')
    ws.send(JSON.stringify({ type: 'task:join', taskId: task.id }))
  }
  if (msg.type === 'task:joined') {
    console.log('CLIENT: got task:joined — SUCCESS')
    ws.close()
    process.exit(0)
  }
  if (msg.type === 'error') {
    console.log('CLIENT: server error —', msg.error)
    process.exit(1)
  }
})

setTimeout(() => {
  console.log('CLIENT: TIMEOUT')
  process.exit(2)
}, 5000)
