/** Códigos estables de error de la API. El cliente decide qué mostrar según el código. */
export type AppErrorCode = 'invalid_request' | 'unauthorized' | 'not_found' | 'internal';

/** Error esperado de la API: se responde con su código y su estado HTTP. */
export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    readonly statusCode: number,
    message: string,
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
