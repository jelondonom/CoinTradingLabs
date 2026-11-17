import { describe, expect, it } from 'vitest';
import { estimateQuantity } from './estimate-quantity.js';

describe('estimateQuantity', () => {
  it('redondea hacia abajo a los decimales del instrumento', () => {
    expect(estimateQuantity(1000, 67246.4, 5)).toBe(0.01487);
    expect(estimateQuantity(1000, 230, 2)).toBe(4.34);
    expect(estimateQuantity(1000, 1.08, 0)).toBe(925);
  });

  it('no pierde una unidad exacta por el redondeo binario', () => {
    expect(estimateQuantity(0.3, 0.1, 0)).toBe(3);
  });

  it('devuelve null sin precio, sin monto o si no alcanza para la cantidad mínima', () => {
    expect(estimateQuantity(1000, undefined, 2)).toBeNull();
    expect(estimateQuantity(0, 100, 2)).toBeNull();
    expect(estimateQuantity(Number.NaN, 100, 2)).toBeNull();
    expect(estimateQuantity(1, 600, 0)).toBeNull();
  });
});
