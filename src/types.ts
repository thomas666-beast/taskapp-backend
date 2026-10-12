export type Role = 'USER' | 'WORKER' | 'ADMIN'

export type PublicWorker = {
  id: string
  username: string
  description: string
  createdAt: Date
}

export type TaskStatus = 'OPEN' | 'WORKER_CONFIRMED' | 'COMPLETED' | 'CANCELLED'

export type Task = {
  id: string
  userId: string
  workerId: string
  title: string
  status: TaskStatus
  rating: number | null
  workerConfirmedAt: Date | null
  userConfirmedAt: Date | null
  autoConfirmAt: Date | null
  createdAt: Date
  updatedAt: Date
  closedAt: Date | null
}

export type MessageType = 'TEXT' | 'IMAGE' | 'AUDIO' | 'FILE'

export type Message = {
  id: string
  taskId: string
  senderId: string
  type: MessageType
  text: string | null
  fileUrl: string | null
  fileName: string | null
  fileSize: number | null
  createdAt: Date
}

export type WorkerStats = {
  total: number
  open: number
  workerConfirmed: number
  completed: number
  cancelled: number
  rated: number
  averageRating: number | null
}
