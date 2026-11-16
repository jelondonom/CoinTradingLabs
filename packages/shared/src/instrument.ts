import { z } from 'zod';
import { quantitySchema } from './primitives.js';

/** Catálogo cerrado V0. */
export const SYMBOLS = ['BTCUSD', 'ETHUSD', 'AAPL', 'NVDA', 'EURUSD', 'XAUUSD'] as const;

export const symbolSchema = z.enum(SYMBOLS);
export type InstrumentSymbol = z.infer<typeof symbolSchema>;

export const assetClassSchema = z.enum(['crypto', 'stock', 'forex', 'commodity']);
export type AssetClass = z.infer<typeof assetClassSchema>;

export const instrumentSchema = z.object({
  symbol: symbolSchema,
  name: z.string().min(1),
  assetClass: assetClassSchema,
  /** V0: todo cotiza en USD, igual que la moneda de la cuenta. */
  quoteCurrency: z.literal('USD'),
  /** Decimales con los que se muestra y redondea el precio. */
  pricePrecision: z.number().int().min(0).max(8),
  /** Decimales permitidos en la cantidad de una orden. */
  quantityPrecision: z.number().int().min(0).max(8),
  minQuantity: quantitySchema,
});
export type Instrument = z.infer<typeof instrumentSchema>;

export const INSTRUMENTS: readonly Instrument[] = [
  {
    symbol: 'BTCUSD',
    name: 'Bitcoin',
    assetClass: 'crypto',
    quoteCurrency: 'USD',
    pricePrecision: 2,
    quantityPrecision: 5,
    minQuantity: 0.00001,
  },
  {
    symbol: 'ETHUSD',
    name: 'Ethereum',
    assetClass: 'crypto',
    quoteCurrency: 'USD',
    pricePrecision: 2,
    quantityPrecision: 4,
    minQuantity: 0.0001,
  },
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    assetClass: 'stock',
    quoteCurrency: 'USD',
    pricePrecision: 2,
    quantityPrecision: 2,
    minQuantity: 0.01,
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corp.',
    assetClass: 'stock',
    quoteCurrency: 'USD',
    pricePrecision: 2,
    quantityPrecision: 2,
    minQuantity: 0.01,
  },
  {
    symbol: 'EURUSD',
    name: 'Euro / Dólar',
    assetClass: 'forex',
    quoteCurrency: 'USD',
    pricePrecision: 5,
    quantityPrecision: 0,
    minQuantity: 1,
  },
  {
    symbol: 'XAUUSD',
    name: 'Oro',
    assetClass: 'commodity',
    quoteCurrency: 'USD',
    pricePrecision: 2,
    quantityPrecision: 2,
    minQuantity: 0.01,
  },
];

export function getInstrument(symbol: InstrumentSymbol): Instrument {
  const instrument = INSTRUMENTS.find((item) => item.symbol === symbol);
  if (!instrument) throw new Error(`Instrumento desconocido: ${symbol}`);
  return instrument;
}
