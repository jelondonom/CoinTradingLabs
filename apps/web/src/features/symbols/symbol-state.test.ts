import { describe, expect, it } from 'vitest';
import { symbolState } from './symbol-state.js';

describe('symbolState', () => {
  it('sin ningún tick es no-price, lo marque o no obsoleto el servidor', () => {
    expect(symbolState({ hasTick: false, stale: true })).toBe('no-price');
    expect(symbolState({ hasTick: false, stale: false })).toBe('no-price');
  });

  it('con tick y marcado obsoleto es stale', () => {
    expect(symbolState({ hasTick: true, stale: true })).toBe('stale');
  });

  it('con tick y precio vigente es live', () => {
    expect(symbolState({ hasTick: true, stale: false })).toBe('live');
  });
});
