# Plan del Agente Frontend — V0.1

Actualizado: 2026-11-22. Fuentes:

- `docs/decisiones-gerente.md`;
- ADR-0004 (contrato v2);
- `docs/qa/data-testid.md`;
- el mensaje de inicio del Arquitecto;
- las tareas del Gerente (T1–T8);
- las respuestas de los agentes (G1–Q10, al final).

Si este plan choca con `decisiones-gerente.md`, manda `decisiones-gerente.md`.

## Reglas de trabajo para cada tarea

- **Rama y carpeta:** rama `<tipo>/<tarea>` desde `origin/main`, en la carpeta
  `C:\dev\ctl-frontend-<tarea>`. La carpeta se borra cuando su PR está fusionado (G4).
- **Flujo:**
  1. `/plan` y OK del Gerente.
  2. Código.
  3. `pnpm test` y `pnpm lint` en la raíz.
  4. Revisión en 360 px y en escritorio.
  5. `/code-review`.
  6. PR con la plantilla llena.
  7. CI en verde con `main` al día. El merge lo hace el Gerente.
- **Commits:** separados por tipo dentro del PR: limpieza, estructura, funcionalidad y docs.
- **Checklist:** las casillas de `docs/checklist-v0.md` se marcan en el mismo PR, solo con evidencia.
- **URLs y build:**
  - URLs relativas (`/api`, `/market`, `/ws/*`), nunca `localhost` en el código de la app.
  - Build estático en `apps/web/dist`, sin variables de servidor.
  - Ninguna ruta de pantalla empieza por `/api/`, `/market/` ni `/ws/` (A2).
- **`data-testid`:** siguen `docs/qa/data-testid.md`, la lista de QA y fuente única. Un nombre o un
  valor de `data-state` nuevo o cambiado se avisa a QA en el PR.

## Fase 0 — Preparación (hecha, 2026-11-20)

- `CONTRACT_VERSION = 2` en `origin/main` (`packages/shared/src/primitives.ts:4`).
- `pnpm install`, `pnpm test` (web: 7 archivos y 29 tests), `pnpm lint` y build en verde.
- Hallazgos sobre el trabajo heredado (`944d0a5` y `frontend-ux.md` v1.1):
  - Las URLs ya son relativas: `market-feed.ts` arma el WS con `window.location`, y el proxy de
    Vite sigue la tabla de ADR-0004.
  - `vite` 8.3.8 es la última versión publicada y `pnpm audit` no reporta `picomatch`.
  - `status.marketOpen` llega del servidor, pero la app no lo usa.
  - Las seis temporalidades se forman solo con precios en vivo: todavía no hay historial.
  - El bundle pesa 508 kB en un solo chunk.
  - El boceto aprobado (`terminal-v1.html`) no tiene pantalla de ingreso.
  - `frontend-ux.md` v1.1 dice que el despliegue es del Frontend; D-14 lo asigna al Arquitecto.

## Fase 1 — Sin depender de otro agente (contrato v2 con fetch simulado)

| #   | Tarea                                                   | Rama                            | Casilla del checklist                       | Depende de |
| --- | ------------------------------------------------------- | ------------------------------- | ------------------------------------------- | ---------- |
| F1  | D-15, archivos sin uso y `data-testid` de lo que existe | `chore/web-vite-testids`        | `vite` actualizado; `data-testid` acordados | —          |
| F2  | Cliente de API tipado                                   | `feat/web-api-client`           | —                                           | —          |
| F3  | Errores en español                                      | `feat/web-api-errors`           | Errores del servidor en español claro       | F2         |
| F4  | Ingreso por código                                      | `feat/web-login`                | Pantalla de ingreso por código (D-04)       | F2, F3     |
| F5  | WS de cuenta, saldo y equity                            | `feat/web-account-ws`           | Saldo y equity visibles                     | F4         |
| F6  | Ticket por monto                                        | `feat/web-order-ticket`         | Ticket por monto conectado a `POST /orders` | F3, F5     |
| F7  | Posiciones y botón Cerrar                               | `feat/web-positions`            | Posiciones con P&L vivo y botón Cerrar      | F5, F6     |
| F8  | Estado del símbolo e historial de velas                 | `feat/web-symbol-state-candles` | Estado del símbolo; historial (parcial)     | F2         |
| F9  | Bundle dividido y revisión final                        | `perf/web-bundle-split`         | Bundle dividido                             | F1–F8      |

