import { SYMBOLS } from '@coin/shared';
import { describe, expect, it } from 'vitest';
import { BINANCE_SOURCES, bookTickerStream, symbolsOf, toInternalSymbol } from './symbol-map.js';

describe('mapa de símbolos de Binance', () => {
  it('cada símbolo del catálogo tiene una fuente única y vuelve a sí mismo', () => {
    const sources = SYMBOLS.map((symbol) => BINANCE_SOURCES[symbol]);
    const keys = new Set(sources.map((source) => `${source.market}:${source.symbol}`));
    expect(keys.size).toBe(SYMBOLS.length);
    for (const symbol of SYMBOLS) {
      const { market, symbol: binanceSymbol } = BINANCE_SOURCES[symbol];
      expect(toInternalSymbol(market, binanceSymbol)).toBe(symbol);
      expect(binanceSymbol).toMatch(/^[A-Z]+USDT$/);
    }
  });

  it('reparte el catálogo entre spot y futuros sin dejar símbolos por fuera', () => {
    const spot = symbolsOf('spot');
    const futures = symbolsOf('futures');
    expect(spot.length + futures.length).toBe(SYMBOLS.length);
    expect(spot).toContain('BTCUSD');
    expect(spot).toContain('EURUSD');
    expect(futures).toContain('AAPL');
    expect(futures).toContain('XAUUSD');
  });

  it('usa los nombres de contrato de Binance para petróleo y gas', () => {
    expect(bookTickerStream('WTIUSD')).toBe('clusdt@bookTicker');
    expect(bookTickerStream('BRENTUSD')).toBe('bzusdt@bookTicker');
    expect(bookTickerStream('NGASUSD')).toBe('natgasusdt@bookTicker');
  });

  it('no reconoce símbolos fuera del catálogo ni del mercado equivocado', () => {
    expect(toInternalSymbol('spot', 'DOGEUSDT')).toBeUndefined();
    expect(toInternalSymbol('futures', 'BTCUSDT')).toBeUndefined();
  });
});
