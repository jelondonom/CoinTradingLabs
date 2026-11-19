import { describe, expect, it } from 'vitest';
import {
  executeMarketOrder,
  MAX_FUTURE_SKEW_MS,
  type MarketOrderFilled,
  type MarketOrderInput,
  type MarketOrderResult,
} from './market-order.js';
import { equity, unrealizedPnl } from './valuation.js';

const NOW = 1_800_000_000_000;

/** Compra de 0,5 BTCUSD sobre una cuenta nueva, con un tick recién llegado. */
function input(overrides: Partial<MarketOrderInput> = {}): MarketOrderInput {
  return {
    now: NOW,
    window: { startsAt: NOW - 1000, endsAt: NOW + 1000 },
    instrument: { tradable: true, quantityPrecision: 5, minQuantity: '0.00001' },
    tick: { bid: '60000.00', ask: '60010.00', ts: NOW - 500 },
    staleAfterMs: 30_000,
    balance: '100000.00',
    position: null,
    side: 'buy',
    quantity: '0.5',
    ...overrides,
  };
}

function filled(result: MarketOrderResult): MarketOrderFilled {
  if (result.status !== 'filled') throw new Error(`Se esperaba filled y fue ${result.reason}`);
  return result;
}

function reason(result: MarketOrderResult): string {
  if (result.status !== 'rejected') throw new Error('Se esperaba un rechazo');
  return result.reason;
}

describe('compra market', () => {
  it('se ejecuta al ask y descuenta el monto del saldo', () => {
    const result = filled(executeMarketOrder(input()));

    expect(result.price.toFixed(2)).toBe('60010.00');
    expect(result.notional.toFixed(2)).toBe('30005.00');
    expect(result.ledgerAmount.toFixed(2)).toBe('-30005.00');
    expect(result.balanceAfter.toFixed(2)).toBe('69995.00');
    expect(result.realizedPnl.toFixed(2)).toBe('0.00');
    expect(result.position.quantity.toString()).toBe('0.5');
    expect(result.position.costBasis.toFixed(2)).toBe('30005.00');
    expect(result.position.avgEntryPrice.toFixed(2)).toBe('60010.00');
    expect(result.position.closed).toBe(false);
  });

  it('promedia el precio de entrada al sumar a una posición abierta', () => {
    const result = filled(
      executeMarketOrder(
        input({
          position: { quantity: '0.5', costBasis: '30005.00', realizedPnl: '12.34' },
          tick: { bid: '61990.00', ask: '62000.00', ts: NOW },
          balance: '69995.00',
          quantity: '0.5',
        }),
      ),
    );

    expect(result.notional.toFixed(2)).toBe('31000.00');
    expect(result.position.quantity.toString()).toBe('1');
    expect(result.position.costBasis.toFixed(2)).toBe('61005.00');
    expect(result.position.avgEntryPrice.toFixed(2)).toBe('61005.00');
    // Comprar no toca el P&L realizado acumulado.
    expect(result.position.realizedPnl.toFixed(2)).toBe('12.34');
  });

  it('permite gastar exactamente todo el saldo', () => {
    const result = filled(executeMarketOrder(input({ balance: '30005.00' })));
    expect(result.balanceAfter.toFixed(2)).toBe('0.00');
  });

  it('rechaza si el monto supera el saldo por un centavo', () => {
    expect(reason(executeMarketOrder(input({ balance: '30004.99' })))).toBe('insufficient_funds');
  });

  it('redondea el monto hacia arriba al centavo (D-01)', () => {
    // 0,00017 × 60.010,00 = 10,2017 → 10,21 (al más cercano sería 10,20).
    const tick = { bid: '60000.00', ask: '60010.00', ts: NOW };
    const result = filled(executeMarketOrder(input({ tick, quantity: '0.00017' })));
    expect(result.notional.toFixed(2)).toBe('10.21');
    expect(result.balanceAfter.toFixed(2)).toBe('99989.79');
  });
});

