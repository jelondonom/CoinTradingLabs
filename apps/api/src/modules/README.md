# modules/

Responsable: **Agente Backend Motor de Trading**.

Módulos de la API: `auth`, `accounts`, `orders`, `positions` y `leaderboard`. Cada módulo valida
la entrada con los esquemas Zod de `@coin/shared`, llama al motor (`engine/`) y persiste el
resultado dentro de una transacción.
