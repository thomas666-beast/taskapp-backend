import { z } from 'zod'

export const createMessageSchema = z.object({
  type: z.literal('TEXT'),
  text: z.string().trim().min(1).max(4000),
})
