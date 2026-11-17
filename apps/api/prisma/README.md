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
solo inserción. No uses `prisma migrate dev`: las vería como diferencias y propondría borrarlas.

El script de seed vive en `src/db/seed.ts` para que el compilador lo revise.
