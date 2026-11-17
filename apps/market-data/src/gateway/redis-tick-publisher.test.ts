import { tickSchema, type Tick } from '@coin/shared';
import { describe, expect, it } from 'vitest';
import { RedisTickPublisher, lastTickKey, tickChannel } from './redis-tick-publisher.js';

const TICK: Tick = { symbol: 'BTCUSD', bid: 64651.84, ask: 64651.85, last: 64651.85, ts: 1_000 };

function fakeRedis() {
  const sets: Array<{ key: string; value: string; extra: unknown[] }> = [];
  const publishes: Array<{ channel: string; message: string }> = [];
  let down = false;
  return {
    sets,
    publishes,
    setDown: (value: boolean) => {
      down = value;
    },
    client: {
      set: (key: string, value: string, ...extra: unknown[]) => {
        if (down) return Promise.reject(new Error('redis caído'));
        sets.push({ key, value, extra });
        return Promise.resolve('OK');
      },
      publish: (channel: string, message: string) => {
        if (down) return Promise.reject(new Error('redis caído'));
        publishes.push({ channel, message });
        return Promise.resolve(0);
      },
    },
  };
}

describe('RedisTickPublisher', () => {
  it('usa las llaves y canales acordados con el motor', () => {
    expect(lastTickKey('BTCUSD')).toBe('last:BTCUSD');
    expect(tickChannel('AAPL')).toBe('ticks:AAPL');
  });

  it('guarda el último tick sin vencimiento y lo publica en el canal', async () => {
    const redis = fakeRedis();
    await new RedisTickPublisher(redis.client).publish(TICK);

    expect(redis.sets).toHaveLength(1);
    expect(redis.sets[0]?.key).toBe('last:BTCUSD');
    // Sin argumentos extra: ni EX ni PX. La llave no debe expirar.
    expect(redis.sets[0]?.extra).toEqual([]);
    expect(redis.publishes).toEqual([{ channel: 'ticks:BTCUSD', message: redis.sets[0]?.value }]);
  });

  it('el valor guardado es el tick del contrato en JSON', async () => {
    const redis = fakeRedis();
    await new RedisTickPublisher(redis.client).publish(TICK);
    const stored: unknown = JSON.parse(redis.sets[0]?.value ?? '');
    expect(tickSchema.parse(stored)).toEqual(TICK);
  });

  it('si Redis falla no lanza y avisa una sola vez', async () => {
    const redis = fakeRedis();
    const failures: unknown[] = [];
    const publisher = new RedisTickPublisher(redis.client, {
      onFailure: (error) => failures.push(error),
    });
    redis.setDown(true);

    await expect(publisher.publish(TICK)).resolves.toBeUndefined();
    await publisher.publish(TICK);
    await publisher.publish(TICK);

    expect(failures).toHaveLength(1);
    expect(publisher.isFailing).toBe(true);
  });

  it('avisa la recuperación y vuelve a escribir cuando Redis regresa', async () => {
    const redis = fakeRedis();
    let recoveries = 0;
    const publisher = new RedisTickPublisher(redis.client, { onRecovery: () => (recoveries += 1) });

    await publisher.publish(TICK);
    expect(recoveries).toBe(0);

    redis.setDown(true);
    await publisher.publish(TICK);
    redis.setDown(false);
    await publisher.publish({ ...TICK, ts: 2_000 });
    await publisher.publish({ ...TICK, ts: 3_000 });

    expect(recoveries).toBe(1);
    expect(publisher.isFailing).toBe(false);
    expect(redis.sets).toHaveLength(3);
  });
});
