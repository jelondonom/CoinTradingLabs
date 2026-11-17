import { describe, expect, it } from 'vitest';
import { dec, roundMoney, roundPrice } from './decimal.js';
import { equity, marketValue, returnPct, unrealizedPnl } from './valuation.js';

describe('decimal', () => {
  it('lee un number por su representación decimal, sin error binario', () => {
    expect(dec(0.1).plus(dec(0.2)).toString()).toBe('0.3');
  });

  it('redondea dinero a centavos y precios a 8 decimales, la mitad hacia arriba', () => {
    expect(roundMoney(dec('1.005')).toFixed(2)).toBe('1.01');
    expect(roundMoney(dec('1.004')).toFixed(2)).toBe('1.00');
    expect(roundPrice(dec('1.000000005')).toFixed(8)).toBe('1.00000001');
  });
});

describe('valoración', () => {
  it('valora la posición al bid y redondea a centavos', () => {
    expect(marketValue('0.3', '62000.00').toFixed(2)).toBe('18600.00');
    expect(marketValue('0.00001', '60050.00').toFixed(2)).toBe('0.60');
  });

  it('calcula el P&L no realizado contra el costo', () => {
    expect(unrealizedPnl({ quantity: '0.3', costBasis: '18003.00' }, '62000.00').toFixed(2)).toBe(
      '597.00',
    );
    expect(unrealizedPnl({ quantity: '0.3', costBasis: '18003.00' }, '50000.00').toFixed(2)).toBe(
      '-3003.00',
    );
  });

  it('equity es el saldo más el valor de todas las posiciones', () => {
    expect(equity('1000.00', []).toFixed(2)).toBe('1000.00');
    expect(
      equity('1000.00', [
        { quantity: '2', bid: '10.50' },
        { quantity: '0.5', bid: '100.00' },
      ]).toFixed(2),
    ).toBe('1071.00');
  });

  it('retorno como fracción con 6 decimales', () => {
    expect(returnPct('100995.00', '100000.00').toString()).toBe('0.00995');
    expect(returnPct('90000.00', '100000.00').toString()).toBe('-0.1');
    expect(returnPct('100000.01', '100000.00').toString()).toBe('0');
    expect(() => returnPct('1', '0')).toThrow(RangeError);
  });
});
