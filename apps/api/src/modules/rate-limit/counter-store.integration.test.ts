import { Redis } from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { RedisCounterStore } from './counter-store.js';

/**
 * Tests contra Redis real. Las llaves llevan un prefijo único y se borran al terminar, así que
 * no tocan los datos de desarrollo. Si no hay Redis disponible, la suite no corre; en el CI
 * siempre hay Redis.
 */
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

async function connect(): Promise<Redis | null> {
  const redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  try {
    await redis.connect();
    return redis;
  } catch {
    redis.disconnect();
    return null;
  }
}

const redis = await connect();
const prefix = `rl-test:${process.pid}:${Date.now()}`;

describe.skipIf(!redis)('RedisCounterStore contra Redis', () => {
  const client = redis as Redis;
  const store = new RedisCounterStore(client);
  const valueOf = async (key: string) => client.get(key);

  afterAll(async () => {
    const keys = await client.keys(`${prefix}:*`);
    if (keys.length > 0) await client.del(...keys);
    client.disconnect();
  });

  it('cuenta de a uno y fija el vencimiento solo en el primer conteo', async () => {
    const key = `${prefix}:cuenta`;
    const endsAt = Date.now() + 60_000;

    expect(await store.increment(key, endsAt)).toBe(1);
    // Un segundo conteo no corre el vencimiento: la ventana termina donde empezó.
    expect(await store.increment(key, endsAt + 99_999)).toBe(2);
    expect(Number(await client.call('PEXPIRETIME', key))).toBe(endsAt);
  });

  it('decrement resta y conserva el vencimiento; sobre una llave vencida no crea nada', async () => {
    const key = `${prefix}:resta`;
    const endsAt = Date.now() + 60_000;
    await store.increment(key, endsAt);
    await store.increment(key, endsAt);
    await store.decrement(key);
    expect(await valueOf(key)).toBe('1');
    expect(Number(await client.call('PEXPIRETIME', key))).toBe(endsAt);

    await store.decrement(`${prefix}:no-existe`);
    expect(await valueOf(`${prefix}:no-existe`)).toBeNull();
  });

  it('la llave desaparece al terminar la ventana', async () => {
    const key = `${prefix}:vence`;
    await store.increment(key, Date.now() + 50);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await valueOf(key)).toBeNull();
  });
});
