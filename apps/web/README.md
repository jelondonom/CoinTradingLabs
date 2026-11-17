# @coin/web

Aplicación React de COIN Trading Labs. Responsable: **Agente Frontend + Gráficas + UX**.

Todo lo que hay bajo `apps/web/` y `docs/web/` pertenece a este agente. Si otro agente necesita un
cambio aquí, lo pide; no lo edita directamente.

## Carpetas

| Carpeta                      | Contenido                                                  |
| ---------------------------- | ---------------------------------------------------------- |
| `src/features/chart/`        | Gráfica, temporalidades, indicadores y dibujos.            |
| `src/features/symbols/`      | Lista de símbolos con búsqueda y filtros.                  |
| `src/features/order-ticket/` | Ticket de orden simple y avanzado.                         |
| `src/features/positions/`    | Posiciones, órdenes e historial.                           |
| `src/features/leaderboard/`  | Ranking en vivo.                                           |
| `src/features/onboarding/`   | Recorrido guiado y glosario.                               |
| `src/features/auth/`         | Ingreso.                                                   |
| `src/components/`            | Componentes de interfaz reutilizables.                     |
| `src/lib/indicators/`        | Cálculo de indicadores: funciones puras con tests.         |
| `src/lib/ws/`                | Clientes WebSocket de mercado y de cuenta, con reconexión. |
| `src/stores/`                | Estado global.                                             |
| `src/i18n/`                  | Textos de la interfaz; español primero.                    |
| `docs/web/bocetos/` (raíz)   | Bocetos de pantallas que esperan o tienen aprobación.      |

## Comandos

- `pnpm --filter @coin/web dev`: arranca la app en local.
- `pnpm --filter @coin/web test`: ejecuta los tests.
- `pnpm --filter @coin/web build`: compila para producción.
- `pnpm --filter @coin/web preview`: sirve el build para revisión.

## Reglas propias

- Se diseña primero para 360 px de ancho y luego se escala.
- El cliente muestra saldo, P&L y ranking tal como los envía el servidor; no los calcula.
- Una orden market nunca envía precio.
- La atribución a TradingView de Lightweight Charts no se quita.
