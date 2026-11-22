import {
  LOGIN_PATH,
  LOGOUT_PATH,
  ORDERS_PATH,
  loginResponseSchema,
  type LoginResponse,
} from '@coin/shared';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  DEFAULT_TIMEOUT_MS,
  buildUrl,
  createApiClient,
  type ApiClientOptions,
  type ApiResult,
} from './api-client.js';

type Call = { url: string; init: RequestInit };

const LOGIN_OK: LoginResponse = {
  accountId: '6f1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e',
  expiresAt: 1_800_000_000_000,
};

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** Cliente con un `fetch` simulado que guarda cada llamada. */
function setup(
  respond: (call: Call) => Response | Promise<Response>,
  options: Omit<ApiClientOptions, 'fetch'> = {},
) {
  const calls: Call[] = [];
  let unauthorized = 0;
  const client = createApiClient({
    onUnauthorized: () => {
      unauthorized += 1;
    },
    ...options,
    fetch: async (url, init) => {
      const call = { url, init };
      calls.push(call);
      return respond(call);
    },
  });
  return { client, calls, unauthorizedCount: () => unauthorized };
}

/** `fetch` que nunca responde y falla como el navegador cuando se aborta su `signal`. */
function hangingFetch(_url: string, init: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('buildUrl', () => {
  it('usa el prefijo de cada servicio (ADR-0004), nunca localhost', () => {
    expect(buildUrl('api', ORDERS_PATH)).toBe('/api/orders');
    expect(buildUrl('market', '/candles')).toBe('/market/candles');
  });

  it('arma la query string sin los parámetros vacíos', () => {
    expect(
      buildUrl('market', '/candles', {
        symbol: 'BTCUSD',
        interval: '1m',
        from: undefined,
        to: '',
        limit: 500,
      }),
    ).toBe('/market/candles?symbol=BTCUSD&interval=1m&limit=500');
  });
});

describe('createApiClient: la petición', () => {
  it('POST con cuerpo JSON, cookie del mismo origen y cabeceras', async () => {
    const { client, calls } = setup(() => json(200, LOGIN_OK));
    await client.request({
      service: 'api',
      path: LOGIN_PATH,
      method: 'POST',
      body: { code: 'ABCD-1234' },
      schema: loginResponseSchema,
      sessionRequired: false,
    });

    const [call] = calls;
    expect(call?.url).toBe('/api/auth/login');
    expect(call?.init.method).toBe('POST');
    expect(call?.init.credentials).toBe('same-origin');
    expect(call?.init.body).toBe(JSON.stringify({ code: 'ABCD-1234' }));
    expect(call?.init.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
  });

  it('GET sin cuerpo no envía Content-Type', async () => {
    const { client, calls } = setup(() => new Response(null, { status: 204 }));
    await client.request({ service: 'api', path: '/account' });
    expect(calls[0]?.init.method).toBe('GET');
    expect(calls[0]?.init.body).toBeUndefined();
    expect(calls[0]?.init.headers).toEqual({ Accept: 'application/json' });
  });
});

describe('createApiClient: respuestas correctas', () => {
  it('valida el 2xx con el esquema y devuelve el status', async () => {
    const { client } = setup(() => json(201, LOGIN_OK));
    const result = await client.request({
      service: 'api',
      path: LOGIN_PATH,
      schema: loginResponseSchema,
    });
    expect(result).toEqual({ ok: true, status: 201, data: LOGIN_OK });
  });

  it('un 204 sin esquema da data undefined', async () => {
    const { client } = setup(() => new Response(null, { status: 204 }));
    const result = await client.request({ service: 'api', path: LOGOUT_PATH, method: 'POST' });
    expect(result).toEqual({ ok: true, status: 204, data: undefined });
  });

  it('un 2xx fuera de contrato es invalid_response', async () => {
    const { client } = setup(() => json(200, { accountId: 'no-es-uuid', expiresAt: 1 }));
    const result = await client.request({
      service: 'api',
      path: LOGIN_PATH,
      schema: loginResponseSchema,
    });
    expect(result).toEqual({
      ok: false,
      failure: { kind: 'invalid_response', status: 200, url: '/api/auth/login' },
    });
  });

  it('un 2xx que no es JSON también es invalid_response', async () => {
    const { client } = setup(() => new Response('<html></html>', { status: 200 }));
    const result = await client.request({
      service: 'api',
      path: LOGIN_PATH,
      schema: loginResponseSchema,
    });
    expect(result.ok ? null : result.failure.kind).toBe('invalid_response');
  });

  it('el tipo de data sale del esquema; sin esquema es undefined', async () => {
    const { client } = setup(() => json(200, LOGIN_OK));
    const withSchema = client.request({
      service: 'api',
      path: LOGIN_PATH,
      schema: loginResponseSchema,
    });
    expectTypeOf(withSchema).resolves.toEqualTypeOf<ApiResult<LoginResponse>>();
    const withoutSchema = client.request({ service: 'api', path: LOGOUT_PATH, method: 'POST' });
    expectTypeOf(withoutSchema).resolves.toEqualTypeOf<ApiResult<undefined>>();
    await Promise.all([withSchema, withoutSchema]);
  });
});

describe('createApiClient: errores del servidor', () => {
  it('un código del contrato llega con knownCode', async () => {
    const { client } = setup(() =>
      json(422, { error: { code: 'below_minimum', message: 'Monto menor al mínimo' } }),
    );
    const result = await client.request({ service: 'api', path: ORDERS_PATH, method: 'POST' });
    expect(result).toEqual({
      ok: false,
      failure: {
        kind: 'api',
        status: 422,
        code: 'below_minimum',
        knownCode: 'below_minimum',
        message: 'Monto menor al mínimo',
      },
    });
  });

  it('un código fuera del contrato no rompe el cliente: knownCode null (B1)', async () => {
    const { client } = setup(() =>
      json(400, { error: { code: 'invalid_request', message: 'Cuerpo inválido' } }),
    );
    const result = await client.request({ service: 'api', path: ORDERS_PATH, method: 'POST' });
    expect(result).toEqual({
      ok: false,
      failure: {
        kind: 'api',
        status: 400,
        code: 'invalid_request',
        knownCode: null,
        message: 'Cuerpo inválido',
      },
    });
  });

  it('un error sin el cuerpo del contrato (502 en HTML) es http', async () => {
    const { client } = setup(() => new Response('<html>Bad gateway</html>', { status: 502 }));
    const result = await client.request({ service: 'api', path: ORDERS_PATH });
    expect(result).toEqual({ ok: false, failure: { kind: 'http', status: 502 } });
  });

  it('un 429 trae los segundos de Retry-After (B3)', async () => {
    const body = { error: { code: 'rate_limited', message: 'Espera' } };
    const { client } = setup(() => json(429, body, { 'Retry-After': '30' }));
    const result = await client.request({ service: 'api', path: ORDERS_PATH, method: 'POST' });
    expect(result.ok ? null : result.failure).toMatchObject({
      kind: 'api',
      knownCode: 'rate_limited',
      retryAfterSeconds: 30,
    });
  });

  it('sin Retry-After, o con un valor que no es un entero mayor o igual a 1, no hay segundos', async () => {
    const body = { error: { code: 'rate_limited', message: 'Espera' } };
    const cases: Record<string, string>[] = [
      {},
      { 'Retry-After': '0' },
      { 'Retry-After': 'mañana' },
    ];
    for (const headers of cases) {
      const { client } = setup(() => json(429, body, headers));
      const result = await client.request({ service: 'api', path: ORDERS_PATH, method: 'POST' });
      expect(result.ok ? null : result.failure).not.toHaveProperty('retryAfterSeconds');
    }
  });
});

describe('createApiClient: sin respuesta', () => {
  it('si fetch falla (sin red) es network offline', async () => {
    const { client } = setup(() => Promise.reject(new TypeError('Failed to fetch')));
    const result = await client.request({ service: 'api', path: ORDERS_PATH });
    expect(result).toEqual({ ok: false, failure: { kind: 'network', reason: 'offline' } });
  });

  it('si se agota el tiempo es network timeout', async () => {
    vi.useFakeTimers();
    const client = createApiClient({ fetch: hangingFetch });
    const pending = client.request({ service: 'api', path: ORDERS_PATH, method: 'POST' });
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
    expect(await pending).toEqual({ ok: false, failure: { kind: 'network', reason: 'timeout' } });
  });

  it('respeta un timeoutMs propio', async () => {
    vi.useFakeTimers();
    const client = createApiClient({ fetch: hangingFetch, timeoutMs: 1_000 });
    const pending = client.request({ service: 'api', path: ORDERS_PATH });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await pending).toEqual({ ok: false, failure: { kind: 'network', reason: 'timeout' } });
  });

  it('si quien llama cancela, es aborted', async () => {
    const client = createApiClient({ fetch: hangingFetch });
    const controller = new AbortController();
    const pending = client.request({
      service: 'api',
      path: ORDERS_PATH,
      signal: controller.signal,
    });
    controller.abort();
    expect(await pending).toEqual({ ok: false, failure: { kind: 'aborted' } });
  });

  it('con un signal ya cancelado no llama a fetch', async () => {
    const { client, calls } = setup(() => json(200, LOGIN_OK));
    const controller = new AbortController();
    controller.abort();
    const result = await client.request({
      service: 'api',
      path: ORDERS_PATH,
      signal: controller.signal,
    });
    expect(result).toEqual({ ok: false, failure: { kind: 'aborted' } });
    expect(calls).toHaveLength(0);
  });
});

describe('createApiClient: sesión vencida (B4)', () => {
  const unauthorized = () =>
    json(401, { error: { code: 'unauthorized', message: 'Sesión vencida' } });

  it('un 401 en una ruta con sesión avisa con onUnauthorized', async () => {
    const { client, unauthorizedCount } = setup(unauthorized);
    const result = await client.request({ service: 'api', path: '/account' });
    expect(unauthorizedCount()).toBe(1);
    expect(result.ok ? null : result.failure).toMatchObject({ kind: 'api', status: 401 });
  });

  it('un 401 en el login es "código inválido": no avisa', async () => {
    const { client, unauthorizedCount } = setup(unauthorized);
    await client.request({
      service: 'api',
      path: LOGIN_PATH,
      method: 'POST',
      sessionRequired: false,
    });
    expect(unauthorizedCount()).toBe(0);
  });

  it('un 401 de market-data no avisa: no usa sesión', async () => {
    const { client, unauthorizedCount } = setup(unauthorized);
    await client.request({ service: 'market', path: '/candles' });
    expect(unauthorizedCount()).toBe(0);
  });

  it('dos 401 simultáneos avisan una sola vez', async () => {
    const { client, unauthorizedCount } = setup(unauthorized);
    await Promise.all([
      client.request({ service: 'api', path: '/account' }),
      client.request({ service: 'api', path: ORDERS_PATH, method: 'POST' }),
    ]);
    expect(unauthorizedCount()).toBe(1);
  });

  it('después de clearUnauthorized, un 401 nuevo vuelve a avisar', async () => {
    const { client, unauthorizedCount } = setup(unauthorized);
    await client.request({ service: 'api', path: '/account' });
    await client.request({ service: 'api', path: '/account' });
    expect(unauthorizedCount()).toBe(1);
    client.clearUnauthorized();
    await client.request({ service: 'api', path: '/account' });
    expect(unauthorizedCount()).toBe(2);
  });

  it('un 401 sin el cuerpo del contrato también avisa', async () => {
    const { client, unauthorizedCount } = setup(() => new Response('', { status: 401 }));
    const result = await client.request({ service: 'api', path: '/account' });
    expect(unauthorizedCount()).toBe(1);
    expect(result).toEqual({ ok: false, failure: { kind: 'http', status: 401 } });
  });
});
