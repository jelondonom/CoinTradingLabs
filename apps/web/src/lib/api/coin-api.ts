import {
  ACCOUNT_PATH,
  CANDLES_PATH,
  LOGIN_PATH,
  LOGOUT_PATH,
  ORDERS_PATH,
  accountResponseSchema,
  candlesResponseSchema,
  closePositionPath,
  loginResponseSchema,
  orderSchema,
  type CandleInterval,
  type ClosePositionRequest,
  type InstrumentSymbol,
  type PlaceOrderRequest,
} from '@coin/shared';
import type { ApiClient } from './api-client.js';

/** Parámetros de `GET /market/candles` (contrato v2). `from` y `to` en ms UTC, incluidos. */
export type CandlesRequest = {
  symbol: InstrumentSymbol;
  interval: CandleInterval;
  from?: number;
  to?: number;
  limit?: number;
};

/**
 * Las llamadas del contrato v2. Las rutas y los esquemas vienen de `@coin/shared`, sin copias.
 * Una orden o un cierre que vuelve a enviarse usa el mismo `clientOrderId`: así el Backend
 * devuelve la orden original (200) en vez de crear otra.
 */
export function createCoinApi(client: ApiClient) {
  return {
    /** `POST /api/auth/login`. Un 401 aquí es "código inválido", no sesión vencida (B4). */
    async login(code: string, signal?: AbortSignal) {
      const result = await client.request({
        service: 'api',
        path: LOGIN_PATH,
        method: 'POST',
        body: { code },
        schema: loginResponseSchema,
        sessionRequired: false,
        signal,
      });
      // Sesión nueva: un 401 posterior vuelve a avisar.
      if (result.ok) client.clearUnauthorized();
      return result;
    },

    /** `POST /api/auth/logout`: 204 y el servidor borra la cookie. */
    logout(signal?: AbortSignal) {
      return client.request({ service: 'api', path: LOGOUT_PATH, method: 'POST', signal });
    },

    /** `GET /api/account`: la cuenta (`accountView`) y las posiciones abiertas. */
    getAccount(signal?: AbortSignal) {
      return client.request({
        service: 'api',
        path: ACCOUNT_PATH,
        schema: accountResponseSchema,
        signal,
      });
    },

    /** `POST /api/orders`: 201 si la orden es nueva, 200 si repite un `clientOrderId`. */
    placeOrder(order: PlaceOrderRequest, signal?: AbortSignal) {
      return client.request({
        service: 'api',
        path: ORDERS_PATH,
        method: 'POST',
        body: order,
        schema: orderSchema,
        signal,
      });
    },

    /** `POST /api/positions/:id/close`: vende la posición completa y responde la orden. */
    closePosition(positionId: string, body: ClosePositionRequest, signal?: AbortSignal) {
      return client.request({
        service: 'api',
        path: closePositionPath(positionId),
        method: 'POST',
        body,
        schema: orderSchema,
        signal,
      });
    },

    /** `GET /market/candles`: velas ascendentes por `openTime`. market-data no usa sesión. */
    getCandles({ symbol, interval, from, to, limit }: CandlesRequest, signal?: AbortSignal) {
      return client.request({
        service: 'market',
        path: CANDLES_PATH,
        query: { symbol, interval, from, to, limit },
        schema: candlesResponseSchema,
        signal,
      });
    },
  };
}

export type CoinApi = ReturnType<typeof createCoinApi>;
