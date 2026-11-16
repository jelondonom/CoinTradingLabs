import { z } from 'zod';
import { symbolSchema } from './instrument.js';
import {
  idSchema,
  moneySchema,
  priceSchema,
  quantitySchema,
  timestampSchema,
} from './primitives.js';

/** El contrato admite cortos; que se habiliten en V0 lo decide el motor de trading. */
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
  marketPrice: priceSchema,
  unrealizedPnl: moneySchema,
  realizedPnl: moneySchema,
  openedAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type Position = z.infer<typeof positionSchema>;
