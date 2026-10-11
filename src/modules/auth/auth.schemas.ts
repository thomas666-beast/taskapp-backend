import { z } from 'zod'

export const registerSchema = z.object({
  username: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(6).max(72),
  role: z.enum(['USER', 'WORKER']),
})

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})
