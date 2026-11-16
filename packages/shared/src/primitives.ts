import { z } from 'zod';

/** Versión de los contratos. Se incrementa con cada cambio incompatible. */
export const CONTRACT_VERSION = 0;

/** Marca de tiempo: milisegundos desde epoch, UTC. */
export const timestampSchema = z.number().int().nonnegative();
export type Timestamp = z.infer<typeof timestampSchema>;

export const idSchema = z.uuid();
export type Id = z.infer<typeof idSchema>;

/** Precio en la moneda de cotización. Siempre mayor que cero. */
export const priceSchema = z.number().positive().finite();

/** Cantidad en unidades del activo base (BTC, acciones, EUR, onzas). Siempre mayor que cero. */
export const quantitySchema = z.number().positive().finite();

/** Monto de dinero en USD. Puede ser negativo (por ejemplo, un P&L). */
export const moneySchema = z.number().finite();
