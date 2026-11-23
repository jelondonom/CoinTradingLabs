import {
  API_ERROR_CODES,
  MIN_ORDER_USD,
  ORDER_REJECT_REASONS,
  type ApiErrorCode,
} from '@coin/shared';
import { describe, expect, it } from 'vitest';
import { t } from '../../i18n/index.js';
import { formatMoney } from '../format.js';
import type { ApiFailure } from './api-client.js';
import {
  API_ERROR_MESSAGE,
  errorCodeAttribute,
  errorMessage,
  formatWait,
  rejectReasonMessage,
} from './error-message.js';

/** Falla `api` con un código del contrato. */
const apiFailure = (code: ApiErrorCode, extra: Partial<ApiFailure> = {}): ApiFailure =>
  ({ kind: 'api', status: 422, code, knownCode: code, message: '', ...extra }) as ApiFailure;

describe('API_ERROR_MESSAGE', () => {
  it('cada código del contrato tiene un texto en español, sin variables sin llenar', () => {
    for (const code of API_ERROR_CODES) {
      const message = errorMessage(apiFailure(code));
      expect(message, code).toBeTruthy();
      expect(message, code).not.toBe(API_ERROR_MESSAGE[code]);
      expect(message, code).not.toMatch(/[{}]/);
    }
  });
});

describe('errorMessage: códigos del contrato', () => {
  it('unauthorized: en el ingreso es "código inválido"; fuera de él, sesión vencida (B4)', () => {
    expect(errorMessage(apiFailure('unauthorized'), { context: 'login' })).toBe(
      t('errors.invalidCode'),
    );
    expect(errorMessage(apiFailure('unauthorized'))).toBe(t('errors.sessionExpired'));
  });

  it('below_minimum dice el mínimo del contrato con la moneda escrita', () => {
    const message = errorMessage(apiFailure('below_minimum'));
    expect(message).toContain(formatMoney(MIN_ORDER_USD));
    expect(message).toBe('El monto mínimo por orden es 10,00 USD.');
    expect(message).not.toContain('$');
  });

  it('rate_limited con Retry-After dice cuánto esperar; sin él, unos segundos', () => {
    expect(errorMessage(apiFailure('rate_limited', { retryAfterSeconds: 30 }))).toBe(
      t('errors.rateLimitedWait', { wait: '30 segundos' }),
    );
    expect(errorMessage(apiFailure('rate_limited'))).toBe(t('errors.rateLimited'));
  });

  it('un código que no está en el contrato da el genérico, sin romper (B1)', () => {
    const failure: ApiFailure = {
      kind: 'api',
      status: 400,
      code: 'invalid_request',
      knownCode: null,
      message: 'Cuerpo inválido',
    };
    expect(errorMessage(failure)).toBe(t('errors.unknown'));
  });
});

describe('errorMessage: fallas sin código del contrato', () => {
  it('http: 401 sesión (o código inválido en el ingreso), 429 límite, 5xx servidor, otro genérico', () => {
    expect(errorMessage({ kind: 'http', status: 401 })).toBe(t('errors.sessionExpired'));
    expect(errorMessage({ kind: 'http', status: 401 }, { context: 'login' })).toBe(
      t('errors.invalidCode'),
    );
    expect(errorMessage({ kind: 'http', status: 429 })).toBe(t('errors.rateLimited'));
    expect(errorMessage({ kind: 'http', status: 502 })).toBe(t('errors.serverUnavailable'));
    expect(errorMessage({ kind: 'http', status: 404 })).toBe(t('errors.unknown'));
  });

  it('network: sin conexión o tiempo agotado', () => {
    expect(errorMessage({ kind: 'network', reason: 'offline' })).toBe(t('errors.offline'));
    expect(errorMessage({ kind: 'network', reason: 'timeout' })).toBe(t('errors.timeout'));
  });

  it('invalid_response: respuesta inesperada', () => {
    expect(errorMessage({ kind: 'invalid_response', status: 200, url: '/api/account' })).toBe(
      t('errors.unexpectedResponse'),
    );
  });

  it('aborted: no hay nada que mostrar', () => {
    expect(errorMessage({ kind: 'aborted' })).toBeNull();
  });
});

describe('formatWait', () => {
  it('redondea hacia arriba y usa la unidad más grande que cabe (B3)', () => {
    expect(formatWait(1)).toBe('1 segundo');
    expect(formatWait(59)).toBe('59 segundos');
    expect(formatWait(60)).toBe('1 minuto');
    expect(formatWait(61)).toBe('2 minutos');
    expect(formatWait(3_599)).toBe('1 hora');
    expect(formatWait(3_600)).toBe('1 hora');
    expect(formatWait(3_601)).toBe('2 horas');
    expect(formatWait(86_400)).toBe('24 horas');
  });

  it('nunca dice menos de 1 segundo', () => {
    expect(formatWait(0)).toBe('1 segundo');
    expect(formatWait(0.2)).toBe('1 segundo');
  });

  it('un valor que no es número no se muestra como NaN', () => {
    expect(formatWait(Number.NaN)).toBe('1 segundo');
  });
});

describe('rejectReasonMessage', () => {
  it('usa la misma tabla que errorMessage para cada motivo de rechazo', () => {
    for (const reason of ORDER_REJECT_REASONS) {
      expect(rejectReasonMessage(reason), reason).toBe(errorMessage(apiFailure(reason)));
    }
  });
});

describe('errorCodeAttribute (data-error-code, regla 5 y Q11)', () => {
  it('api: el código crudo del servidor, aunque no esté en el contrato', () => {
    expect(errorCodeAttribute(apiFailure('below_minimum'))).toBe('below_minimum');
    expect(
      errorCodeAttribute({
        kind: 'api',
        status: 400,
        code: 'invalid_request',
        knownCode: null,
        message: '',
      }),
    ).toBe('invalid_request');
  });

  it('sin respuesta es network; sin código del contrato, http; 2xx fuera de contrato, invalid_response', () => {
    expect(errorCodeAttribute({ kind: 'network', reason: 'offline' })).toBe('network');
    expect(errorCodeAttribute({ kind: 'network', reason: 'timeout' })).toBe('network');
    expect(errorCodeAttribute({ kind: 'http', status: 502 })).toBe('http');
    expect(errorCodeAttribute({ kind: 'invalid_response', status: 200, url: '/api/account' })).toBe(
      'invalid_response',
    );
  });

  it('una petición cancelada no lleva atributo', () => {
    expect(errorCodeAttribute({ kind: 'aborted' })).toBeUndefined();
  });
});
