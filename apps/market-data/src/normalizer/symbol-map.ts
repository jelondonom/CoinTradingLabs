import { SYMBOLS, type InstrumentSymbol } from '@coin/shared';

/** Mercado de Binance del que sale cada símbolo. Cada mercado usa una conexión propia. */
export type BinanceMarket = 'spot' | 'futures';
export const BINANCE_MARKETS: readonly BinanceMarket[] = ['spot', 'futures'];

type BinanceSource = { market: BinanceMarket; symbol: string };

const spot = (symbol: string): BinanceSource => ({ market: 'spot', symbol });
const futures = (symbol: string): BinanceSource => ({ market: 'futures', symbol });

/**
 * Símbolo interno → símbolo de Binance. Todo cotiza contra USDT.
 * Acciones, ETF y materias primas son contratos perpetuos que siguen al activo real;
 * no son precios de bolsa.
 */
export const BINANCE_SOURCES: Record<InstrumentSymbol, BinanceSource> = {
  BTCUSD: spot('BTCUSDT'),
  ETHUSD: spot('ETHUSDT'),
  SOLUSD: spot('SOLUSDT'),
  BNBUSD: spot('BNBUSDT'),
  LTCUSD: spot('LTCUSDT'),
  AVAXUSD: spot('AVAXUSDT'),
  LINKUSD: spot('LINKUSDT'),
  XRPUSD: spot('XRPUSDT'),
  ADAUSD: spot('ADAUSDT'),
  TRXUSD: spot('TRXUSDT'),
  EURUSD: spot('EURUSDT'),
  AAPL: futures('AAPLUSDT'),
  MSFT: futures('MSFTUSDT'),
  NVDA: futures('NVDAUSDT'),
  AMZN: futures('AMZNUSDT'),
  GOOGL: futures('GOOGLUSDT'),
  META: futures('METAUSDT'),
  TSLA: futures('TSLAUSDT'),
  AVGO: futures('AVGOUSDT'),
  AMD: futures('AMDUSDT'),
  ORCL: futures('ORCLUSDT'),
  NFLX: futures('NFLXUSDT'),
  LLY: futures('LLYUSDT'),
  SPY: futures('SPYUSDT'),
  QQQ: futures('QQQUSDT'),
  XAUUSD: futures('XAUUSDT'),
  XAGUSD: futures('XAGUSDT'),
  XPTUSD: futures('XPTUSDT'),
  WTIUSD: futures('CLUSDT'),
  BRENTUSD: futures('BZUSDT'),
  NGASUSD: futures('NATGASUSDT'),
};

const INTERNAL_BY_SOURCE = new Map(
  SYMBOLS.map((symbol) => {
    const source = BINANCE_SOURCES[symbol];
    return [`${source.market}:${source.symbol}`, symbol] as const;
  }),
);

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
  return INTERNAL_BY_SOURCE.get(`${market}:${binanceSymbol}`);
}