describe('monto mínimo de 10 USD (D-01)', () => {
  const unit = { tradable: true, quantityPrecision: 0, minQuantity: '1' };

  it('compra: rechaza 9,99 y acepta 10,00, comparando el monto ya redondeado', () => {
    const under = { bid: '9.98', ask: '9.99', ts: NOW };
    expect(
      reason(executeMarketOrder(input({ instrument: unit, tick: under, quantity: '1' }))),
    ).toBe('below_minimum');
    // 1 × 9,991 = 9,991 → 10,00 al redondear hacia arriba: ya alcanza el mínimo.
    const atMinimum = { bid: '9.99', ask: '9.991', ts: NOW };
    const result = filled(
      executeMarketOrder(input({ instrument: unit, tick: atMinimum, quantity: '1' })),
    );
    expect(result.notional.toFixed(2)).toBe('10.00');
  });

  it('venta parcial: rechaza bajo el mínimo', () => {
    const position = { quantity: '3', costBasis: '30.00', realizedPnl: '0' };
    const tick = { bid: '9.99', ask: '10.00', ts: NOW };
    expect(
      reason(
        executeMarketOrder(
          input({ instrument: unit, side: 'sell', quantity: '1', position, tick }),
        ),
      ),
    ).toBe('below_minimum');
  });

  it('venta total: cierra aunque valga menos de 10 USD', () => {
    const position = { quantity: '3', costBasis: '30.00', realizedPnl: '0' };
    const tick = { bid: '3.00', ask: '3.01', ts: NOW };
    const result = filled(
      executeMarketOrder(input({ instrument: unit, side: 'sell', quantity: '3', position, tick })),
    );
    expect(result.notional.toFixed(2)).toBe('9.00');
    expect(result.realizedPnl.toFixed(2)).toBe('-21.00');
    expect(result.position.closed).toBe(true);
  });

  it('el motivo va después de invalid_quantity y antes de los de saldo y posición', () => {
    const under = { bid: '9.98', ask: '9.99', ts: NOW };
    expect(
      reason(executeMarketOrder(input({ instrument: unit, tick: under, quantity: '1.5' }))),
    ).toBe('invalid_quantity');
    expect(
      reason(
        executeMarketOrder(input({ instrument: unit, tick: under, quantity: '1', balance: '0' })),
      ),
    ).toBe('below_minimum');
    expect(
      reason(
        executeMarketOrder(
          input({ instrument: unit, tick: under, side: 'sell', quantity: '1', position: null }),
        ),
      ),
    ).toBe('below_minimum');
  });
});

describe('DEF-001: el redondeo no crea dinero', () => {
  it('100 compras de 36 TRX y una venta, al mismo precio, no dan ganancia', () => {
    // 36 × 0,2849 = 10,2564: cada compra cuesta 10,26. La venta de 3.600 paga 1.025,64.
    const trx = { tradable: true, quantityPrecision: 0, minQuantity: '1' };
    const tick = { bid: '0.2849', ask: '0.2849', ts: NOW };
    let balance = '100000.00';
    let position: { quantity: string; costBasis: string; realizedPnl: string } | null = null;
    for (let i = 0; i < 100; i += 1) {
      const buy = filled(
        executeMarketOrder(input({ instrument: trx, tick, quantity: '36', balance, position })),
      );
      balance = buy.balanceAfter.toFixed(2);
      position = {
        quantity: buy.position.quantity.toString(),
        costBasis: buy.position.costBasis.toFixed(2),
        realizedPnl: buy.position.realizedPnl.toFixed(2),
      };
    }
    const sell = filled(
      executeMarketOrder(
        input({ instrument: trx, tick, side: 'sell', quantity: '3600', balance, position }),
      ),
    );
    expect(sell.notional.toFixed(2)).toBe('1025.64');
    expect(sell.balanceAfter.toFixed(2)).toBe('99999.64');
  });
});

