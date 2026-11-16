import { getInstrument, type AssetClass, type InstrumentSymbol, type Tick } from '@coin/shared';

/**
 * Simulador de precios V0: caminata aleatoria alrededor de un precio base ficticio.
 * NO son precios reales. Lo reemplaza el feed del Agente Datos de Mercado y Tiempo Real.
 */
const BASE_PRICES: Record<InstrumentSymbol, number> = {
  BTCUSD: 95_000,
  ETHUSD: 3_500,
  SOLUSD: 180,
  BNBUSD: 650,
  LTCUSD: 90,
  AVAXUSD: 35,
  LINKUSD: 18,
  XRPUSD: 2.2,
  ADAUSD: 0.75,
  TRXUSD: 0.25,
  AAPL: 230,
  MSFT: 430,
  NVDA: 140,
  AMZN: 210,
  GOOGL: 180,
  META: 600,
  TSLA: 350,
  AVGO: 220,
  AMD: 140,
  ORCL: 180,
  NFLX: 900,
  LLY: 800,
  SPY: 600,
  QQQ: 520,
  XAUUSD: 2_650,
  XAGUSD: 31,
  XPTUSD: 950,
  WTIUSD: 70,
  BRENTUSD: 74,
  NGASUSD: 3.2,
  EURUSD: 1.08,
};

/** Variación máxima por tick, como fracción del precio. */
const STEP: Record<AssetClass, number> = {
  crypto: 0.0008,
  stock: 0.0004,
  forex: 0.0001,
  commodity: 0.0003,
};

/** Spread total, como fracción del precio. */
const SPREAD: Record<AssetClass, number> = {
  crypto: 0.0002,
  stock: 0.0002,
  forex: 0.0001,
  commodity: 0.0002,
};

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export class PriceSimulator {
  private readonly prices = new Map<InstrumentSymbol, number>();

  constructor(private readonly random: () => number = Math.random) {}

  next(symbol: InstrumentSymbol, ts: number): Tick {
    const instrument = getInstrument(symbol);
    const previous = this.prices.get(symbol) ?? BASE_PRICES[symbol];
    const change = (this.random() * 2 - 1) * STEP[instrument.assetClass];
    const mid = previous * (1 + change);
    this.prices.set(symbol, mid);

    const tickSize = 10 ** -instrument.pricePrecision;
    const halfSpread = Math.max((mid * SPREAD[instrument.assetClass]) / 2, tickSize / 2);
    const bid = roundTo(mid - halfSpread, instrument.pricePrecision);
    const ask = Math.max(roundTo(mid + halfSpread, instrument.pricePrecision), bid);
    const last = Math.min(Math.max(roundTo(mid, instrument.pricePrecision), bid), ask);

    return { symbol, bid, ask, last, ts };
  }
}
