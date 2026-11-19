/**
 * Propiedades contables del motor de trading (`docs/engine-rules.md`, sección 9).
 * Corren contra el motor real. Son deterministas: semilla fija, sin reloj ni red.
 */
import { INITIAL_BALANCE_USD } from '@coin/shared';
import fc from 'fast-check';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dec, marketValue, ZERO } from '../../apps/api/src/engine/index.js';
import {
  anySequenceArb,
  apply,
  ceilToCents,
  equityOf,
  expectedOutcome,
  firstBuyArb,
  floorToCents,
  happySequenceArb,
  ledgerSum,
  materialize,
  newSim,
  roundHalfUpToCents,
  toScaled,
  toScaledOrThrow,
  unrealizedOf,
  MAX_FUTURE_SKEW_MS,
  STALE_AFTER_MS,
  WINDOW,
  type Command,
  type Intent,
  type Sim,
} from './engine-harness.js';

const RUNS = { seed: 20270101, numRuns: 500 } as const;

/** Corre la secuencia y llama a `check` después de cada orden. */
function run(
  intents: Intent[],
  check: (sim: Sim, command: Command, result: ReturnType<typeof apply>) => void,
): Sim {
  const sim = newSim();
  for (const intent of intents) {
    const command = materialize(sim, intent);
    check(sim, command, apply(sim, command));
  }
  return sim;
}

function expectSame(actual: { toFixed(): string }, expected: { toFixed(): string }): void {
  expect(actual.toFixed()).toBe(expected.toFixed());
}

describe('invariantes contables del motor', () => {
  it('I1: la suma de los asientos es igual al saldo', () => {
    fc.assert(
      fc.property(anySequenceArb, (commands) => {
        run(commands, (sim) => expectSame(ledgerSum(sim), sim.balance));
      }),
      RUNS,
    );
  });

  it('I2: el saldo nunca es negativo', () => {
    fc.assert(
      fc.property(anySequenceArb, (commands) => {
        run(commands, (sim) => expect(sim.balance.gte(0)).toBe(true));
      }),
      RUNS,
    );
  });

  it('I3: cantidad y costo de una posición nunca son negativos', () => {
    fc.assert(
      fc.property(happySequenceArb, (commands) => {
        run(commands, (sim) => {
          for (const position of sim.positions.values()) {
            expect(position.quantity.gt(0)).toBe(true);
            expect(position.costBasis.gte(0)).toBe(true);
          }
        });
      }),
      RUNS,
    );
  });

  it('I4: equity − saldo inicial = P&L realizado + P&L no realizado', () => {
    fc.assert(
      fc.property(happySequenceArb, (commands) => {
        run(commands, (sim) => {
          expectSame(
            equityOf(sim).minus(INITIAL_BALANCE_USD),
            sim.realizedPnl.plus(unrealizedOf(sim)),
          );
        });
      }),
      RUNS,
    );
  });

  it('I5: una posición cerrada queda con cantidad cero y costo cero', () => {
    fc.assert(
      fc.property(happySequenceArb, (commands) => {
        run(commands, (_sim, _command, result) => {
          if (result.status !== 'filled' || !result.position.closed) return;
          expectSame(result.position.quantity, ZERO);
          expectSame(result.position.costBasis, ZERO);
        });
      }),
      RUNS,
    );
  });

  it('I6: el P&L realizado de la posición acumula el de sus fills', () => {
    fc.assert(
      fc.property(happySequenceArb, (commands) => {
        const sim = newSim();
        for (const intent of commands) {
          const command = materialize(sim, intent);
          const before = sim.positions.get(command.instrument.symbol)?.realizedPnl ?? ZERO;
          const result = apply(sim, command);
          if (result.status !== 'filled') continue;
          expectSame(result.position.realizedPnl, before.plus(result.realizedPnl));
          if (command.side === 'buy') expectSame(result.realizedPnl, ZERO);
        }
      }),
      RUNS,
    );
  });
});

