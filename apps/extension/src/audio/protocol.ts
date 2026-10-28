import { z } from 'zod';
export const OwnerCommandSchema = z.discriminatedUnion('type', [
  z
    .object({
      target: z.literal('offscreen'),
      type: z.literal('AUDIO_START'),
      sessionId: z.string(),
      streamId: z.string().optional(),
      micOnly: z.boolean().optional(),
      paused: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      target: z.literal('offscreen'),
      type: z.literal('AUDIO_PAUSE'),
      paused: z.boolean(),
    })
    .strict(),
  z
    .object({ target: z.literal('offscreen'), type: z.literal('AUDIO_STOP') })
    .strict(),
  z
    .object({ target: z.literal('offscreen'), type: z.literal('AUDIO_RETRY') })
    .strict(),
  z
    .object({ target: z.literal('offscreen'), type: z.literal('AUDIO_STATUS') })
    .strict(),
  z
    .object({
      target: z.literal('offscreen'),
      type: z.literal('AUDIO_PERMISSION'),
    })
    .strict(),
]);
export type OwnerCommand = z.infer<typeof OwnerCommandSchema>;
export const TabEndedSchema = z
  .object({
    type: z.literal('AUDIO_TAB_ENDED'),
    sessionId: z.string(),
    ownerId: z.string(),
  })
  .strict();
