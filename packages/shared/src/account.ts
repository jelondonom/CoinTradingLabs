import { z } from 'zod';
import { positionSchema } from './position.js';
import { idSchema, moneySchema, timestampSchema } from './primitives.js';

/** Ruta del servidor `api`. El navegador usa `/api/account`. */
export const ACCOUNT_PATH = '/account';

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

/**
 * Vista de la cuenta para el participante: saldo, equity y P&L.
 * Invariante: `equity − initialBalance = realizedPnl + unrealizedPnl` (`docs/engine-rules.md`).
 */
export const accountViewSchema = accountSchema.extend({
  /** P&L acumulado de lo ya cerrado o vendido. */
  realizedPnl: moneySchema,
  /** P&L de las posiciones abiertas, valoradas al `bid` (D-10). */
  unrealizedPnl: moneySchema,
});
export type AccountView = z.infer<typeof accountViewSchema>;

/** Respuesta de `GET /account`. */
export const accountResponseSchema = z.object({
  account: accountViewSchema,
  /** Posiciones abiertas. */
  positions: z.array(positionSchema),
});
export type AccountResponse = z.infer<typeof accountResponseSchema>;
