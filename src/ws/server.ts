import type { FastifyInstance } from 'fastify'
import { WebSocketServer, WebSocket } from 'ws'

type Room = Set<WebSocket>

const rooms = new Map<string, Room>()

export function broadcastToTask(_app: FastifyInstance, taskId: string, payload: unknown) {
  const room = rooms.get(`task:${taskId}`)
  if (!room) return
  const data = JSON.stringify(payload)
  for (const socket of room) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(data)
    }
  }
}

export function closeAllSockets() {
  for (const room of rooms.values()) {
    for (const socket of room) {
      try { socket.terminate() } catch {}
    }
  }
  rooms.clear()
}

export default async function wsRoutes(app: FastifyInstance) {
  const wss = new WebSocketServer({ noServer: true })

  app.server.on('upgrade', (req, socket, head) => {
    const u = new URL(req.url ?? '/', 'http://localhost')
    if (u.pathname !== '/ws') {
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket as any, head, (ws) => {
      // Attach the connection handler here — synchronously — so
      // any message arriving immediately after upgrade is captured.
      handleConnection(app, ws, u)
    })
  })

  app.addHook('preClose', async () => {
    closeAllSockets()
    await new Promise<void>((resolve) => wss.close(() => resolve()))
  })
}

function handleConnection(app: FastifyInstance, socket: WebSocket, url: URL) {
  const token = url.searchParams.get('token')

  if (!token) {
    socket.send(JSON.stringify({ type: 'error', error: 'Missing token' }))
    socket.close(4001, 'Missing token')
    setTimeout(() => { try { socket.terminate() } catch {} }, 500)
    return
  }

  let userId: string
  try {
    const payload = app.jwt.verify(token) as { sub: string; role: string }
    userId = payload.sub
  } catch {
    socket.send(JSON.stringify({ type: 'error', error: 'Invalid token' }))
    socket.close(4001, 'Invalid token')
    setTimeout(() => { try { socket.terminate() } catch {} }, 500)
    return
  }

  // ── IMPORTANT: attach message listener FIRST, then send ready ──
  let currentRoom: string | null = null

  socket.on('message', async (raw: any) => {
    try {
      let msg: { type: string; taskId?: string }
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }

      if (msg.type === 'task:join' && msg.taskId) {
        const { rowCount } = await app.db.query(
          `SELECT 1 FROM tasks
           WHERE id = $1 AND (user_id = $2 OR worker_id = $2)`,
          [msg.taskId, userId]
        )
        if (!rowCount) {
          socket.send(JSON.stringify({ type: 'error', error: 'Not a participant' }))
          return
        }

        if (currentRoom) rooms.get(currentRoom)?.delete(socket)
        currentRoom = `task:${msg.taskId}`
        if (!rooms.has(currentRoom)) rooms.set(currentRoom, new Set())
        rooms.get(currentRoom)!.add(socket)
        socket.send(JSON.stringify({ type: 'task:joined', taskId: msg.taskId }))
      }

      if (msg.type === 'task:leave') {
        if (currentRoom) {
          rooms.get(currentRoom)?.delete(socket)
          currentRoom = null
        }
      }
    } catch (err) {
      try {
        socket.send(JSON.stringify({ type: 'error', error: 'Internal error' }))
      } catch {}
    }
  })

  socket.on('close', () => {
    if (currentRoom) rooms.get(currentRoom)?.delete(socket)
  })

  socket.on('error', () => {
    if (currentRoom) rooms.get(currentRoom)?.delete(socket)
  })

  // NOW send ready — after message listener is attached
  socket.send(JSON.stringify({ type: 'ready' }))
}
