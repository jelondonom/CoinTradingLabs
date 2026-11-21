/**
 * Defectos del motor demostrados con tests. Cada caso describe el comportamiento CORRECTO.
 * Mientras un defecto está abierto, su caso va marcado con `it.fails`: pasa mientras el defecto
 * existe y se pone en rojo cuando el Agente Backend lo corrige. Entonces QA vuelve a probar,
 * quita `it.fails` y cierra el defecto en `docs/qa/defectos.md`. Los casos de los defectos
 * cerrados se quedan como pruebas de regresión.
 */
import { INITIAL_BALANCE_USD, MAX_TICK_FUTURE_MS, getInstrument } from '@coin/shared';
import fc from 'fast-check';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  apply,
  equityOf,
  firstBuyArb,
  fixedPriceScenarioArb,
  newSim,
  NOW,
  type Command,
} from './engine-harness.js';

const RUNS = { seed: 20270101, numRuns: 500 } as const;

/** Compra de TRX a 0,2849 sin spread, para aislar el redondeo del monto. */
function trxBuy(quantity: string): Command {
  return {
    instrument: getInstrument('TRXUSD'),
    tradable: true,
    side: 'buy',
    quantity,
    tick: { bid: '0.2849', ask: '0.2849', ageMs: 0 },
    now: NOW,
  };
}

describe('DEF-001 (cerrado): el redondeo a centavos por orden creaba dinero', () => {
  it('redondeo en contra: 100 compras de 37 TRX y una venta al mismo precio no dan ganancia', () => {
    // 37 × 0,2849 = 10,5413 se cobra 10,55 (techo) y 3.700 × 0,2849 = 1.054,13 es exacto.
    // Con el redondeo viejo (mitad hacia arriba) se cobraba 10,54 y el saldo subía a 100.000,13.
    const sim = newSim();
    for (let i = 0; i < 100; i += 1) expect(apply(sim, trxBuy('37')).status).toBe('filled');
    expect(apply(sim, { ...trxBuy('3700'), side: 'sell' }).status).toBe('filled');

    expect(sim.positions.size).toBe(0);
    expect(sim.balance.toFixed(2)).toBe('99999.13');
  });

  it('monto mínimo: 1.000 compras de 1 TRX (0,2849 USD) se rechazan y el saldo no cambia', () => {
    const sim = newSim();
    for (let i = 0; i < 1000; i += 1) {
      expect(apply(sim, trxBuy('1'))).toEqual({ status: 'rejected', reason: 'below_minimum' });
    }

    expect(sim.positions.size).toBe(0);
    expect(sim.balance.toFixed(2)).toBe(INITIAL_BALANCE_USD.toFixed(2));
  });

  it('propiedad: a precio fijo, ninguna secuencia de órdenes sube el equity', () => {
    fc.assert(
      fc.property(fixedPriceScenarioArb, ({ instrument, tick, orders }) => {
        const sim = newSim();
        for (const order of orders) {
          apply(sim, { instrument, tradable: true, tick, now: NOW, ...order });
          expect(equityOf(sim).lte(INITIAL_BALANCE_USD)).toBe(true);
        }
      }),
      RUNS,
    );
  });

  it('G2: el escenario de precio fijo ejecuta compras y ventas, no solo rechazos', () => {
    // Con el mínimo de 10 USD muchas órdenes pequeñas se rechazan: sin esta guardia, la propiedad
    // anterior podría pasar sin ejecutar casi nada. Mide el mismo generador con la misma semilla.
    const seen: Record<string, number> = {};
    for (const { instrument, tick, orders } of fc.sample(fixedPriceScenarioArb, RUNS)) {
      const sim = newSim();
      for (const order of orders) {
        const result = apply(sim, { instrument, tradable: true, tick, now: NOW, ...order });
        const key = result.status === 'filled' ? order.side : result.reason;
        seen[key] = (seen[key] ?? 0) + 1;
      }
    }
    writeCoverage(seen);
    for (const key of ['buy', 'sell', 'below_minimum']) {
      expect(seen[key] ?? 0, key).toBeGreaterThanOrEqual(100);
    }
  });
});

describe('DEF-002 (cerrado): un tick con fecha futura nunca se consideraba obsoleto', () => {
  it('rechaza un tick fechado una hora después de la hora del servidor', () => {
    fc.assert(
      fc.property(firstBuyArb, (command) => {
        fc.pre(command.tick !== null);
        const result = apply(newSim(), {
          ...command,
          tick: { ...command.tick!, ageMs: -3_600_000 },
        });
        expect(result).toEqual({ status: 'rejected', reason: 'stale_price' });
      }),
      RUNS,
    );
  });

  it('borde de D-11: un tick 2.000 ms en el futuro se acepta y uno de 2.001 ms se rechaza', () => {
    fc.assert(
      fc.property(firstBuyArb, (command) => {
        fc.pre(command.tick !== null);
        const withAge = (ageMs: number) =>
          apply(newSim(), { ...command, tick: { ...command.tick!, ageMs } });
        expect(withAge(-MAX_TICK_FUTURE_MS).status).toBe('filled');
        expect(withAge(-MAX_TICK_FUTURE_MS - 1)).toEqual({
          status: 'rejected',
          reason: 'stale_price',
        });
      }),
      RUNS,
    );
  });
});

/** Deja el conteo de G2 junto al de G1 (`<QA_COVERAGE_OUT>.g2.json`), si está definida. */
function writeCoverage(seen: Record<string, number>): void {
  const path = process.env.QA_COVERAGE_OUT;
  if (path) writeFileSync(`${path}.g2.json`, JSON.stringify(seen, null, 2));
}
