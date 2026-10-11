export type Role = 'USER' | 'WORKER' | 'ADMIN'

export type PublicWorker = {
  id: string
  username: string
  description: string
  createdAt: Date
}
