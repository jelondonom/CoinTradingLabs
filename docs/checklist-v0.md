# Checklist V0.1 — COIN Trading Labs

V0.1 = cerrar la v0: flujo completo, usable desde el celular, con precios de Binance o simulados.
Un ítem solo se marca `[x]` con evidencia: commit, PR, comando o reporte.
Las decisiones que aplican están en `docs/decisiones-gerente.md` (D-xx).

## Definición global de V0.1 terminada

- [ ] `pnpm install && pnpm dev` levanta todo en local sin pasos manuales.
- [ ] CI en verde sobre `main`, con los tests de integración corriendo (no `skipped`).
- [ ] Flujo completo: entrar con código → ver gráfica con historial y precio en vivo → comprar por monto → ver posición con P&L vivo → cerrar → saldo y P&L realizado actualizados → aparecer en el ranking.
- [ ] El flujo funciona en celular (360 px) y en escritorio.
- [ ] Cero defectos Críticos o Altos abiertos.
- [ ] Staging con HTTPS (bloqueado por D-06 hasta elegir hosting).
- [ ] Reporte Go/No-Go de QA y demo aprobada por el Gerente.

## Supuestos V0.1

Saldo 100.000 USD · 1:1 · solo largos · solo órdenes market · monto mínimo 10 USD · 31 símbolos
24/7 · login por código con cookie `httpOnly`.

## Fuera de alcance V0.1

Órdenes limit/stop, SL/TP, margen y stop-out, ventas en corto, indicadores, herramientas de
dibujo, calendario de bolsa, onboarding guiado, idioma inglés, producción.

---

## Agente Arquitecto + DevOps

- [x] Monorepo pnpm: `apps/api`, `apps/market-data`, `apps/web`, `packages/shared` — `5ba729f`.
- [x] Docker Compose con PostgreSQL 17 y Redis — `infra/docker-compose.yml`.
- [x] CI: lint, test y build en cada PR.
- [x] Contratos v1 con 31 símbolos y mensaje `status` — `48faaae`.
- [x] `.env.example` completo y variables validadas con Zod.
- [x] `/health` en `api` y `market-data`.
- [x] ADRs 0001–0003 y README de arranque.
- [x] Contrato v2 (D-03, D-04, D-09, D-11) con ADR y `CONTRACT_VERSION = 2` — `docs/adr/0004-contrato-v2.md`, 33 tests en `contracts.test.ts`.
- [ ] Postgres y Redis en el CI: los `*.integration.test.ts` corren.
- [x] `.gitignore` incluye `.claude/` — `8578dbc`.
- [ ] Caddy con HTTPS y un solo origen (`/api`, `/ws/*`, velas).
- [ ] Scripts de despliegue, rollback, respaldo y restauración, listos para un VPS con Docker.
- [ ] Opciones de hosting entregadas al Gerente (D-06).
- [ ] Staging desplegado (después de D-06).
- [ ] `docs/runbook.md` en borrador.

## Agente Datos de Mercado y Tiempo Real

- [x] Proveedor elegido: Binance, 0 USD (D-08).
- [x] Catálogo de 31 símbolos con mapa a formato interno.
- [x] Feed simulado con semilla y feed real de Binance tras `FeedAdapter`.
- [x] Redis: `last:{symbol}` y `ticks:{symbol}`.
- [x] WebSocket público con suscripción por símbolo y límite de 4/s.
- [x] Mensaje `status` con precio obsoleto y reconexión con backoff.
- [ ] `staleAfterMs` leído desde `packages/shared` (D-11).
- [ ] `marketOpen` en `status` según D-05.
- [ ] Velas de 1m persistidas en la tabla del Backend (D-18).
- [ ] Velas derivadas: 5m, 15m, 1h, 4h y 1d.
- [ ] Historial desde Binance al arrancar y tras reconectar, sin huecos.
- [ ] REST de velas según el contrato v2.
- [ ] Feed de repetición (`adapters/replay.ts`) con mensajes grabados.
- [ ] Prueba de reconexión cortando la red.