Detalle por tarea:

- **F1:**
  - Cierra D-15 sin cambiar `vite` (G2).
  - Borra `use-market-feed.ts` y `use-api-health.ts`.
  - Pone los `data-testid` de lo que ya existe, con una sola copia por nombre en el DOM (regla 6).
    Para eso usa el hook `useMediaQuery` con el corte `lg`.
- **F2:**
  - `fetch` con prefijo `/api` o `/market` y `credentials: 'same-origin'`.
  - Respuestas validadas con los esquemas Zod v2.
  - Un código fuera de `API_ERROR_CODES` no rompe el cliente y muestra un mensaje genérico. Hasta su
    tarea 3, el Backend manda `invalid_request` (B1).
- **F3:**
  - Tabla `API_ERROR_CODES` → `i18n`, con un test que exige texto para cada código.
  - `rate_limited` muestra la espera de `Retry-After` (de 1 s a 86.400 s) en segundos, minutos u
    horas (B3).
- **F4:**
  - Boceto primero. La pantalla vive en `/ingreso` (A2).
  - Sesión solo por la cookie `coin_session` (D-04).
  - Un 401 en `POST /auth/login` significa "código inválido". Un 401 en cualquier otra ruta es
    sesión vencida y lleva a `/ingreso` (B4).
  - `POST /auth/logout` (204) cierra el WS de cuenta del cliente.
- **F5:**
  - WS de cuenta con reconexión: `account.snapshot`, `account.update`, `order.*` y `position.*`.
  - Un cierre 4401, o un `error` con `unauthorized`, lleva a `/ingreso`. Puede pasar a mitad de
    conexión, cuando llega `expiresAt`.
  - Un WS que no abre (403 por `Origin`) es un problema de conexión, no de sesión (B2, B4).
  - La barra superior deja de mostrar el saldo inicial fijo y muestra el saldo, la equity y el P&L
    realizado del servidor.
- **F6:**
  - `amountUsd` y `clientOrderId` con `crypto.randomUUID()`; un reintento usa el mismo.
  - Confirmación y resultado.
  - Mínimo de la orden (Q9): el cliente bloquea según el costo estimado, comparado con
    `MIN_ORDER_USD` de `@coin/shared`. El costo estimado es la cantidad redondeada hacia abajo a
    `quantityPrecision`, por el `ask`, con el centavo redondeado hacia arriba (D-01).
  - Nunca bloquea la venta que cierra toda la posición: el motor la permite siempre.
  - El `below_minimum` del servidor se sigue mostrando.
  - Confirmar queda deshabilitado mientras la orden viaja, y no hay reintentos automáticos: cada uno
    gasta cupo (30 por minuto y 1.000 por día; B3).
  - Los valores nuevos de `ticket-status` se avisan a QA.
- **F7:**
  - P&L vivo, recalculado con el `bid` entre ejecuciones, solo para mostrar (ADR-0004).
  - Botón Cerrar con confirmación (`closePositionPath`); el mínimo nunca lo bloquea.
- **F8:**
  - `data-state` del símbolo con `marketOpen` y `stale` (M2, M3):
    - `stale: false` y `marketOpen: true`: en vivo.
    - Sin ningún tick: sin precio.
    - Tick viejo con `stale: true`: obsoleto.
    - `stale: false` y `marketOpen: false`: no disponible.
  - Sin conexión, el símbolo no se queda en `live` (Q10).
  - Historial desde `/market/candles`. Si no responde, la gráfica se forma en vivo (M1).
  - Las seis temporalidades siguen habilitadas (G3 revisada); hay que verificar el cambio entre
    todas.
