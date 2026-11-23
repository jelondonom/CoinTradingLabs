import { MIN_ORDER_USD, type ApiErrorCode, type OrderRejectReason } from '@coin/shared';
import { t, type MessageKey } from '../../i18n/index.js';
import { formatMoney } from '../format.js';
import type { ApiFailure } from './api-client.js';

/**
 * Texto de cada código del contrato. Es exhaustivo: si `API_ERROR_CODES` suma un código, la web no
 * compila hasta traducirlo. `unauthorized`, `rate_limited` y `below_minimum` se completan en
 * `codeMessage` con el contexto, la espera o el monto mínimo.
 */
export const API_ERROR_MESSAGE: Record<ApiErrorCode, MessageKey> = {
  insufficient_funds: 'errors.insufficientFunds',
  insufficient_position: 'errors.insufficientPosition',
  invalid_quantity: 'errors.invalidQuantity',
  below_minimum: 'errors.belowMinimum',
  no_price: 'errors.noPrice',
  stale_price: 'errors.stalePrice',
  market_closed: 'errors.marketClosed',
  validation_error: 'errors.validationError',
  unauthorized: 'errors.sessionExpired',
  not_found: 'errors.notFound',
  rate_limited: 'errors.rateLimited',
  internal: 'errors.internal',
};

/** Dónde se muestra el error, cuando cambia el texto. En el ingreso, un 401 es "código inválido". */
export type ErrorContext = 'login';

export type ErrorMessageOptions = { context?: ErrorContext };

const MINUTE = 60;
const HOUR = 3_600;

/**
 * Espera en palabras: "30 segundos", "5 minutos", "2 horas". Redondea hacia arriba, para no
 * invitar a reintentar antes de tiempo y chocar otra vez con el límite (B3: de 1 s a 86.400 s).
 */
export function formatWait(seconds: number): string {
  const total = Math.max(1, Math.ceil(seconds));
  if (total < MINUTE) return t(total === 1 ? 'time.second' : 'time.seconds', { n: total });
  const minutes = Math.ceil(total / MINUTE);
  if (minutes < 60) return t(minutes === 1 ? 'time.minute' : 'time.minutes', { n: minutes });
  const hours = Math.ceil(total / HOUR);
  return t(hours === 1 ? 'time.hour' : 'time.hours', { n: hours });
}

function codeMessage(
  code: ApiErrorCode,
  options: ErrorMessageOptions,
  retryAfterSeconds?: number,
): string {
  switch (code) {
    case 'unauthorized':
      // B4: en el ingreso, un 401 significa que el código no existe; fuera de él, sesión vencida.
      return t(options.context === 'login' ? 'errors.invalidCode' : 'errors.sessionExpired');
    case 'rate_limited':
      return retryAfterSeconds === undefined
        ? t('errors.rateLimited')
        : t('errors.rateLimitedWait', { wait: formatWait(retryAfterSeconds) });
    case 'below_minimum':
      return t('errors.belowMinimum', { min: formatMoney(MIN_ORDER_USD) });
    default:
      return t(API_ERROR_MESSAGE[code]);
  }
}

/**
 * Mensaje en español para una falla del cliente de API. `null` cuando no hay nada que mostrar
 * (quien llamó canceló la petición). Un código que no está en el contrato da un mensaje genérico.
 */
export function errorMessage(
  failure: ApiFailure,
  options: ErrorMessageOptions = {},
): string | null {
  switch (failure.kind) {
    case 'api':
      return failure.knownCode === null
        ? t('errors.unknown')
        : codeMessage(failure.knownCode, options, failure.retryAfterSeconds);
    case 'http':
      if (failure.status === 401) return codeMessage('unauthorized', options);
      if (failure.status === 429) return codeMessage('rate_limited', options);
      if (failure.status >= 500) return t('errors.serverUnavailable');
      return t('errors.unknown');
    case 'network':
      return t(failure.reason === 'timeout' ? 'errors.timeout' : 'errors.offline');
    case 'invalid_response':
      return t('errors.unexpectedResponse');
    case 'aborted':
      return null;
  }
}

/** Mensaje de una orden guardada como rechazada (201 con `rejectReason`). Usa la misma tabla. */
export function rejectReasonMessage(reason: OrderRejectReason): string {
  return codeMessage(reason, {});
}

/**
 * Valor de `data-error-code` (regla 5 de `docs/qa/data-testid.md`): el código crudo del servidor,
 * aunque no esté en el contrato; `network` si no hubo respuesta; `http` si hubo respuesta sin el
 * código del contrato y `invalid_response` si un 2xx no lo cumple (Q11, decidida por el Gerente).
 * Una petición cancelada no lleva atributo.
 */
export function errorCodeAttribute(failure: ApiFailure): string | undefined {
  switch (failure.kind) {
    case 'api':
      return failure.code;
    case 'network':
      return 'network';
    case 'http':
      return 'http';
    case 'invalid_response':
      return 'invalid_response';
    case 'aborted':
      return undefined;
  }
}