describe('venta market', () => {
  const position = { quantity: '0.5', costBasis: '30005.00', realizedPnl: '0' };
  const tick = { bid: '62000.00', ask: '62010.00', ts: NOW };

  it('venta parcial: se ejecuta al bid y libera el costo en proporción', () => {
    const result = filled(
      executeMarketOrder(
        input({ side: 'sell', quantity: '0.2', position, tick, balance: '69995.00' }),
      ),
    );

    expect(result.price.toFixed(2)).toBe('62000.00');
    expect(result.notional.toFixed(2)).toBe('12400.00');
    expect(result.ledgerAmount.toFixed(2)).toBe('12400.00');
    expect(result.realizedPnl.toFixed(2)).toBe('398.00');
    expect(result.balanceAfter.toFixed(2)).toBe('82395.00');
    expect(result.position.quantity.toString()).toBe('0.3');
    expect(result.position.costBasis.toFixed(2)).toBe('18003.00');
    expect(result.position.avgEntryPrice.toFixed(2)).toBe('60010.00');
    expect(result.position.realizedPnl.toFixed(2)).toBe('398.00');
    expect(result.position.closed).toBe(false);
  });

  it('venta total: cierra la posición sin residuo de costo', () => {
    const result = filled(
      executeMarketOrder(
        input({ side: 'sell', quantity: '0.5', position, tick, balance: '69995.00' }),
      ),
    );

    expect(result.notional.toFixed(2)).toBe('31000.00');
    expect(result.realizedPnl.toFixed(2)).toBe('995.00');
    expect(result.position.quantity.isZero()).toBe(true);
    expect(result.position.costBasis.isZero()).toBe(true);
    expect(result.position.closed).toBe(true);
  });

  it('redondea el monto hacia abajo al centavo (D-01)', () => {
    // 0,00017 × 60.050,00 = 10,2085 → 10,20 (al más cercano sería 10,21).
    const result = filled(
      executeMarketOrder(
        input({
          side: 'sell',
          quantity: '0.00017',
          position,
          tick: { bid: '60050.00', ask: '60060.00', ts: NOW },
        }),
      ),
    );
    expect(result.notional.toFixed(2)).toBe('10.20');
  });

  it('registra una pérdida cuando el bid cae bajo el costo', () => {
    const result = filled(
      executeMarketOrder(
        input({
          side: 'sell',
          quantity: '0.5',
          position,
          tick: { bid: '59000.00', ask: '59010.00', ts: NOW },
        }),
      ),
    );
    expect(result.realizedPnl.toFixed(2)).toBe('-505.00');
  });

  it('rechaza vender sin posición o más de lo que hay', () => {
    expect(reason(executeMarketOrder(input({ side: 'sell', position: null })))).toBe(
      'insufficient_position',
    );
    expect(reason(executeMarketOrder(input({ side: 'sell', quantity: '0.50001', position })))).toBe(
      'insufficient_position',
    );
  });

  it('no pierde centavos al vender en muchas partes un costo que no divide exacto', () => {
    // 3 unidades con costo 100,00: cada tercio libera 33,33 y el cierre libera el resto.
    let balance = '0';
    let current = { quantity: '3', costBasis: '100.00', realizedPnl: '0' };
    let realized = 0;
    for (let i = 0; i < 3; i += 1) {
      const result = filled(
        executeMarketOrder(
          input({
            side: 'sell',
            quantity: '1',
            balance,
            position: current,
            instrument: { tradable: true, quantityPrecision: 0, minQuantity: '1' },
            tick: { bid: '40.00', ask: '40.01', ts: NOW },
          }),
        ),
      );
      balance = result.balanceAfter.toFixed(2);
      realized += Number(result.realizedPnl.toFixed(2));
      current = {
        quantity: result.position.quantity.toString(),
        costBasis: result.position.costBasis.toFixed(2),
        realizedPnl: result.position.realizedPnl.toFixed(2),
      };
    }
    expect(balance).toBe('120.00');
    expect(current.costBasis).toBe('0.00');
    expect(current.realizedPnl).toBe('20.00');
    expect(realized).toBeCloseTo(20, 10);
  });
});