- **F9:** ningún chunk mayor a 500 kB, revisión final de los `data-testid` y 360 px sin scroll
  horizontal.

Sin dependencias nuevas en la Fase 1. F8 puede ir en paralelo a F4–F7.

## Fase 2 — Con la API y las velas reales

- Conectar F4–F7 a la API real en el orden del Backend: login con cookie, orden por monto, cierre
  de posición y, al final, eventos del WS de cuenta. El Backend avisa con el commit de cada pieza
  (B1).
- Verificar el historial y las temporalidades 1m, 5m y 1h cuando Datos entregue su tarea 4
  (historial de Binance). Su tarea 2 guarda las velas solo en memoria (M1).
- Ranking: es la última tarea de V0.1 y no usa datos de mentira (G1).
  - Espera el contrato `packages/shared/src/leaderboard.ts` del Arquitecto y el endpoint del
    Backend (A1).
  - La fila del usuario lleva `data-me="true"`, y `ranking-me` es una fila aparte (Q7).
- Apoyar a QA con el E2E:
  - 360×740 táctil y 1280×800, con Chromium; WebKit en la fase 2, por la cookie (Q2).
  - Contra `vite preview` (puerto 4173), `API_ALLOWED_ORIGINS` debe incluir ese origen (B2).

## Fase 3 — Cierre de sesión

- `docs/agents/frontend-ux.md` v1.2 según `docs/agents/PROTOCOLO/frontend-ux.md`, alineado con
  D-14. Commit `docs(agents): frontend-ux v1.2`.

## Decisiones y respuestas (2026-11-21 y 2026-11-22)

| ID     | De         | Respuesta                                                                                                          | Aplica en  |
| ------ | ---------- | ------------------------------------------------------------------------------------------------------------------ | ---------- |
| G1     | Gerente    | El ranking es la última tarea de V0.1, sin datos de mentira                                                        | Fase 2     |
| G2     | Gerente    | D-15 se cierra sin cambiar `vite`, con la salida de `pnpm audit` en el PR                                          | F1         |
| G3     | Gerente    | Revisada: 15m, 4h y 1d se quedan habilitadas                                                                       | F8         |
| G4     | Gerente    | Carpeta `ctl-frontend-<tarea>`, que se borra tras la fusión                                                        | Todas      |
| A1     | Arquitecto | El contrato del ranking va en `leaderboard.ts`, sin subir `CONTRACT_VERSION`                                       | Fase 2     |
| A2     | Arquitecto | Caddy y Vite devuelven `index.html` fuera de `/api`, `/market` y `/ws`; el ingreso usa `/ingreso`                  | F4         |
| A3     | Arquitecto | Quedan para un contrato 2.1: velas del símbolo que se mira (`candleSymbols`), cambio del día y ranking             | —          |
| M1     | Datos      | `GET /candles` es su próxima tarea; el historial real llega con su tarea 4                                         | F8, Fase 2 |
| M2     | Datos      | Siempre llega un `status` por símbolo; "sin precio" se distingue en el cliente; el último tick no se reenvía       | F8         |
| M3     | Datos      | "No disponible" llega en V0.1 desde `instruments.tradable`, leído cada 30 s                                        | F8         |
| B1     | Backend    | Sin fechas. Orden: login, monto, cierre y WS de cuenta. Hasta su tarea 3, `invalid_request` y `no_price`           | F2–F7      |
| B2     | Backend    | `API_ALLOWED_ORIGINS`; un `Origin` no permitido da 403 al abrir el WS, sin 4401                                    | F5         |
| B3     | Backend    | Todo 429 trae `Retry-After` en segundos. Login: 100 fallidos cada 15 min por IP. Órdenes: 30/min y 1.000/día       | F3, F6     |
| B4     | Backend    | Sesión vencida: 401 (salvo en el login) y cierre 4401                                                              | F4, F5     |
| Q1–Q10 | QA         | Lista de `data-testid`, reglas, tamaños de pantalla, mínimo de la orden y caída del feed: `docs/qa/data-testid.md` | Todas      |
