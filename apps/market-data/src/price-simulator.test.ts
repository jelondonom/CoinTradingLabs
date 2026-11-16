import { SYMBOLS, tickSchema } from '@coin/shared';
import { describe, expect, it } from 'vitest';
import { PriceSimulator } from './price-simulator.js';

describe('PriceSimulator', () => {
  it('genera ticks que cumplen el contrato para todos los símbolos', () => {
    const simulator = new PriceSimulator();
    for (const symbol of SYMBOLS) {
      for (let i = 0; i < 200; i += 1) {
        const tick = simulator.next(symbol, 1_800_000_000_000 + i);
        expect(tickSchema.safeParse(tick).success).toBe(true);
        expect(tick.last).toBeGreaterThanOrEqual(tick.bid);
        expect(tick.last).toBeLessThanOrEqual(tick.ask);
      }
    }
  });

  it('es determinista con un generador aleatorio fijo', () => {
    const a = new PriceSimulator(() => 0.75);
    const b = new PriceSimulator(() => 0.75);
    expect(a.next('BTCUSD', 1)).toEqual(b.next('BTCUSD', 1));
  });

  it('el precio sube cuando el aleatorio está por encima de 0,5', () => {
    const simulator = new PriceSimulator(() => 1);
    const first = simulator.next('BTCUSD', 1);
    const second = simulator.next('BTCUSD', 2);
    expect(second.last).toBeGreaterThan(first.last);
  });
});