describe('rechazos', () => {
  it('market_closed si el instrumento está deshabilitado', () => {
    const instrument = { tradable: false, quantityPrecision: 5, minQuantity: '0.00001' };
    expect(reason(executeMarketOrder(input({ instrument })))).toBe('market_closed');
  });

  it('market_closed fuera de la ventana de la competencia', () => {
    const window = { startsAt: NOW + 1, endsAt: NOW + 1000 };
    expect(reason(executeMarketOrder(input({ window })))).toBe('market_closed');
    // El final de la ventana es exclusivo.
    const ended = { startsAt: NOW - 1000, endsAt: NOW };
    expect(reason(executeMarketOrder(input({ window: ended })))).toBe('market_closed');
    // El inicio es inclusivo.
    const starting = { startsAt: NOW, endsAt: NOW + 1 };
    expect(executeMarketOrder(input({ window: starting })).status).toBe('filled');
  });

  it('no_price si no hay tick o el tick es inválido', () => {
    expect(reason(executeMarketOrder(input({ tick: null })))).toBe('no_price');
    expect(reason(executeMarketOrder(input({ tick: { bid: '0', ask: '1', ts: NOW } })))).toBe(
      'no_price',
    );
    expect(reason(executeMarketOrder(input({ tick: { bid: '2', ask: '1', ts: NOW } })))).toBe(
      'no_price',
    );
    expect(reason(executeMarketOrder(input({ tick: { bid: 'NaN', ask: '1', ts: NOW } })))).toBe(
      'no_price',
    );
  });

  it('stale_price solo cuando el tick supera el umbral', () => {
    const atLimit = { bid: '60000.00', ask: '60010.00', ts: NOW - 30_000 };
    expect(executeMarketOrder(input({ tick: atLimit })).status).toBe('filled');
    const stale = { ...atLimit, ts: NOW - 30_001 };
    expect(reason(executeMarketOrder(input({ tick: stale })))).toBe('stale_price');
  });

  it('stale_price si el tick viene del futuro más de 2 s (DEF-002)', () => {
    const atLimit = { bid: '60000.00', ask: '60010.00', ts: NOW + MAX_FUTURE_SKEW_MS };
    expect(executeMarketOrder(input({ tick: atLimit })).status).toBe('filled');
    const ahead = { ...atLimit, ts: NOW + MAX_FUTURE_SKEW_MS + 1 };
    expect(reason(executeMarketOrder(input({ tick: ahead })))).toBe('stale_price');
    const oneHour = { ...atLimit, ts: NOW + 3_600_000 };
    expect(reason(executeMarketOrder(input({ tick: oneHour })))).toBe('stale_price');
  });

  it('invalid_quantity por decimales de más, bajo el mínimo, cero o negativa', () => {
    for (const quantity of ['0.000001', '0', '-1', 'Infinity']) {
      expect(reason(executeMarketOrder(input({ quantity })))).toBe('invalid_quantity');
    }
    const instrument = { tradable: true, quantityPrecision: 2, minQuantity: '0.10' };
    expect(reason(executeMarketOrder(input({ instrument, quantity: '0.05' })))).toBe(
      'invalid_quantity',
    );
  });

  it('respeta el orden: mercado cerrado antes que precio, y precio antes que cantidad', () => {
    const instrument = { tradable: false, quantityPrecision: 5, minQuantity: '0.00001' };
    expect(reason(executeMarketOrder(input({ instrument, tick: null, quantity: '0' })))).toBe(
      'market_closed',
    );
    expect(reason(executeMarketOrder(input({ tick: null, quantity: '0' })))).toBe('no_price');
    const stale = { bid: '1', ask: '2', ts: NOW - 60_000 };
    expect(reason(executeMarketOrder(input({ tick: stale, quantity: '0' })))).toBe('stale_price');
  });
});

describe('ejemplo completo de docs/engine-rules.md', () => {
  it('equity − saldo inicial = P&L realizado + P&L no realizado', () => {
    const buy = filled(executeMarketOrder(input()));
    expect(unrealizedPnl(buy.position, '60000.00').toFixed(2)).toBe('-5.00');
    expect(
      equity(buy.balanceAfter, [{ quantity: buy.position.quantity, bid: '60000.00' }]).toFixed(2),
    ).toBe('99995.00');

    const sell = filled(
      executeMarketOrder(
        input({
          side: 'sell',
          quantity: '0.2',
          balance: buy.balanceAfter,
          position: buy.position,
          tick: { bid: '62000.00', ask: '62010.00', ts: NOW },
        }),
      ),
    );
    const unrealized = unrealizedPnl(sell.position, '62000.00');
    const total = equity(sell.balanceAfter, [
      { quantity: sell.position.quantity, bid: '62000.00' },
    ]);

    expect(unrealized.toFixed(2)).toBe('597.00');
    expect(total.toFixed(2)).toBe('100995.00');
    expect(total.minus('100000.00').eq(sell.position.realizedPnl.plus(unrealized))).toBe(true);
  });
});
