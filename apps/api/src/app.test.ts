import { healthResponseSchema } from '@coin/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';

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
