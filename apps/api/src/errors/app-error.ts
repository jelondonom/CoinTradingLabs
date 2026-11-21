/** Códigos estables de error de la API. El cliente decide qué mostrar según el código. */
export type AppErrorCode =
  | 'invalid_request'
  | 'unauthorized'
  | 'not_found'
  | 'invalid_quantity'
  | 'rate_limited'
  | 'internal';

/** Error esperado de la API: se responde con su código y su estado HTTP. */
export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    readonly statusCode: number,
    message: string,
    /** Cabeceras extra de la respuesta, por ejemplo `Retry-After` en un 429. */
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function unauthorized(message = 'Sesión inválida o vencida.'): AppError {
  return new AppError('unauthorized', 401, message);
}

export function invalidRequest(message: string): AppError {
  return new AppError('invalid_request', 400, message);
}

export function notFound(message: string): AppError {
  return new AppError('not_found', 404, message);
}

/**
 * 422 `invalid_quantity`: un rechazo de negocio que no deja orden guardada (contrato v2,
 * ADR-0004). Lo usa DEF-003 para las cantidades que no caben en `orders.quantity`.
 */
export function invalidQuantity(message: string): AppError {
  return new AppError('invalid_quantity', 422, message);
}

/** 429 con `Retry-After` en segundos (D-13). El código `rate_limited` está en el contrato v2. */
export function rateLimited(message: string, retryAfterSeconds: number): AppError {
  return new AppError('rate_limited', 429, message, { 'retry-after': String(retryAfterSeconds) });
}
