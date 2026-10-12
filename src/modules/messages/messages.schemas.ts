import { z } from 'zod'

const textMessage = z.object({
  type: z.literal('TEXT'),
  text: z.string().trim().min(1).max(4000),
})

const fileMessage = z.object({
  type: z.enum(['IMAGE', 'AUDIO', 'FILE']),
  fileUrl: z.url(),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().nonnegative(),
})

export const createMessageSchema = z.discriminatedUnion('type', [
  textMessage,
  fileMessage,
])
