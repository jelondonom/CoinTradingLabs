import { describe, expect, it } from 'vitest';
import { dataValue } from './data-value.js';

describe('dataValue', () => {
  it('escribe el número tal cual, sin redondeo, separadores ni moneda', () => {
    expect(dataValue(100000)).toBe('100000');
    expect(dataValue(99987.65)).toBe('99987.65');
    expect(dataValue(0.00016)).toBe('0.00016');
    expect(dataValue(0)).toBe('0');
  });

  it('conserva el signo de los negativos', () => {
    expect(dataValue(-12.5)).toBe('-12.5');
  });

  it('sin un número finito no hay atributo', () => {
    expect(dataValue(undefined)).toBeUndefined();
    expect(dataValue(null)).toBeUndefined();
    expect(dataValue(Number.NaN)).toBeUndefined();
    expect(dataValue(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});
