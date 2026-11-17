import { tickSchema } from '@coin/shared';
import { describe, expect, it } from 'vitest';
import { FUTURES_MESSAGES, SPOT_MESSAGES } from './binance.fixtures.js';
import { normalizeBookTicker } from './binance.js';

const RECEIVED_AT = 1_794_847_990_000;

describe('normalizeBookTicker', () => {
  it('convierte mensajes reales de spot y usa la hora de recepción', () => {
    const result = normalizeBookTicker('spot', SPOT_MESSAGES[0], RECEIVED_AT);
    expect(result).toMatchObject({
      ok: true,
      tick: { symbol: 'BTCUSD', bid: 64651.84, ask: 64651.85, ts: RECEIVED_AT },
    });
  });

  it('en futuros ignora la hora del evento de Binance y usa la de recepción', () => {
    expect(FUTURES_MESSAGES[0]).toContain('"E":1794847981009');
    const result = normalizeBookTicker('futures', FUTURES_MESSAGES[0], RECEIVED_AT);
    expect(result).toMatchObject({
      ok: true,
      tick: { symbol: 'XAUUSD', bid: 3863.01, ask: 3863.02, ts: RECEIVED_AT },
    });
  });

  it('todos los mensajes grabados producen ticks que cumplen el contrato', () => {
    const results = [
      ...SPOT_MESSAGES.map((raw) => normalizeBookTicker('spot', raw, RECEIVED_AT)),
      ...FUTURES_MESSAGES.map((raw) => normalizeBookTicker('futures', raw, RECEIVED_AT)),
    ];
    expect(results.map((r) => (r.ok ? r.tick.symbol : r.reason))).toEqual([
      'BTCUSD',
      'ETHUSD',
      'EURUSD',
      'XAUUSD',
      'NVDA',
      'AAPL',
    ]);
    for (const result of results) {
      if (!result.ok) continue;
      expect(tickSchema.safeParse(result.tick).success).toBe(true);
      expect(result.tick.last).toBeGreaterThanOrEqual(result.tick.bid);
      expect(result.tick.last).toBeLessThanOrEqual(result.tick.ask);
    }
  });

  it('last es el punto medio entre bid y ask', () => {
    const raw = '{"stream":"eurusdt@bookTicker","data":{"s":"EURUSDT","b":"1.1010","a":"1.1020"}}';
    const result = normalizeBookTicker('spot', raw, RECEIVED_AT);
    expect(result.ok && result.tick.last).toBe(1.1015);
  });

  it('rechaza lo que no es JSON o no tiene la forma esperada', () => {
    expect(normalizeBookTicker('spot', 'no-json', RECEIVED_AT)).toEqual({
      ok: false,
      reason: 'invalid_json',
    });
    expect(normalizeBookTicker('spot', '{"result":null,"id":1}', RECEIVED_AT)).toEqual({
      ok: false,
      reason: 'invalid_shape',
    });
    const numeric = '{"stream":"x","data":{"s":"BTCUSDT","b":64651.84,"a":64651.85}}';
    expect(normalizeBookTicker('spot', numeric, RECEIVED_AT)).toEqual({
      ok: false,
      reason: 'invalid_shape',
    });
  });

  it('rechaza símbolos fuera del catálogo o del mercado equivocado', () => {
    const doge = '{"stream":"dogeusdt@bookTicker","data":{"s":"DOGEUSDT","b":"0.1","a":"0.2"}}';
    expect(normalizeBookTicker('spot', doge, RECEIVED_AT)).toEqual({
      ok: false,
      reason: 'unknown_symbol',
    });
    expect(normalizeBookTicker('futures', SPOT_MESSAGES[0], RECEIVED_AT)).toEqual({
      ok: false,
      reason: 'unknown_symbol',
    });
  });

  it('rechaza precios en cero o con el libro cruzado', () => {
    const zero = '{"stream":"x","data":{"s":"BTCUSDT","b":"0.00000000","a":"64651.85"}}';
    const crossed = '{"stream":"x","data":{"s":"BTCUSDT","b":"64652.00","a":"64651.00"}}';
    expect(normalizeBookTicker('spot', zero, RECEIVED_AT)).toEqual({
      ok: false,
      reason: 'invalid_price',
    });
    expect(normalizeBookTicker('spot', crossed, RECEIVED_AT)).toEqual({
      ok: false,
      reason: 'invalid_price',
    });
  });
});
