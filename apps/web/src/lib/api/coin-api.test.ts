import type {
  AccountResponse,
  CandlesResponse,
  LoginResponse,
  Order,
  PlaceOrderRequest,
} from '@coin/shared';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createApiClient, type ApiResult } from './api-client.js';
import { createCoinApi } from './coin-api.js';

const ACCOUNT_ID = '6f1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e';
const ORDER_ID = '0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d';
const CLIENT_ORDER_ID = '3c4d5e6f-7a8b-4c9d-ae0f-1a2b3c4d5e6f';

const LOGIN_OK: LoginResponse = { accountId: ACCOUNT_ID, expiresAt: 1_800_000_000_000 };

const ACCOUNT_OK: AccountResponse = {
  account: {
    id: ACCOUNT_ID,
    currency: 'USD',
    initialBalance: 100_000,
    balance: 99_000,
    equity: 100_010,
    leverage: 1,
    createdAt: 1,
    updatedAt: 2,
    realizedPnl: 0,
    unrealizedPnl: 10,
  },
  positions: [],
};

const ORDER_OK: Order = {
  id: ORDER_ID,
  accountId: ACCOUNT_ID,
  clientOrderId: CLIENT_ORDER_ID,
  symbol: 'BTCUSD',
  side: 'buy',
  type: 'market',
  quantity: 0.01666,
  amountUsd: 1000,
  status: 'filled',
  filledPrice: 60010.5,
  rejectReason: null,
  createdAt: 1,
  filledAt: 1,
};

const CANDLES_OK: CandlesResponse = {
  symbol: 'BTCUSD',
  interval: '5m',
  candles: [
    {
      symbol: 'BTCUSD',
      interval: '5m',
      openTime: 0,
      open: 1,
      high: 2,
      low: 0.5,
      close: 1.5,
      volume: 3,
    },
  ],
};

const BUY_1000: PlaceOrderRequest = {
  symbol: 'BTCUSD',
  side: 'buy',
  type: 'market',
  amountUsd: 1000,
  clientOrderId: CLIENT_ORDER_ID,
};

type Call = { url: string; init: RequestInit };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** `createCoinApi` sobre un cliente con `fetch` simulado. */
function setup(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  let unauthorized = 0;
  const api = createCoinApi(
    createApiClient({
      fetch: async (url, init) => {
        const call = { url, init };
        calls.push(call);
        return respond(call);
      },
      onUnauthorized: () => {
        unauthorized += 1;
      },
    }),
  );
  return { api, calls, unauthorizedCount: () => unauthorized };
}

const unauthorized = () =>
  json(401, { error: { code: 'unauthorized', message: 'Sin sesión válida' } });