describe('ejecución', () => {
  it('E1: el precio es exactamente el ask (compra) o el bid (venta) del tick', () => {
    fc.assert(
      fc.property(happySequenceArb, (commands) => {
        run(commands, (_sim, command, result) => {
          if (result.status !== 'filled' || !command.tick) return;
          expectSame(
            result.price,
            dec(command.side === 'buy' ? command.tick.ask : command.tick.bid),
          );
        });
      }),
      RUNS,
    );
  });

  it('E2: monto = cantidad × precio al techo (compra) o al piso (venta), con su signo', () => {
    fc.assert(
      fc.property(happySequenceArb, (commands) => {
        run(commands, (_sim, command, result) => {
          if (result.status !== 'filled') return;
          const { quantityPrecision } = command.instrument;
          const exact =
            toScaledOrThrow(command.quantity, quantityPrecision) *
            toScaledOrThrow(result.price.toFixed(), 8);
          const scale = quantityPrecision + 8;
          // D-01: el redondeo va siempre en contra del participante.
          const cents =
            command.side === 'buy' ? ceilToCents(exact, scale) : floorToCents(exact, scale);

          expect(toScaled(result.notional.toFixed(), 2)).toBe(cents);
          expectSame(
            result.ledgerAmount,
            command.side === 'buy' ? result.notional.negated() : result.notional,
          );
        });
      }),
      RUNS,
    );
  });

  it('E3: todo monto de dinero tiene como máximo dos decimales', () => {
    fc.assert(
      fc.property(happySequenceArb, (commands) => {
        run(commands, (_sim, _command, result) => {
          if (result.status !== 'filled') return;
          for (const money of [
            result.notional,
            result.ledgerAmount,
            result.balanceAfter,
            result.realizedPnl,
            result.position.costBasis,
            result.position.realizedPnl,
          ]) {
            expect(money.decimalPlaces()).toBeLessThanOrEqual(2);
          }
        });
      }),
      RUNS,
    );
  });

  it('E4: comprar y vender lo mismo al mismo tick cuesta el spread más menos de 2 centavos', () => {
    fc.assert(
      fc.property(firstBuyArb, (command) => {
        if (!command.tick) throw new Error('Compra sin tick.');
        const sim = newSim();
        const buy = apply(sim, command);
        // La venta cierra toda la posición: se permite aunque valga menos de 10 USD (D-01).
        const sell = apply(sim, { ...command, side: 'sell' });
        if (buy.status !== 'filled' || sell.status !== 'filled')
          throw new Error('Orden rechazada.');

        expect(sim.positions.size).toBe(0);
        expectSame(sim.balance.minus(INITIAL_BALANCE_USD), sell.notional.minus(buy.notional));

        // Costo del ciclo = spread exacto + redondeo en contra: techo al comprar (< 1 centavo)
        // y piso al vender (< 1 centavo).
        const { quantityPrecision } = command.instrument;
        const centUnit = 10n ** BigInt(quantityPrecision + 6);
        const units = toScaledOrThrow(command.quantity, quantityPrecision);
        const spread =
          units * (toScaledOrThrow(command.tick.ask, 8) - toScaledOrThrow(command.tick.bid, 8));
        const cost = toScaledOrThrow(buy.notional.minus(sell.notional).toFixed(), 2) * centUnit;
        expect(cost - spread >= 0n).toBe(true);
        expect(cost - spread < 2n * centUnit).toBe(true);
        expect(sim.balance.lte(INITIAL_BALANCE_USD)).toBe(true);
      }),
      RUNS,
    );
  });
});

