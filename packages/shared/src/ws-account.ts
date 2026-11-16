import { z } from 'zod';
import { accountSchema } from './account.js';
import { orderSchema } from './order.js';
import { positionSchema } from './position.js';
import { idSchema } from './primitives.js';
import { wsErrorSchema, wsPingSchema, wsPongSchema } from './ws-common.js';

/** WebSocket privado de cuenta. Lo sirve `apps/api`. */
export const WS_ACCOUNT_PATH = '/ws/account';

export const accountClientMessageSchema = z.discriminatedUnion('type', [
  /** Primer mensaje obligatorio. El formato del token se define con la autenticación (fuera de V0). */
  z.object({ type: z.literal('auth'), token: z.string().min(1) }),
  wsPingSchema,
]);
export type AccountClientMessage = z.infer<typeof accountClientMessageSchema>;

export const accountServerMessageSchema = z.discriminatedUnion('type', [
  /** Estado completo. Se envía tras autenticar y tras cada reconexión. */
  z.object({
    type: z.literal('account.snapshot'),
    account: accountSchema,
    positions: z.array(positionSchema),
    orders: z.array(orderSchema),
  }),
  z.object({ type: z.literal('account.update'), data: accountSchema }),
  z.object({ type: z.literal('order.update'), data: orderSchema }),
  z.object({ type: z.literal('position.update'), data: positionSchema }),
  z.object({ type: z.literal('position.closed'), positionId: idSchema }),
  wsPongSchema,
  wsErrorSchema,
]);
export type AccountServerMessage = z.infer<typeof accountServerMessageSchema>;
