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
    const env = loadEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@db:5432/coin',
      REDIS_URL: 'redis://redis:6379',
    });
    expect(env.databaseUrl).toBe('postgresql://u:p@db:5432/coin');
  });
});
