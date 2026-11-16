import { SYMBOLS, type InstrumentSymbol } from '@coin/shared';

/** Mercado de Binance del que sale cada símbolo. Cada mercado usa una conexión propia. */
export type BinanceMarket = 'spot' | 'futures';
export const BINANCE_MARKETS: readonly BinanceMarket[] = ['spot', 'futures'];

type BinanceSource = { market: BinanceMarket; symbol: string };

/**
 * Símbolo interno → símbolo de Binance. Todo cotiza contra USDT.
 * Acciones y oro son contratos perpetuos que siguen al activo real; no son precios de bolsa.
 */
export const BINANCE_SOURCES: Record<InstrumentSymbol, BinanceSource> = {
  BTCUSD: { market: 'spot', symbol: 'BTCUSDT' },
  ETHUSD: { market: 'spot', symbol: 'ETHUSDT' },
  EURUSD: { market: 'spot', symbol: 'EURUSDT' },
  AAPL: { market: 'futures', symbol: 'AAPLUSDT' },
  NVDA: { market: 'futures', symbol: 'NVDAUSDT' },
  XAUUSD: { market: 'futures', symbol: 'XAUUSDT' },
};

/** Símbolos internos que se obtienen de un mercado. */
export function symbolsOf(
  market: BinanceMarket,
  symbols: readonly InstrumentSymbol[] = SYMBOLS,
): InstrumentSymbol[] {
  return symbols.filter((symbol) => BINANCE_SOURCES[symbol].market === market);
}

/** Nombre del stream de mejor bid/ask de un símbolo interno, por ejemplo `btcusdt@bookTicker`. */
export function bookTickerStream(symbol: InstrumentSymbol): string {
  return `${BINANCE_SOURCES[symbol].symbol.toLowerCase()}@bookTicker`;
}

/** Símbolo interno que corresponde a un símbolo de Binance en un mercado, si está en el catálogo. */
export function toInternalSymbol(
  market: BinanceMarket,
  binanceSymbol: string,
): InstrumentSymbol | undefined {
  return SYMBOLS.find((symbol) => {
    const source = BINANCE_SOURCES[symbol];
    return source.market === market && source.symbol === binanceSymbol;
  });
}
