import {
  API_ERROR_HTTP_STATUS,
  apiErrorSchema,
  healthResponseSchema,
  type ApiErrorCode,
} from '@coin/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { rateLimited, unauthorized } from './errors/app-error.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('GET /health', () => {
  it('responde 200 y ok cuando todas las dependencias están arriba', async () => {
    app = await buildApp({ checks: { postgres: async () => true, redis: async () => true } });
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    const body = healthResponseSchema.parse(response.json());
    expect(body.status).toBe('ok');
    expect(body.checks).toEqual({ postgres: 'up', redis: 'up' });
  });

  it('responde 503 y degraded si una dependencia falla o lanza error', async () => {
    app = await buildApp({
      checks: {
        postgres: async () => {
          throw new Error('sin conexión');
        },
        redis: async () => true,
      },
    });
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    const body = healthResponseSchema.parse(response.json());
    expect(body.status).toBe('degraded');
    expect(body.checks).toEqual({ postgres: 'down', redis: 'up' });
  });

  it('marca como caída una dependencia que no responde a tiempo', async () => {
    app = await buildApp({
      checkTimeoutMs: 20,
      checks: { postgres: () => new Promise<boolean>(() => {}) },
    });
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json().checks).toEqual({ postgres: 'down' });
  });
});

describe('errores del contrato (apiErrorSchema)', () => {
  /** El cuerpo cumple `apiErrorSchema` y el estado es el de `API_ERROR_HTTP_STATUS`. */
  function expectApiError(
    response: { statusCode: number; json: () => unknown },
    code: ApiErrorCode,
  ): string {
    const body = apiErrorSchema.parse(response.json());
    expect(body.error.code).toBe(code);
    expect(response.statusCode).toBe(API_ERROR_HTTP_STATUS[code]);
    return body.error.message;
  }

  async function appWithEcho(): Promise<FastifyInstance> {
    const instance = await buildApp({ checks: {} });
    instance.post('/eco', async (request) => request.body);
    return instance;
  }

  it('una ruta que no existe responde 404 not_found', async () => {
    app = await buildApp({ checks: {} });
    expectApiError(await app.inject({ method: 'GET', url: '/no-existe' }), 'not_found');
  });

  it('JSON inválido y Content-Type sin parser responden 400 validation_error', async () => {
    app = await appWithEcho();
    const badJson = await app.inject({
      method: 'POST',
      url: '/eco',
      headers: { 'content-type': 'application/json' },
      payload: '{"code":',
    });
    expectApiError(badJson, 'validation_error');
    // Fastify diría 415; para el contrato es un 400.
    const xml = await app.inject({
      method: 'POST',
      url: '/eco',
      headers: { 'content-type': 'application/xml' },
      payload: '<code>ABCDE</code>',
    });
    expectApiError(xml, 'validation_error');
    // Más de 1 MiB (límite por defecto): Fastify diría 413.
    const huge = await app.inject({
      method: 'POST',
      url: '/eco',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ code: 'x'.repeat(1_100_000) }),
    });
    expectApiError(huge, 'validation_error');
  });

  it('un 429 sigue siendo 429 rate_limited con Retry-After, y un 401 sigue siendo 401', async () => {
    app = await buildApp({ checks: {} });
    app.get('/limitado', async () => {
      throw rateLimited('Demasiadas órdenes. Intenta de nuevo en 9 s.', 9);
    });
    app.get('/privado', async () => {
      throw unauthorized();
    });
    const limited = await app.inject({ method: 'GET', url: '/limitado' });
    expectApiError(limited, 'rate_limited');
    expect(limited.headers['retry-after']).toBe('9');
    expectApiError(await app.inject({ method: 'GET', url: '/privado' }), 'unauthorized');
  });

  it('un error no controlado responde 500 internal sin filtrar su mensaje', async () => {
    app = await buildApp({ checks: {} });
    const secret = 'relation "users" en /srv/coin/app/dist/db.js:42 (SELECT login_id)';
    app.get('/falla', async () => {
      throw new Error(secret);
    });
    const response = await app.inject({ method: 'GET', url: '/falla' });
    expect(expectApiError(response, 'internal')).toBe('Error interno.');
    expect(response.body).not.toContain('SELECT');
    expect(response.body).not.toContain('/srv/coin');
  });
});

describe('errores y proxy', () => {
  it('un AppError con cabeceras responde su estado, su cuerpo y sus cabeceras (429)', async () => {
    app = await buildApp({ checks: {} });
    app.get('/limitado', async () => {
      throw rateLimited('Demasiadas órdenes en poco tiempo. Intenta de nuevo en 42 s.', 42);
    });
    const response = await app.inject({ method: 'GET', url: '/limitado' });

    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('42');
    expect(response.json()).toEqual({
      error: {
        code: 'rate_limited',
        message: 'Demasiadas órdenes en poco tiempo. Intenta de nuevo en 42 s.',
      },
    });
  });

  it('con trustProxy, request.ip es la del cliente solo si la petición llega por el proxy', async () => {
    app = await buildApp({ checks: {}, trustProxy: '10.0.0.5' });
    app.get('/ip', async (request) => ({ ip: request.ip }));
    const forwarded = { 'x-forwarded-for': '198.51.100.4' };

    const viaProxy = await app.inject({
      method: 'GET',
      url: '/ip',
      remoteAddress: '10.0.0.5',
      headers: forwarded,
    });
    expect(viaProxy.json()).toEqual({ ip: '198.51.100.4' });
    // Un cliente directo no puede falsear su IP con la cabecera.
    const direct = await app.inject({
      method: 'GET',
      url: '/ip',
      remoteAddress: '203.0.113.1',
      headers: forwarded,
    });
    expect(direct.json()).toEqual({ ip: '203.0.113.1' });
  });

  it('sin trustProxy ignora X-Forwarded-For', async () => {
    app = await buildApp({ checks: {} });
    app.get('/ip', async (request) => ({ ip: request.ip }));
    const response = await app.inject({
      method: 'GET',
      url: '/ip',
      remoteAddress: '10.0.0.5',
      headers: { 'x-forwarded-for': '198.51.100.4' },
    });
    expect(response.json()).toEqual({ ip: '10.0.0.5' });
  });
});
