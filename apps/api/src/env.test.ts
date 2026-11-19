import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('usa valores por defecto en desarrollo', () => {
    const env = loadEnv({});
    expect(env.port).toBe(3000);
    expect(env.databaseUrl).toContain('localhost:5432');
    expect(env.redisUrl).toContain('localhost:6379');
  });

  it('rechaza un puerto inválido', () => {
    expect(() => loadEnv({ API_PORT: 'abc' })).toThrow(/API_PORT/);
  });

  it('exige DATABASE_URL y REDIS_URL en producción', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/obligatorias/);
    const production = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@db:5432/coin',
      REDIS_URL: 'redis://redis:6379',
    };
    expect(() => loadEnv(production)).toThrow(/AUTH_TOKEN_SECRET/);
    const env = loadEnv({ ...production, AUTH_TOKEN_SECRET: 'x'.repeat(32) });
    expect(env.databaseUrl).toBe('postgresql://u:p@db:5432/coin');
    expect(env.authTokenSecret).toBe('x'.repeat(32));
  });

  it('rechaza un secreto corto y usa 7 días de sesión y 30 s de umbral por defecto', () => {
    expect(() => loadEnv({ AUTH_TOKEN_SECRET: 'corto' })).toThrow(/AUTH_TOKEN_SECRET/);
    const env = loadEnv({});
    expect(env.authTokenTtlMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(env.stalePriceAfterMs).toBe(30_000);
  });

  it('límites de D-13: 100 fallos de login cada 15 min, 30 órdenes por minuto y 1.000 por día', () => {
    expect(loadEnv({}).rateLimits).toEqual({
      loginFailuresPer15Min: 100,
      ordersPerMinute: 30,
      ordersPerDay: 1000,
    });
    const tuned = loadEnv({
      RATE_LIMIT_LOGIN_FAILURES_PER_15_MIN: '200',
      RATE_LIMIT_ORDERS_PER_MINUTE: '20',
      RATE_LIMIT_ORDERS_PER_DAY: '500',
    });
    expect(tuned.rateLimits).toEqual({
      loginFailuresPer15Min: 200,
      ordersPerMinute: 20,
      ordersPerDay: 500,
    });
    expect(() => loadEnv({ RATE_LIMIT_ORDERS_PER_MINUTE: '0' })).toThrow(
      /RATE_LIMIT_ORDERS_PER_MINUTE/,
    );
  });

  it('API_TRUST_PROXY: sin definir no confía en nadie; acepta solo IP o CIDR', () => {
    expect(loadEnv({}).trustProxy).toBe(false);
    expect(loadEnv({ API_TRUST_PROXY: '' }).trustProxy).toBe(false);
    expect(loadEnv({ API_TRUST_PROXY: '172.18.0.0/16, 10.0.0.5' }).trustProxy).toBe(
      '172.18.0.0/16,10.0.0.5',
    );
    expect(() => loadEnv({ API_TRUST_PROXY: 'true' })).toThrow(/API_TRUST_PROXY/);
  });
});
