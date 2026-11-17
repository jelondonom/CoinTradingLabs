# prisma/

Responsable: **Agente Backend Motor de Trading**.

Esquema, migraciones y seed de la base de datos de la API.

- `ledger_entries` y `audit_log` son solo de inserción: nunca `UPDATE` ni `DELETE`.
- Dinero, precios y cantidades son `NUMERIC`, nunca `float`.
- Tablas y columnas en snake_case; el código usa camelCase mediante `@map`.
