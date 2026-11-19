import { z } from 'zod';
import { symbolSchema } from './instrument.js';
import { idSchema, priceSchema, quantitySchema, timestampSchema } from './primitives.js';

/** Ruta del servidor `api` para crear órdenes. El navegador usa `/api/orders`. */
export const ORDERS_PATH = '/orders';

/** Monto mínimo por orden en USD (D-01). Por debajo, el servidor rechaza con `below_minimum`. */
export const MIN_ORDER_USD = 10;

export const orderSideSchema = z.enum(['buy', 'sell']);
export type OrderSide = z.infer<typeof orderSideSchema>;

/** V0: solo órdenes market. */
export const orderTypeSchema = z.literal('market');
export type OrderType = z.infer<typeof orderTypeSchema>;

export const orderStatusSchema = z.enum(['pending', 'filled', 'rejected']);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/** Motivos de rechazo de una orden. Todos son también códigos de `apiError`. */
export const ORDER_REJECT_REASONS = [
  'insufficient_funds',
  'insufficient_position',
  'invalid_quantity',
  'below_minimum',
  'no_price',
  'stale_price',
  'market_closed',
] as const;
export const orderRejectReasonSchema = z.enum(ORDER_REJECT_REASONS);
export type OrderRejectReason = z.infer<typeof orderRejectReasonSchema>;

/**
 * Cuerpo de `POST /orders`. Se indica `quantity` (unidades del activo) o `amountUsd` (monto en
 * USD), exactamente uno de los dos. Con `amountUsd` el servidor calcula la cantidad con
 * `quantityPrecision`, redondeando hacia abajo (D-09). El mínimo de `MIN_ORDER_USD` lo valida el
 * servidor con `below_minimum`, no este esquema.
 */
export const placeOrderRequestSchema = z
  .object({
    symbol: symbolSchema,
    side: orderSideSchema,
    type: orderTypeSchema,
    quantity: quantitySchema.optional(),
    amountUsd: z.number().positive().finite().optional(),
    /** Generado por el cliente (UUID) para que un reintento no duplique la orden. */
    clientOrderId: idSchema,
  })
  .refine((order) => (order.quantity === undefined) !== (order.amountUsd === undefined), {
    message: 'Indica quantity o amountUsd, exactamente uno de los dos.',
  });
export type PlaceOrderRequest = z.infer<typeof placeOrderRequestSchema>;

export const orderSchema = z.object({
  id: idSchema,
  accountId: idSchema,
  /** Obligatorio desde el contrato v2; `null` solo en órdenes anteriores. */
  clientOrderId: idSchema.nullable(),
  symbol: symbolSchema,
  side: orderSideSchema,
  type: orderTypeSchema,
  /** Cantidad ejecutada o pedida, en unidades del activo. */
  quantity: quantitySchema,
  status: orderStatusSchema,
  filledPrice: priceSchema.nullable(),
  rejectReason: orderRejectReasonSchema.nullable(),
  createdAt: timestampSchema,
  filledAt: timestampSchema.nullable(),
});
export type Order = z.infer<typeof orderSchema>;
