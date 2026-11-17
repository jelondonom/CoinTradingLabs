import { describe, expect, it } from 'vitest';
import { MemoryTickSource, RedisTickSource, lastTickKey, parseTick } from './tick-source.js';

const tick = { symbol: 'BTCUSD', bid: 60000, ask: 60010, last: 60005, ts: 1_800_000_000_000 };

describe('parseTick', () => {
  it('lee un tick válido del contrato', () => {
    expect(parseTick(JSON.stringify(tick), 'BTCUSD')).toEqual({
      bid: 60000,
      ask: 60010,
      ts: 1_800_000_000_000,
    });
  });

  it('devuelve null si falta, no es JSON, rompe el contrato o es de otro símbolo', () => {
    expect(parseTick(null, 'BTCUSD')).toBeNull();
    expect(parseTick('{', 'BTCUSD')).toBeNull();
    expect(parseTick(JSON.stringify({ ...tick, bid: 70000 }), 'BTCUSD')).toBeNull();
    expect(parseTick(JSON.stringify(tick), 'ETHUSD')).toBeNull();
  });
});

describe('RedisTickSource', () => {
  it('lee la llave last:{symbol}', async () => {
    const keys: string[] = [];
    const source = new RedisTickSource({
      get: async (key) => {
        keys.push(key);
        return JSON.stringify(tick);
      },
    });
    expect(await source.getLastTick('BTCUSD')).toMatchObject({ bid: 60000, ask: 60010 });
    expect(keys).toEqual([lastTickKey('BTCUSD')]);
    expect(lastTickKey('BTCUSD')).toBe('last:BTCUSD');
  });

  it('sin Redis no hay precio', async () => {
    const source = new RedisTickSource({
      get: async () => {
        throw new Error('sin conexión');
      },
    });
    expect(await source.getLastTick('BTCUSD')).toBeNull();
  });
});

describe('MemoryTickSource', () => {
  it('guarda y borra ticks', async () => {
    const source = new MemoryTickSource();
    expect(await source.getLastTick('BTCUSD')).toBeNull();
    source.set('BTCUSD', { bid: '1', ask: '2', ts: 1 });
    expect(await source.getLastTick('BTCUSD')).toEqual({ bid: '1', ask: '2', ts: 1 });
    source.set('BTCUSD', null);
    expect(await source.getLastTick('BTCUSD')).toBeNull();
  });
});
