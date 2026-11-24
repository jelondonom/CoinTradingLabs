import { API_ERROR_HTTP_STATUS, apiErrorCodeSchema } from '@coin/shared';
import { describe, expect, it } from 'vitest';
import {
  type AppError,
  internalError,
  invalidQuantity,
  notFound,
  rateLimited,
  unauthorized,
  validationError,
} from './app-error.js';

describe('AppError', () => {
  it('cada helper usa un código del contrato y el estado de API_ERROR_HTTP_STATUS', () => {
    const cases: [AppError, string, number][] = [
      [validationError('x'), 'validation_error', 400],
      [unauthorized(), 'unauthorized', 401],
      [notFound('x'), 'not_found', 404],
      [invalidQuantity('x'), 'invalid_quantity', 422],
      [rateLimited('x', 7), 'rate_limited', 429],
      [internalError(), 'internal', 500],
    ];
    for (const [error, code, status] of cases) {
      expect(apiErrorCodeSchema.parse(error.code)).toBe(code);
      expect(error.statusCode).toBe(status);
      expect(error.statusCode).toBe(API_ERROR_HTTP_STATUS[error.code]);
    }
  });

  it('el 429 lleva Retry-After y el 500 un mensaje fijo', () => {
    expect(rateLimited('x', 7).headers).toEqual({ 'retry-after': '7' });
    expect(internalError().message).toBe('Error interno.');
  });
});