describe('rechazos', () => {
  it('R1: el motivo de rechazo sigue el orden de la tabla de validaciones', () => {
    fc.assert(
      fc.property(anySequenceArb, (commands) => {
        const sim = newSim();
        for (const intent of commands) {
          const command = materialize(sim, intent);
          const expected = expectedOutcome(sim, command);
          const result = apply(sim, command);
          expect(result.status === 'filled' ? 'filled' : result.reason).toBe(expected);
        }
      }),
      RUNS,
    );
  });

  it('R2: nunca se ejecuta con mercado cerrado, sin precio o con precio obsoleto', () => {
    fc.assert(
      fc.property(anySequenceArb, (commands) => {
        run(commands, (_sim, command, result) => {
          const blocked =
            !command.tradable ||
            command.tick === null ||
            command.tick.ageMs > STALE_AFTER_MS ||
            // Tick del futuro, más de 2 s (D-11, DEF-002).
            -command.tick.ageMs > MAX_FUTURE_SKEW_MS ||
            command.now < WINDOW.startsAt ||
            command.now >= WINDOW.endsAt;
          if (blocked) expect(result.status).toBe('rejected');
        });
      }),
      RUNS,
    );
  });

  it('R3: una orden rechazada no devuelve ningún efecto contable', () => {
    fc.assert(
      fc.property(anySequenceArb, (commands) => {
        run(commands, (_sim, _command, result) => {
          if (result.status === 'rejected') {
            expect(Object.keys(result).sort()).toEqual(['reason', 'status']);
          }
        });
      }),
      RUNS,
    );
  });

  it('R4: el motor no ejecuta un tick con ask menor que bid', () => {
    fc.assert(
      fc.property(firstBuyArb, fc.integer({ min: 1, max: 1000 }), (command, gap) => {
        fc.pre(command.tick !== null);
        const bid = dec(command.tick!.ask).plus(dec(gap).div(10_000)).toFixed();
        const result = apply(newSim(), { ...command, tick: { ...command.tick!, bid } });
        expect(result).toEqual({ status: 'rejected', reason: 'no_price' });
      }),
      RUNS,
    );
  });
});

describe('valoración', () => {
  it('V1: una posición larga se valora al bid, en centavos', () => {
    fc.assert(
      fc.property(firstBuyArb, (command) => {
        fc.pre(command.tick !== null);
        const { quantityPrecision } = command.instrument;
        const units = toScaled(command.quantity, quantityPrecision);
        const bid = toScaled(command.tick!.bid, 8);
        if (units === null || bid === null) throw new Error('Fuera de escala.');
        expect(toScaled(marketValue(command.quantity, command.tick!.bid).toFixed(), 2)).toBe(
          roundHalfUpToCents(units * bid, quantityPrecision + 8),
        );
      }),
      RUNS,
    );
  });
});

describe('generadores', () => {
  it('G1: las secuencias ejercitan compras, ventas parciales, cierres y cada rechazo', () => {
    const seen: Record<string, number> = {};
    const count = (key: string) => (seen[key] = (seen[key] ?? 0) + 1);
    for (const arb of [happySequenceArb, anySequenceArb]) {
      for (const intents of fc.sample(arb, { seed: RUNS.seed, numRuns: 300 })) {
        run(intents, (_sim, command, result) => {
          if (result.status === 'rejected') count(result.reason);
          else if (command.side === 'buy') count('buy');
          else count(result.position.closed ? 'close' : 'partialSell');
          // Ticks del futuro (D-11): unos se aceptan (hasta 2 s) y otros se rechazan.
          if (command.tick && command.tick.ageMs < 0) {
            if (result.status === 'filled') count('futureTickFilled');
            else if (result.reason === 'stale_price') count('futureTickStale');
          }
        });
      }
    }
    writeCoverage(seen);
    for (const key of [
      'buy',
      'partialSell',
      'close',
      'market_closed',
      'no_price',
      'stale_price',
      'invalid_quantity',
      'below_minimum',
      'insufficient_funds',
      'insufficient_position',
      'futureTickFilled',
      'futureTickStale',
    ]) {
      expect(seen[key] ?? 0, key).toBeGreaterThanOrEqual(100);
    }
  });
});

/** Deja el conteo en `QA_COVERAGE_OUT`, si está definida, para citarlo en los reportes. */
function writeCoverage(seen: Record<string, number>): void {
  const path = process.env.QA_COVERAGE_OUT;
  if (path) writeFileSync(path, JSON.stringify(seen, null, 2));
}
