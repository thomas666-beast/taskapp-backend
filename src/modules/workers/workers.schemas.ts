import { z } from 'zod'

export const updateWorkerProfileSchema = z.object({
  description: z.string().max(500).trim(),
})
