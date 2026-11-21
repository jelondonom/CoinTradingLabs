import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase } from '../testing/test-database.js';
import { createDb, type Db } from './prisma.js';
import { seedInstruments } from './seed-instruments.js';

/**
 * Tabla `candles` (D-18) contra Postgres real, con `pg` y SQL directo, como la usa Datos de
 * Mercado. Base propia: `coin_api_test_candles`. `INSERT_INSTRUMENT` y `UPSERT_BATCH` son el SQL
 * de `prisma/README.md`: si cambian aquí, cambian allá.
 */
const databaseUrl = await prepareTestDatabase('coin_api_test_candles');

/** 2027-01-15 00:00 UTC: inicio de una vela en los seis intervalos. */
const DAY = Date.UTC(2027, 0, 15);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const INSERT_INSTRUMENT = `
INSERT INTO instruments (symbol, name, asset_class, price_precision, quantity_precision, min_quantity)
VALUES ('BTCUSD', 'Bitcoin', 'crypto', 2, 5, 0.00001)
ON CONFLICT (symbol) DO NOTHING`;

const UPSERT_BATCH = `
INSERT INTO candles (symbol, interval, open_time, open, high, low, close, volume)
SELECT * FROM unnest(
  $1::text[], $2::candle_interval[], $3::timestamptz[],
  $4::numeric[], $5::numeric[], $6::numeric[], $7::numeric[], $8::numeric[]
)
ON CONFLICT (symbol, interval, open_time) DO UPDATE SET
  open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
  close = EXCLUDED.close, volume = EXCLUDED.volume`;

type Row = {
  symbol: string;
  interval: string;
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
};

function candle(overrides: Partial<Row> = {}): Row {
  return {
    symbol: 'BTCUSD',
    interval: '1m',
    openTime: DAY,
    open: '60000',
    high: '60100',
    low: '59900',
    close: '60050',
    volume: '0',
    ...overrides,
  };
}

/** Un arreglo por columna, en el orden de `UPSERT_BATCH`. */
function columns(rows: Row[]): unknown[] {
  return [
    rows.map((row) => row.symbol),
    rows.map((row) => row.interval),
    rows.map((row) => new Date(row.openTime)),
    rows.map((row) => row.open),
    rows.map((row) => row.high),
    rows.map((row) => row.low),
    rows.map((row) => row.close),
    rows.map((row) => row.volume),
  ];
}

