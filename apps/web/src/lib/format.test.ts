import { describe, expect, it } from 'vitest';
import { formatMoney, formatPrice, formatQuantity } from './format.js';

describe('format', () => {
  it('formatea precios con los decimales del instrumento', () => {
    expect(formatPrice(67245.1, 2)).toBe('67.245,10');
    expect(formatPrice(1.0542, 4)).toBe('1,0542');
    expect(formatPrice(1234, 2)).toBe('1.234,00');
  });

  it('muestra una raya cuando no hay precio', () => {
    expect(formatPrice(undefined, 2)).toBe('—');
  });

  it('formatea dinero con signo', () => {
    expect(formatMoney(100000)).toBe('$100.000,00');
    expect(formatMoney(-8.2)).toBe('−$8,20');
  });

  it('formatea cantidades', () => {
    expect(formatQuantity(0.0149, 4)).toBe('0,0149');
    expect(formatQuantity(4, 0)).toBe('4');
  });
});
