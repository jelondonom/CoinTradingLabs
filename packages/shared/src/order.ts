import { z } from 'zod';
import { symbolSchema } from './instrument.js';
import { idSchema, priceSchema, quantitySchema, timestampSchema } from './primitives.js';

export const orderSideSchema = z.enum(['buy', 'sell']);
export type OrderSide = z.infer<typeof orderSideSchema>;

/** V0: solo órdenes market. */
export const orderTypeSchema = z.literal('market');
export type OrderType = z.infer<typeof orderTypeSchema>;

export const orderStatusSchema = z.enum(['pending', 'filled', 'rejected']);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const orderRejectReasonSchema = z.enum([
  'insufficient_funds',
  'insufficient_position',
  'invalid_quantity',
  'no_price',
  'market_closed',
]);
export type OrderRejectReason = z.infer<typeof orderRejectReasonSchema>;

/** Cuerpo de la petición para crear una orden. */
export const placeOrderRequestSchema = z.object({
  symbol: symbolSchema,
  side: orderSideSchema,
  type: orderTypeSchema,
  quantity: quantitySchema,
  /** Generado por el cliente para que un reintento no duplique la orden. */
  clientOrderId: idSchema.optional(),
});
export type PlaceOrderRequest = z.infer<typeof placeOrderRequestSchema>;

export const orderSchema = z.object({
  id: idSchema,
  accountId: idSchema,
  clientOrderId: idSchema.nullable(),
  symbol: symbolSchema,
  side: orderSideSchema,
  type: orderTypeSchema,
  quantity: quantitySchema,
  status: orderStatusSchema,
  filledPrice: priceSchema.nullable(),
  rejectReason: orderRejectReasonSchema.nullable(),
  createdAt: timestampSchema,
  filledAt: timestampSchema.nullable(),
});
export type Order = z.infer<typeof orderSchema>;
