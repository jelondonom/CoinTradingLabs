import { z } from 'zod';
import { accountViewSchema } from './account.js';
import { orderSchema } from './order.js';
import { positionSchema } from './position.js';
import { idSchema } from './primitives.js';
import { wsErrorSchema, wsPingSchema, wsPongSchema } from './ws-common.js';

/**
 * WebSocket privado de cuenta. Lo sirve `apps/api`. Se autentica con la cookie de sesión que el
 * navegador envía al abrir la conexión (D-04); no hay mensaje `auth`. El servidor valida también
 * la cabecera `Origin`.
 */
export const WS_ACCOUNT_PATH = '/ws/account';

/** Código de cierre si la cookie falta, venció o no es válida. El cliente vuelve al login. */
export const WS_CLOSE_UNAUTHORIZED = 4401;

export const accountClientMessageSchema = z.discriminatedUnion('type', [wsPingSchema]);
export type AccountClientMessage = z.infer<typeof accountClientMessageSchema>;

/**
 * Mensajes del servidor. Tras cada ejecución llegan, en este orden: `order.filled` u
 * `order.rejected`, `position.update` o `position.closed`, y `account.update`.
 * Entre ejecuciones el cliente recalcula el P&L no realizado con los ticks del WS de mercado.
 */
export const accountServerMessageSchema = z.discriminatedUnion('type', [
  /** Estado completo. Se envía al conectar y tras cada reconexión. */
  z.object({
    type: z.literal('account.snapshot'),
    account: accountViewSchema,
    positions: z.array(positionSchema),
    /** Órdenes recientes, de la más nueva a la más antigua. */
    orders: z.array(orderSchema),
  }),
  /** Saldo, equity o P&L cambiaron. */
  z.object({ type: z.literal('account.update'), data: accountViewSchema }),
  /** Orden ejecutada (`status: 'filled'`). */
  z.object({ type: z.literal('order.filled'), data: orderSchema }),
  /** Orden rechazada (`status: 'rejected'`, con `rejectReason`). */
  z.object({ type: z.literal('order.rejected'), data: orderSchema }),
  z.object({ type: z.literal('position.update'), data: positionSchema }),
  z.object({ type: z.literal('position.closed'), positionId: idSchema }),
  wsPongSchema,
  wsErrorSchema,
]);
export type AccountServerMessage = z.infer<typeof accountServerMessageSchema>;
