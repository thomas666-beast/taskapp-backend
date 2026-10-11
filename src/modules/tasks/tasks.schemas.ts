import { z } from 'zod'

export const createTaskSchema = z.object({
  workerId: z.uuid(),
  title: z.string().min(3).max(120).trim(),
})