describe.skipIf(!databaseUrl)('tabla candles (D-18)', () => {
  let client: pg.Client;
  let db: Db;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: databaseUrl as string });
    await client.connect();
    // El ejemplo del README sirve con el catálogo vacío; después el seed carga los otros 30.
    await client.query(INSERT_INSTRUMENT);
    db = createDb(databaseUrl as string);
    await seedInstruments(db);
  });

  afterAll(async () => {
    await client?.end();
    await db?.$disconnect();
  });

  const upsert = (...rows: Row[]) => client.query(UPSERT_BATCH, columns(rows));
  const insertOne = (row: Row) =>
    client.query(
      `INSERT INTO candles (symbol, interval, open_time, open, high, low, close, volume)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      columns([row]).map((column) => (column as unknown[])[0]),
    );

  it('un lote guarda velas terminadas y el upsert sobrescribe la vela del hueco', async () => {
    await upsert(
      candle(),
      candle({
        openTime: DAY + MINUTE,
        open: '60050',
        high: '60090',
        low: '60000',
        close: '60080',
      }),
    );
    // Tras reconectar, el historial de Binance trae la misma vela con el volumen real.
    await upsert(candle({ close: '60020', volume: '12.5' }));

    const { rows } = await client.query(
      `SELECT open_time, close, volume FROM candles
       WHERE symbol = 'BTCUSD' AND interval = '1m' ORDER BY open_time`,
    );
    expect(rows).toHaveLength(2);
    // `pg` devuelve NUMERIC como texto y TIMESTAMPTZ como Date.
    expect(rows[0]).toMatchObject({ close: '60020.00000000', volume: '12.50000000' });
    expect((rows[0].open_time as Date).getTime()).toBe(DAY);
  });

  it('acepta una vela alineada en cada intervalo', async () => {
    await upsert(
      candle({ interval: '5m', openTime: DAY + 5 * MINUTE }),
      candle({ interval: '15m', openTime: DAY + 15 * MINUTE }),
      candle({ interval: '1h', openTime: DAY + HOUR }),
      candle({ interval: '4h', openTime: DAY + 4 * HOUR }),
      candle({ interval: '1d', openTime: DAY }),
    );
    // Ordena por el enum, no por el texto: el orden del enum es el de `CANDLE_INTERVALS`.
    const { rows } = await client.query(
      `SELECT interval::text AS name FROM candles WHERE interval <> '1m' ORDER BY interval`,
    );
    expect(rows.map((row) => row.name)).toEqual(['5m', '15m', '1h', '4h', '1d']);
  });

  it('una llave repetida sin ON CONFLICT se rechaza', async () => {
    const row = candle({ openTime: DAY + 10 * MINUTE });
    await insertOne(row);
    await expect(insertOne(row)).rejects.toMatchObject({
      code: '23505',
      constraint: 'candles_pkey',
    });
  });

  it.each([
    [
      'un símbolo fuera del catálogo',
      candle({ symbol: 'FAKEUSD' }),
      '23503',
      'candles_symbol_fkey',
    ],
    [
      'high menor que close',
      candle({ high: '60000' }),
      '23514',
      'candles_range_contains_open_close',
    ],
    [
      'low igual a cero',
      candle({ open: '1', high: '2', low: '0', close: '1' }),
      '23514',
      'candles_low_positive',
    ],
    ['volumen negativo', candle({ volume: '-1' }), '23514', 'candles_volume_non_negative'],
    [
      'una vela de 1m a los 30 s',
      candle({ openTime: DAY + 30_000 }),
      '23514',
      'candles_open_time_aligned',
    ],
    [
      'una vela de 4h a la 01:00 UTC',
      candle({ interval: '4h', openTime: DAY + HOUR }),
      '23514',
      'candles_open_time_aligned',
    ],
    [
      'una vela de 1d a la medianoche de Colombia (05:00 UTC)',
      candle({ interval: '1d', openTime: DAY + 5 * HOUR }),
      '23514',
      'candles_open_time_aligned',
    ],
  ])('rechaza %s', async (_name, row, code, constraint) => {
    await expect(insertOne(row)).rejects.toMatchObject({ code, constraint });
  });

  it('rechaza un intervalo que no existe (2h)', async () => {
    await expect(insertOne(candle({ interval: '2h' }))).rejects.toMatchObject({ code: '22P02' });
  });

  it('Prisma lee las velas con el modelo Candle: esquema y migración coinciden', async () => {
    const rows = await db.candle.findMany({
      where: { symbol: 'BTCUSD', interval: 'm1' },
      orderBy: { openTime: 'asc' },
    });
    expect(rows[0]?.openTime.getTime()).toBe(DAY);
    expect(rows[0]?.close.toFixed(2)).toBe('60020.00');
    expect(rows[0]?.volume.toString()).toBe('12.5');
  });

  it('la consulta de GET /candles usa la llave primaria, sin otro índice', async () => {
    await client.query('SET enable_seqscan = off');
    try {
      const { rows } = await client.query(
        `EXPLAIN SELECT open_time, open, high, low, close, volume FROM candles
         WHERE symbol = $1 AND interval = $2 AND open_time BETWEEN $3 AND $4
         ORDER BY open_time DESC LIMIT 1000`,
        ['BTCUSD', '1m', new Date(DAY), new Date(DAY + HOUR)],
      );
      const plan = rows.map((row) => row['QUERY PLAN']).join('\n');
      // Solo exige la llave primaria: la forma exacta del plan cambia entre versiones.
      expect(plan).toMatch(/candles_pkey/);
    } finally {
      await client.query('RESET enable_seqscan');
    }
  });
});
