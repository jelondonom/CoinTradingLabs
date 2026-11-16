import { z } from 'zod';
import { idSchema, moneySchema, timestampSchema } from './primitives.js';

/** Supuestos V0. */
export const INITIAL_BALANCE_USD = 100_000;
/** 1:1, sin margen ni stop-out. */
export const LEVERAGE = 1;

export const accountSchema = z.object({
  id: idSchema,
  currency: z.literal('USD'),
  initialBalance: moneySchema,
  /** Efectivo disponible. */
  balance: moneySchema,
  /** Efectivo más el valor de mercado de las posiciones abiertas. Base del ranking. */
  equity: moneySchema,
  leverage: z.literal(LEVERAGE),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type Account = z.infer<typeof accountSchema>;
