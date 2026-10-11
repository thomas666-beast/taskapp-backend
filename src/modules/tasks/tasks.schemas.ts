import { z } from 'zod'

export const createTaskSchema = z.object({
  workerId: z.uuid(),
  title: z.string().trim().min(3).max(120),
})
