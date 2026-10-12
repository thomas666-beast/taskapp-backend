import { z } from 'zod'

export const rateTaskSchema = z.object({
  rating: z.number().int().min(1).max(5),
})
