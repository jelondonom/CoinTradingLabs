/**
 * Defectos del motor demostrados con tests. Cada caso describe el comportamiento CORRECTO y
 * está marcado con `it.fails`: pasa mientras el defecto existe y se pone en rojo cuando el
 * Agente Backend lo corrige. En ese momento QA vuelve a probar, quita `it.fails` y cierra el
 * defecto en `docs/qa/defectos.md`.
 */
import { INITIAL_BALANCE_USD, getInstrument } from '@coin/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  apply,
  equityOf,
  firstBuyArb,
  newSim,
  NOW,
  quantityArb,
  tickArb,
  instrumentArb,
  type Command,
} from './engine-harness.js';

const RUNS = { seed: 20270101, numRuns: 500 } as const;

describe('DEF-001: el redondeo a centavos por orden crea dinero', () => {
  it.fails(
    'caso concreto: 1.000 compras de 1 TRX y una venta, al mismo precio, no dan ganancia',
    () => {
      const order: Command = {
        instrument: getInstrument('TRXUSD'),
        tradable: true,
        side: 'buy',
        quantity: '1',
        // Sin spread, para aislar el redondeo: 1 × 0,2849 = 0,2849 se cobra como 0,28.
        tick: { bid: '0.2849', ask: '0.2849', ageMs: 0 },
        now: NOW,
      };
      const sim = newSim();
      for (let i = 0; i < 1000; i += 1) apply(sim, order);
      apply(sim, { ...order, side: 'sell', quantity: '1000' });

      expect(sim.positions.size).toBe(0);
      expect(sim.balance.toFixed(2)).toBe(INITIAL_BALANCE_USD.toFixed(2));
    },
  );

  it.fails('propiedad: a precio fijo, ninguna secuencia de órdenes sube el equity', () => {
    fc.assert(
      fc.property(
        instrumentArb.chain((instrument) =>
          fc.record({
            instrument: fc.constant(instrument),
            tick: tickArb(instrument),
            orders: fc.array(
              fc.record({
                side: fc.constantFrom('buy' as const, 'sell' as const),
                quantity: quantityArb(instrument, 50),
              }),
              { minLength: 1, maxLength: 80 },
            ),
          }),
        ),
        ({ instrument, tick, orders }) => {
          const sim = newSim();
          for (const order of orders) {
            apply(sim, { instrument, tradable: true, tick, now: NOW, ...order });
            expect(equityOf(sim).lte(INITIAL_BALANCE_USD)).toBe(true);
          }
        },
      ),
      RUNS,
    );
  });
});

describe('DEF-002: un tick con fecha futura nunca se considera obsoleto', () => {
  it('rechaza un tick fechado una hora después de la hora del servidor', () => {
    fc.assert(
      fc.property(firstBuyArb, (command) => {
        fc.pre(command.tick !== null);
        const result = apply(newSim(), {
          ...command,
          tick: { ...command.tick!, ageMs: -3_600_000 },
        });
        expect(result.status).toBe('rejected');
      }),
      RUNS,
    );
  });
});
