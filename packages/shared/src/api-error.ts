import { z } from 'zod';
import { ORDER_REJECT_REASONS } from './order.js';

/**
 * Códigos estables de error de la API REST. El cliente decide qué mostrar según el código;
 * `message` es solo para personas y puede cambiar.
 * Incluye todos los motivos de rechazo de una orden (`ORDER_REJECT_REASONS`).
 */
export const API_ERROR_CODES = [
  ...ORDER_REJECT_REASONS,
  'validation_error',
  'unauthorized',
  'not_found',
  'rate_limited',
  'internal',
] as const;
export const apiErrorCodeSchema = z.enum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/** Cuerpo de toda respuesta de error: `{ error: { code, message } }`. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/**
 * Estado HTTP de cada código. Un rechazo de negocio que no deja orden guardada responde 422;
 * si la orden sí se guarda, el rechazo viaja en `Order.rejectReason` (ADR-0004).
 */
export const API_ERROR_HTTP_STATUS: Record<ApiErrorCode, number> = {
  insufficient_funds: 422,
  insufficient_position: 422,
  invalid_quantity: 422,
  below_minimum: 422,
  no_price: 422,
  stale_price: 422,
  market_closed: 422,
  validation_error: 400,
  unauthorized: 401,
  not_found: 404,
  rate_limited: 429,
  internal: 500,
};
