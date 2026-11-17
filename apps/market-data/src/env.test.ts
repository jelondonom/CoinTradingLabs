import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('usa el feed simulado por defecto en desarrollo', () => {
    const env = loadEnv({});
    expect(env.feed).toBe('mock');
    expect(env.mockFeedSeed).toBeUndefined();
    expect(env.tickIntervalMs).toBe(1000);
  });

  it('lee FEED y MOCK_FEED_SEED', () => {
    expect(loadEnv({ FEED: 'live' }).feed).toBe('live');
    expect(loadEnv({ MOCK_FEED_SEED: '42' }).mockFeedSeed).toBe(42);
  });

  it('rechaza un FEED desconocido', () => {
    expect(() => loadEnv({ FEED: 'yahoo' })).toThrow('Variables de entorno inválidas');
  });

  it('no arranca con feed simulado en producción', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow('FEED=mock no se permite');
    expect(() => loadEnv({ NODE_ENV: 'production', FEED: 'mock' })).toThrow(
      'FEED=mock no se permite',
    );
  });

  it('permite el feed simulado en producción solo con autorización explícita', () => {
    const env = loadEnv({ NODE_ENV: 'production', ALLOW_MOCK_FEED_IN_PRODUCTION: 'true' });
    expect(env.feed).toBe('mock');
  });

  it('acepta FEED=live en producción', () => {
    expect(loadEnv({ NODE_ENV: 'production', FEED: 'live' }).feed).toBe('live');
  });
});
