import { z } from 'zod';
import { symbolSchema } from './instrument.js';
import {
  idSchema,
  moneySchema,
  priceSchema,
  quantitySchema,
  timestampSchema,
} from './primitives.js';

/**
 * El contrato admite cortos; en V0.1 solo hay largos (D-02) y eso lo aplica el motor de trading.
 */
export const positionSideSchema = z.enum(['long', 'short']);
export type PositionSide = z.infer<typeof positionSideSchema>;

/** Posición abierta. Una posición cerrada deja de existir (ver `position.closed`). */
export const positionSchema = z.object({
  id: idSchema,
  accountId: idSchema,
  symbol: symbolSchema,
  side: positionSideSchema,
  quantity: quantitySchema,
  avgEntryPrice: priceSchema,
  /** Precio de valoración: `bid` para posiciones largas (D-10). */
  marketPrice: priceSchema,
  unrealizedPnl: moneySchema,
  realizedPnl: moneySchema,
  openedAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type Position = z.infer<typeof positionSchema>;

/**
 * `POST /positions/:id/close`: cierra la posición completa con una orden market. Responde la orden
 * creada (`orderSchema`), 201 si es nueva y 200 si repite un `clientOrderId` ya usado.
 */
export const CLOSE_POSITION_ROUTE = '/positions/:id/close';
export const closePositionPath = (positionId: string): string =>
  `/positions/${encodeURIComponent(positionId)}/close`;

export const closePositionRequestSchema = z.object({
  /** Generado por el cliente (UUID) para que un reintento no cierre dos veces. */
  clientOrderId: idSchema,
});
export type ClosePositionRequest = z.infer<typeof closePositionRequestSchema>;
