import { describe, expect, it } from 'vitest';
import { dec } from '../../engine/index.js';
import { fitsQuantityColumn } from './quantity-column.js';

describe('fitsQuantityColumn (DEF-003)', () => {
  it.each([
    ['0.01', true],
    ['0.00000001', true],
    ['1e-9', false],
    ['4e-9', false],
    ['1e-30', false],
    ['1e19', true],
    ['99999999999999999999.99999999', true],
    ['1e20', false],
    ['1e21', false],
  ])('%s cabe en DECIMAL(28,8): %s', (value, fits) => {
    expect(fitsQuantityColumn(dec(value))).toBe(fits);
  });

  it('lee un number tal como lo deja JSON.parse', () => {
    expect(fitsQuantityColumn(dec(JSON.parse('1e-30') as number))).toBe(false);
    expect(fitsQuantityColumn(dec(JSON.parse('0.00012345') as number))).toBe(true);
    expect(fitsQuantityColumn(dec(JSON.parse('1e21') as number))).toBe(false);
  });
});