describe('createCoinApi', () => {
  it('login: POST /api/auth/login con el código y la respuesta validada', async () => {
    const { api, calls } = setup(() => json(200, LOGIN_OK));
    const result = await api.login('ABCD-1234');
    expect(calls[0]?.url).toBe('/api/auth/login');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.body).toBe(JSON.stringify({ code: 'ABCD-1234' }));
    expect(result).toEqual({ ok: true, status: 200, data: LOGIN_OK });
    expectTypeOf(result).toEqualTypeOf<ApiResult<LoginResponse>>();
  });

  it('login: un 401 es código inválido y no avisa de sesión vencida', async () => {
    const { api, unauthorizedCount } = setup(unauthorized);
    const result = await api.login('MAL');
    expect(unauthorizedCount()).toBe(0);
    expect(result.ok ? null : result.failure).toMatchObject({ knownCode: 'unauthorized' });
  });

  it('login exitoso permite un nuevo aviso de sesión vencida', async () => {
    let next: () => Response = unauthorized;
    const { api, unauthorizedCount } = setup(() => next());
    await api.getAccount();
    await api.getAccount();
    expect(unauthorizedCount()).toBe(1);

    next = () => json(200, LOGIN_OK);
    await api.login('ABCD-1234');
    next = unauthorized;
    await api.getAccount();
    expect(unauthorizedCount()).toBe(2);
  });

  it('logout: POST /api/auth/logout y 204 sin cuerpo', async () => {
    const { api, calls } = setup(() => new Response(null, { status: 204 }));
    const result = await api.logout();
    expect(calls[0]?.url).toBe('/api/auth/logout');
    expect(calls[0]?.init.method).toBe('POST');
    expect(result).toEqual({ ok: true, status: 204, data: undefined });
  });

  it('getAccount: GET /api/account con accountView y posiciones', async () => {
    const { api, calls } = setup(() => json(200, ACCOUNT_OK));
    const result = await api.getAccount();
    expect(calls[0]?.url).toBe('/api/account');
    expect(calls[0]?.init.method).toBe('GET');
    expect(result).toEqual({ ok: true, status: 200, data: ACCOUNT_OK });
    expectTypeOf(result).toEqualTypeOf<ApiResult<AccountResponse>>();
  });

  it('getAccount: un 401 avisa de sesión vencida', async () => {
    const { api, unauthorizedCount } = setup(unauthorized);
    await api.getAccount();
    expect(unauthorizedCount()).toBe(1);
  });

  it('placeOrder: POST /api/orders con la orden; 201 nueva y 200 repetida', async () => {
    let status = 201;
    const { api, calls } = setup(() => json(status, ORDER_OK));
    const first = await api.placeOrder(BUY_1000);
    expect(calls[0]?.url).toBe('/api/orders');
    expect(calls[0]?.init.body).toBe(JSON.stringify(BUY_1000));
    expect(first).toEqual({ ok: true, status: 201, data: ORDER_OK });

    status = 200;
    const repeated = await api.placeOrder(BUY_1000);
    expect(repeated).toEqual({ ok: true, status: 200, data: ORDER_OK });
    expectTypeOf(repeated).toEqualTypeOf<ApiResult<Order>>();
  });

  it('placeOrder: una orden guardada como rechazada llega como orden (201), no como falla', async () => {
    const rejected: Order = {
      ...ORDER_OK,
      quantity: 0.00016,
      amountUsd: 10,
      status: 'rejected',
      filledPrice: null,
      rejectReason: 'below_minimum',
      filledAt: null,
    };
    const { api } = setup(() => json(201, rejected));
    const result = await api.placeOrder({ ...BUY_1000, amountUsd: 10 });
    expect(result).toEqual({ ok: true, status: 201, data: rejected });
  });

  it('closePosition: POST a la ruta del contrato, con el id codificado', async () => {
    const { api, calls } = setup(() => json(201, ORDER_OK));
    const result = await api.closePosition('a/b c', { clientOrderId: CLIENT_ORDER_ID });
    expect(calls[0]?.url).toBe('/api/positions/a%2Fb%20c/close');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.body).toBe(JSON.stringify({ clientOrderId: CLIENT_ORDER_ID }));
    expect(result.ok).toBe(true);
  });

  it('getCandles: GET /market/candles con la query, sin los parámetros vacíos', async () => {
    const { api, calls } = setup(() => json(200, CANDLES_OK));
    const result = await api.getCandles({ symbol: 'BTCUSD', interval: '5m', from: 0, limit: 2 });
    expect(calls[0]?.url).toBe('/market/candles?symbol=BTCUSD&interval=5m&from=0&limit=2');
    expect(result).toEqual({ ok: true, status: 200, data: CANDLES_OK });
    expectTypeOf(result).toEqualTypeOf<ApiResult<CandlesResponse>>();
  });

  it('getCandles: market-data no usa sesión, un 401 no avisa', async () => {
    const { api, unauthorizedCount } = setup(unauthorized);
    await api.getCandles({ symbol: 'BTCUSD', interval: '1m' });
    expect(unauthorizedCount()).toBe(0);
  });
});
