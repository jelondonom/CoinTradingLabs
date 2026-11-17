import { INSTRUMENTS } from '@coin/shared';
import { describe, expect, it } from 'vitest';
import { filterInstruments } from './filter-instruments.js';

const symbols = (query: string, filter: Parameters<typeof filterInstruments>[2] = 'all') =>
  filterInstruments(INSTRUMENTS, query, filter).map((instrument) => instrument.symbol);

describe('filterInstruments', () => {
  it('devuelve todo el catálogo sin filtros', () => {
    expect(symbols('')).toHaveLength(INSTRUMENTS.length);
  });

  it('busca por símbolo y por nombre sin distinguir mayúsculas ni tildes', () => {
    expect(symbols('btc')).toEqual(['BTCUSD']);
    expect(symbols('PETROLEO')).toEqual(['WTIUSD', 'BRENTUSD']);
  });

  it('filtra por clase de activo', () => {
    expect(symbols('', 'forex')).toEqual(['EURUSD']);
    expect(symbols('', 'crypto')).toHaveLength(10);
  });

  it('combina texto y clase', () => {
    expect(symbols('oro', 'crypto')).toEqual([]);
    expect(symbols('oro', 'commodity')).toEqual(['XAUUSD']);
  });
});
