import { z } from 'zod';
import { quantitySchema } from './primitives.js';

/** Catálogo cerrado V1: 10 cripto, 14 acciones y ETF, 6 materias primas y 1 par de forex. */
export const SYMBOLS = [
  // Cripto
  'BTCUSD',
  'ETHUSD',
  'SOLUSD',
  'BNBUSD',
  'LTCUSD',
  'AVAXUSD',
  'LINKUSD',
  'XRPUSD',
  'ADAUSD',
  'TRXUSD',
  // Acciones y ETF de EE. UU.
  'AAPL',
  'MSFT',
  'NVDA',
  'AMZN',
  'GOOGL',
  'META',
  'TSLA',
  'AVGO',
  'AMD',
  'ORCL',
  'NFLX',
  'LLY',
  'SPY',
  'QQQ',
  // Materias primas
  'XAUUSD',
  'XAGUSD',
  'XPTUSD',
  'WTIUSD',
  'BRENTUSD',
  'NGASUSD',
  // Forex
  'EURUSD',
] as const;

export const symbolSchema = z.enum(SYMBOLS);
export type InstrumentSymbol = z.infer<typeof symbolSchema>;

/** Los ETF (SPY, QQQ) se clasifican como `stock`. */
export const assetClassSchema = z.enum(['crypto', 'stock', 'forex', 'commodity']);
export type AssetClass = z.infer<typeof assetClassSchema>;

export const instrumentSchema = z.object({
  symbol: symbolSchema,
  name: z.string().min(1),
  assetClass: assetClassSchema,
  /** Todo cotiza en USD, igual que la moneda de la cuenta. */
  quoteCurrency: z.literal('USD'),
  /** Decimales con los que se muestra y redondea el precio. */
  pricePrecision: z.number().int().min(0).max(8),
  /** Decimales permitidos en la cantidad de una orden. */
  quantityPrecision: z.number().int().min(0).max(8),
  minQuantity: quantitySchema,
});
export type Instrument = z.infer<typeof instrumentSchema>;

function define(
  symbol: InstrumentSymbol,
  name: string,
  assetClass: AssetClass,
  pricePrecision: number,
  quantityPrecision: number,
): Instrument {
  return {
    symbol,
    name,
    assetClass,
    quoteCurrency: 'USD',
    pricePrecision,
    quantityPrecision,
    minQuantity: 10 ** -quantityPrecision,
  };
}

/**
 * `pricePrecision` sigue al proveedor de precios.
 * `quantityPrecision` lo confirmó el Agente Backend: el motor acepta estos valores (solicitud 6 de
 * `docs/engine-rules.md`).
 */
export const INSTRUMENTS: readonly Instrument[] = [
  define('BTCUSD', 'Bitcoin', 'crypto', 2, 5),
  define('ETHUSD', 'Ethereum', 'crypto', 2, 4),
  define('SOLUSD', 'Solana', 'crypto', 2, 2),
  define('BNBUSD', 'BNB', 'crypto', 2, 2),
  define('LTCUSD', 'Litecoin', 'crypto', 2, 2),
  define('AVAXUSD', 'Avalanche', 'crypto', 3, 2),
  define('LINKUSD', 'Chainlink', 'crypto', 3, 2),
  define('XRPUSD', 'XRP', 'crypto', 4, 0),
  define('ADAUSD', 'Cardano', 'crypto', 4, 0),
  define('TRXUSD', 'TRON', 'crypto', 4, 0),
  define('AAPL', 'Apple', 'stock', 2, 2),
  define('MSFT', 'Microsoft', 'stock', 2, 2),
  define('NVDA', 'NVIDIA', 'stock', 2, 2),
  define('AMZN', 'Amazon', 'stock', 2, 2),
  define('GOOGL', 'Alphabet', 'stock', 2, 2),
  define('META', 'Meta Platforms', 'stock', 2, 2),
  define('TSLA', 'Tesla', 'stock', 2, 2),
  define('AVGO', 'Broadcom', 'stock', 2, 2),
  define('AMD', 'AMD', 'stock', 2, 2),
  define('ORCL', 'Oracle', 'stock', 2, 2),
  define('NFLX', 'Netflix', 'stock', 2, 2),
  define('LLY', 'Eli Lilly', 'stock', 2, 2),
  define('SPY', 'ETF S&P 500 (SPY)', 'stock', 2, 2),
  define('QQQ', 'ETF Nasdaq 100 (QQQ)', 'stock', 2, 2),
  define('XAUUSD', 'Oro', 'commodity', 2, 2),
  define('XAGUSD', 'Plata', 'commodity', 2, 2),
  define('XPTUSD', 'Platino', 'commodity', 2, 2),
  define('WTIUSD', 'Petróleo WTI', 'commodity', 2, 2),
  define('BRENTUSD', 'Petróleo Brent', 'commodity', 2, 2),
  define('NGASUSD', 'Gas natural', 'commodity', 3, 2),
  define('EURUSD', 'Euro / Dólar', 'forex', 4, 0),
];

const INSTRUMENT_BY_SYMBOL = new Map(INSTRUMENTS.map((item) => [item.symbol, item]));

export function getInstrument(symbol: InstrumentSymbol): Instrument {
  const instrument = INSTRUMENT_BY_SYMBOL.get(symbol);
  if (!instrument) throw new Error(`Instrumento desconocido: ${symbol}`);
  return instrument;
}
