# prisma/

Responsable: **Agente Backend Motor de Trading**.

Esquema, migraciones y seed de la base de datos de la API.

- `ledger_entries` y `audit_log` son solo de inserción: nunca `UPDATE` ni `DELETE`.
- Dinero, precios y cantidades son `NUMERIC`, nunca `float`.
- Tablas y columnas en snake_case; el código usa camelCase mediante `@map`.

## Comandos

- `pnpm --filter @coin/api db:migrate`: aplica las migraciones pendientes.
- `pnpm --filter @coin/api db:seed`: carga los 31 instrumentos. Fuera de producción crea además
  una competencia y tres cuentas de prueba (sus códigos están en `src/db/seed.ts`).
- `pnpm --filter @coin/api db:generate`: genera el cliente de Prisma (también corre al instalar).

## Migraciones

El SQL de cada migración se genera con `prisma migrate diff` y se revisa a mano. La migración
inicial termina con reglas que Prisma no expresa en `schema.prisma`: el índice único de una
posición abierta por cuenta y símbolo, las restricciones de no negatividad y los triggers de
solo inserción. La de `candles` termina con sus cuatro reglas CHECK. No uses `prisma migrate
dev`: las vería como diferencias y propondría borrarlas.

El script de seed vive en `src/db/seed.ts` para que el compilador lo revise. Los tests de
integración recrean una base propia por archivo con `src/testing/test-database.ts`.

## Tabla `candles` (D-18)

La estructura es del Backend. La escribe y la lee Datos de Mercado (`apps/market-data`) con
`pg` y SQL directo, en la misma base que la API. Diseño y reglas de uso acordados con Datos el
2026-11-21. El SQL de esta sección está probado en `src/db/candles.integration.test.ts`.

| Columna                        | Tipo                                                   | Qué guarda                                                     |
| ------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------- |
| `symbol`                       | `TEXT`, llave foránea a `instruments(symbol)`          | Símbolo del catálogo en formato interno (`BTCUSD`)             |
| `interval`                     | `candle_interval`: `1m`, `5m`, `15m`, `1h`, `4h`, `1d` | Los mismos valores y orden que `CANDLE_INTERVALS`              |
| `open_time`                    | `TIMESTAMPTZ(3)`                                       | Inicio de la vela, en UTC                                      |
| `open`, `high`, `low`, `close` | `NUMERIC(20,8)`                                        | Precios                                                        |
| `volume`                       | `NUMERIC(28,8)`                                        | Volumen en el activo base, siempre explícito (0 si no se sabe) |

Llave primaria: `(symbol, interval, open_time)`. Reglas CHECK (copian `candleSchema` de
`@coin/shared`):

- `candles_low_positive`: `low > 0`. Con la regla siguiente, los cuatro precios son positivos.
- `candles_range_contains_open_close`: `high >= GREATEST(open, close)` y
  `low <= LEAST(open, close)`.
- `candles_volume_non_negative`: `volume >= 0`.
- `candles_open_time_aligned`: `open_time` es múltiplo del intervalo contado desde la época UTC,
  como los klines de Binance. La vela de 1d empieza a las 00:00 UTC (19:00 en Colombia) y la de
  4h a las 00, 04, 08… UTC.

### Reglas de uso

1. Desde `market-data` solo `INSERT … ON CONFLICT … DO UPDATE` y `SELECT` sobre `candles`. Nunca
   DDL, `DELETE` ni `TRUNCATE`, ni otras tablas. Un cambio de estructura lo hace el Backend con
   una migración, avisada antes.
2. El `DO UPDATE` actualiza solo `open`, `high`, `low`, `close` y `volume`.
3. Se escribe por lotes. Una misma vela no puede repetirse dentro de un lote: Postgres no deja
   que un `INSERT … ON CONFLICT` actualice dos veces la misma fila.
4. Pool de máximo 5 conexiones: la base se comparte con la API.
5. Una vela que viola una regla es un bug: se registra el error con la vela.
6. Solo se guardan velas terminadas. La vela en curso vive en la memoria de `market-data`.

Única excepción a la regla 1, para cumplir D-05: `market-data` lee
`SELECT symbol, tradable FROM instruments` cada 30 s, sin escribir. Si la lectura falla, conserva
la última lista y registra el error. Por eso `instruments.symbol` y `instruments.tradable` son
parte del contrato: renombrarlas se coordina antes.

### Upsert por lotes

```sql
INSERT INTO candles (symbol, interval, open_time, open, high, low, close, volume)
SELECT * FROM unnest(
  $1::text[], $2::candle_interval[], $3::timestamptz[],
  $4::numeric[], $5::numeric[], $6::numeric[], $7::numeric[], $8::numeric[]
)
ON CONFLICT (symbol, interval, open_time) DO UPDATE SET
  open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
  close = EXCLUDED.close, volume = EXCLUDED.volume
```

Los parámetros son un arreglo por columna, en ese orden; `open_time` va como `Date`. El mismo
SQL sobrescribe las velas de un hueco cuando llega el historial tras una reconexión. Al leer,
`pg` devuelve `NUMERIC` como texto y `TIMESTAMPTZ` como `Date`.

La llave primaria cubre la consulta de `GET /candles`
(`WHERE symbol = … AND interval = … AND open_time BETWEEN … ORDER BY open_time DESC LIMIT n`):
no hace falta otro índice. La consulta en sí es lógica del endpoint de Datos.

### Tests de base de `market-data`

Aplica las migraciones de `apps/api/prisma/migrations` en orden y carga al menos un instrumento,
porque la llave foránea lo exige:

```sql
INSERT INTO instruments (symbol, name, asset_class, price_precision, quantity_precision, min_quantity)
VALUES ('BTCUSD', 'Bitcoin', 'crypto', 2, 5, 0.00001)
ON CONFLICT (symbol) DO NOTHING
```

### Despliegue

`db:migrate` y `db:seed` (en producción, `node dist/db/seed.js`) corren antes de que
`market-data` empiece a escribir.
