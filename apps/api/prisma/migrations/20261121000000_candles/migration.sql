-- CreateEnum
CREATE TYPE "candle_interval" AS ENUM ('1m', '5m', '15m', '1h', '4h', '1d');

-- CreateTable
CREATE TABLE "candles" (
    "symbol" TEXT NOT NULL,
    "interval" "candle_interval" NOT NULL,
    "open_time" TIMESTAMPTZ(3) NOT NULL,
    "open" DECIMAL(20,8) NOT NULL,
    "high" DECIMAL(20,8) NOT NULL,
    "low" DECIMAL(20,8) NOT NULL,
    "close" DECIMAL(20,8) NOT NULL,
    "volume" DECIMAL(28,8) NOT NULL,

    CONSTRAINT "candles_pkey" PRIMARY KEY ("symbol","interval","open_time")
);

-- AddForeignKey
ALTER TABLE "candles" ADD CONSTRAINT "candles_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "instruments"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Reglas que Prisma no expresa en `schema.prisma`. Escritas a mano por el Agente Backend.
-- Copian `candleSchema` de `@coin/shared` y las acordó Datos de Mercado el 2026-11-21 (D-18).
-- ---------------------------------------------------------------------------------------------

-- Precios positivos: con la regla siguiente, `low > 0` alcanza para los cuatro.
ALTER TABLE "candles" ADD CONSTRAINT "candles_low_positive" CHECK ("low" > 0);

-- `high` y `low` contienen a `open` y `close`.
ALTER TABLE "candles" ADD CONSTRAINT "candles_range_contains_open_close"
  CHECK ("high" >= GREATEST("open", "close") AND "low" <= LEAST("open", "close"));

ALTER TABLE "candles" ADD CONSTRAINT "candles_volume_non_negative" CHECK ("volume" >= 0);

-- `open_time` alineado al intervalo, contado desde la época UTC (como los klines de Binance):
-- una misma vela nunca queda guardada dos veces con segundos distintos. Un intervalo nuevo en
-- el enum cae en `ELSE FALSE` hasta que se agregue aquí.
ALTER TABLE "candles" ADD CONSTRAINT "candles_open_time_aligned" CHECK (
  CASE "interval"
    WHEN '1m' THEN (EXTRACT(EPOCH FROM "open_time") * 1000)::BIGINT % 60000 = 0
    WHEN '5m' THEN (EXTRACT(EPOCH FROM "open_time") * 1000)::BIGINT % 300000 = 0
    WHEN '15m' THEN (EXTRACT(EPOCH FROM "open_time") * 1000)::BIGINT % 900000 = 0
    WHEN '1h' THEN (EXTRACT(EPOCH FROM "open_time") * 1000)::BIGINT % 3600000 = 0
    WHEN '4h' THEN (EXTRACT(EPOCH FROM "open_time") * 1000)::BIGINT % 14400000 = 0
    WHEN '1d' THEN (EXTRACT(EPOCH FROM "open_time") * 1000)::BIGINT % 86400000 = 0
    ELSE FALSE
  END
);
