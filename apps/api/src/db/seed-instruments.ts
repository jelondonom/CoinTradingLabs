import { INSTRUMENTS } from '@coin/shared';
import type { Db } from './prisma.js';

/** Carga el catálogo de instrumentos desde el contrato. Se puede repetir sin duplicar. */
export async function seedInstruments(db: Db): Promise<void> {
  for (const instrument of INSTRUMENTS) {
    const data = {
      name: instrument.name,
      assetClass: instrument.assetClass,
      quoteCurrency: instrument.quoteCurrency,
      pricePrecision: instrument.pricePrecision,
      quantityPrecision: instrument.quantityPrecision,
      // `toFixed` evita el error binario de `10 ** -n` (por ejemplo 0.000009999…).
      minQuantity: instrument.minQuantity.toFixed(instrument.quantityPrecision),
    };
    await db.instrument.upsert({
      where: { symbol: instrument.symbol },
      create: { symbol: instrument.symbol, ...data },
      update: data,
    });
  }
}
