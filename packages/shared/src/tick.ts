import { z } from 'zod';
import { symbolSchema } from './instrument.js';
import { priceSchema, timestampSchema } from './primitives.js';

/**
 * Último precio conocido de un símbolo.
 * Una compra market se ejecuta al `ask`; una venta market, al `bid`.
 */
export const tickSchema = z
  .object({
    symbol: symbolSchema,
    bid: priceSchema,
    ask: priceSchema,
    /** Precio de referencia para gráficas. Las posiciones largas se valoran al `bid` (D-10). */
    last: priceSchema,
    ts: timestampSchema,
  })
  .refine((tick) => tick.ask >= tick.bid, { message: 'ask debe ser mayor o igual que bid' });
export type Tick = z.infer<typeof tickSchema>;