## Agente Backend Motor de Trading

- [x] Esquema Prisma, migración inicial y seed (31 instrumentos y 3 cuentas demo) — `d8cfa0a`.
- [x] `docs/engine-rules.md`.
- [x] Motor puro market con `decimal.js`; cobertura 100 %.
- [x] `POST /orders` idempotente por `clientOrderId`; ejecución al `ask`/`bid`.
- [x] `ledger_entries` append-only; su suma coincide con el saldo.
- [x] `GET /account`.
- [x] DEF-002: tick con fecha futura rechazado (D-11) — PR #10 (`0fc8d0f`); QA cierra el defecto.
- [x] DEF-001: redondeo en contra del participante y mínimo de 10 USD (D-01) — tests DEF-001 de `engine-defects.test.ts` y `market-order.test.ts` en verde con `pnpm test`; QA cierra el defecto.
- [x] Límite de peticiones en login y órdenes (D-13) — tests de `rate-limiter.test.ts`, `counter-store.integration.test.ts` y `trading.integration.test.ts` (límites D-13) en verde; QA valida los números.
- [ ] Tabla de velas (D-18).
- [ ] Login con cookie `httpOnly` y WS de cuenta autenticado (D-04).
- [ ] Orden por monto (D-09) y `POST /positions/:id/close`.
- [ ] `GET` de posiciones, órdenes e historial.
- [ ] Eventos del WS de cuenta: orden, posición y saldo.
- [ ] Umbral obsoleto por símbolo desde `shared`; `stale_price` hacia afuera.
- [ ] Errores con el formato `apiError` del contrato v2.
- [ ] Ranking por retorno con caché y desempate D-12.
- [ ] Script de cuentas desde CSV (D-20).

## Agente Frontend + Gráficas + UX

- [x] Bocetos móvil y escritorio aprobados — `docs/web/bocetos/terminal-v1.html`.
- [x] Lista de símbolos con precio en vivo y estado obsoleto.
- [x] Gráfica con Lightweight Charts v5 y `series.update()`.
- [x] 360 px y escritorio sin scroll horizontal (lo construido).
- [x] Atribución a TradingView visible.
- [x] Textos en `i18n`.
- [ ] `vite` actualizado (D-15) y archivos sin uso borrados.
- [ ] `data-testid` acordados con QA.
- [ ] Pantalla de ingreso por código (D-04).
- [ ] Historial de velas y temporalidades 1m, 5m y 1h verificadas.
- [ ] Estado del símbolo: en vivo, sin precio o no disponible (D-05).
- [ ] Ticket por monto conectado a `POST /orders`, con confirmación y mínimo de 10 USD.
- [ ] Posiciones con P&L vivo y botón Cerrar.
- [ ] Saldo y equity visibles.
- [ ] Ranking simple con la posición del usuario resaltada.
- [ ] Errores del servidor en español claro.
- [ ] Bundle dividido: ningún chunk mayor a 500 kB.

## Agente QA + Seguridad

- [x] Plan de pruebas por riesgo — `docs/qa/plan.md`.
- [x] Borrador del reglamento anti-trampa.
- [x] 16 tests de propiedades sobre invariantes contables.
- [x] Lista de defectos con severidad — `docs/qa/defectos.md`.
- [x] Reglamento actualizado con D-05, D-08, D-12, D-13 y D-19 — `docs/qa/reglamento-anti-trampa.md` v0.2.
- [ ] `tests/security/`: cuenta ajena, sesión vencida o alterada y payloads manipulados.
- [ ] Idempotencia y concurrencia probadas con Postgres.
- [ ] DEF-001 y DEF-002 vueltos a probar y cerrados.
- [ ] E2E con Playwright del flujo completo, en móvil y escritorio.
- [ ] k6 de 500 conexiones WebSocket: primero en local, luego en staging.
- [ ] k6 de ráfagas contra `POST /orders`.
- [ ] `pnpm audit` sin vulnerabilidades altas.
- [ ] Reporte Go/No-Go de V0.1 — `docs/qa/go-no-go-v0.1.md`.
