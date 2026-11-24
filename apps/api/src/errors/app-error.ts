import { API_ERROR_HTTP_STATUS, type ApiErrorCode } from '@coin/shared';

/**
 * Error esperado de la API. El código es uno del contrato (`API_ERROR_CODES`) y el estado HTTP
 * sale de `API_ERROR_HTTP_STATUS`: no se puede responder un par que el contrato no conoce.
 */
export class AppError extends Error {
  readonly statusCode: number;

  constructor(
    readonly code: ApiErrorCode,
    message: string,
    /** Cabeceras extra de la respuesta, por ejemplo `Retry-After` en un 429. */
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = API_ERROR_HTTP_STATUS[code];
  }
}

/** 400: el cuerpo o los parámetros no cumplen el contrato. */
export function validationError(message: string): AppError {
  return new AppError('validation_error', message);
}

export function unauthorized(message = 'Sesión inválida o vencida.'): AppError {
  return new AppError('unauthorized', message);
}

export function notFound(message: string): AppError {
  return new AppError('not_found', message);
}

/**
 * 422 `invalid_quantity`: un rechazo de negocio que no deja orden guardada (contrato v2,
 * ADR-0004). Lo usa DEF-003 para las cantidades que no caben en `orders.quantity`.
 */
export function invalidQuantity(message: string): AppError {
  return new AppError('invalid_quantity', message);
}

/** 429 con `Retry-After` en segundos (D-13). */
export function rateLimited(message: string, retryAfterSeconds: number): AppError {
  return new AppError('rate_limited', message, { 'retry-after': String(retryAfterSeconds) });
}

/**
 * 500 con un mensaje fijo. El detalle del error nunca va en la respuesta, solo al log: en un repo
 * público, una ruta de archivo o una consulta SQL le dan pistas a quien quiera atacar.
 */
export function internalError(): AppError {
  return new AppError('internal', 'Error interno.');
}
