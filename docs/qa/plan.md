# Plan de pruebas de COIN Trading Labs

- Responsable: Agente QA + Seguridad. Reporta al Gerente General.
- Versión: 1, del 2026-11-16. Escrito sobre la rama `feat/api-engine-v0` (commit `9dc48f8`).
  Actualizado el 2026-11-18 con el cierre de DEF-001 y DEF-002.
- Documentos hermanos: [`defectos.md`](defectos.md) y
  [`reglamento-anti-trampa.md`](reglamento-anti-trampa.md).

## 1. Objetivo

Garantizar tres cosas antes del congreso: que la plataforma aguante la carga, que los números
sean correctos y que el ranking sea justo. El evento dura dos días y no hay segunda oportunidad.

## 2. Estado de lo que se puede probar hoy

| Módulo                         | Estado                                                    | ¿Se puede probar? |
| ------------------------------ | --------------------------------------------------------- | ----------------- |
| Motor puro (`engine/`)         | Implementado en `feat/api-engine-v0`, sin integrar        | Sí                |
| API REST (login, órdenes)      | Implementada en la misma rama                             | Sí, con Postgres  |
| WebSocket de cuenta            | Solo responde `ping`                                      | No                |
| WebSocket de mercado           | Implementado, con feed simulado y de Binance              | Sí, en local      |
| Escritura del último tick      | Sin definir entre Datos de Mercado y Backend (`last:{…}`) | No                |
| Ranking                        | Solo existe la tabla `leaderboard_snapshots`              | No                |
| Web                            | Terminal con gráficas, sin órdenes                        | Parcial           |
| Staging, respaldos, despliegue | No existen                                                | No                |

## 3. Riesgos, de mayor a menor

Prioridad = impacto × probabilidad. P0 bloquea el Go; P1 se cierra antes del simulacro; P2 antes
del congreso.

| N.º | Riesgo                                                      | Prioridad | Cómo se prueba                        | Estado                          |
| --- | ----------------------------------------------------------- | --------- | ------------------------------------- | ------------------------------- |
| R1  | Dinero creado o perdido por redondeo                        | P0        | Propiedades sobre el motor            | DEF-001 cerrado (D-01)          |
| R2  | El saldo no coincide con el libro contable                  | P0        | Propiedades; SQL sobre Postgres       | Motor en verde; base pendiente  |
| R3  | El ranking mostrado no coincide con el reconstruido         | P0        | `pnpm audit:leaderboard`              | Sin ranking todavía             |
| R4  | Órdenes ejecutadas a un precio obsoleto o que nadie publicó | P0        | Propiedades; resiliencia del feed     | DEF-002 cerrado; feed pendiente |
| R5  | Una cuenta lee o modifica datos de otra                     | P0        | `tests/security/`                     | Pendiente                       |
| R6  | Órdenes duplicadas por reintentos o concurrencia            | P0        | Integración con Postgres; ráfagas k6  | Pendiente                       |
| R7  | Caída o degradación con 500 usuarios                        | P0        | k6: WebSocket y ráfagas de órdenes    | WS local pasa; falta staging    |
| R8  | Multicuentas y cuentas coordinadas                          | P0        | Señales en `tests/audit/`; reglamento | Reglamento en borrador          |
| R9  | Sin límite de peticiones en login ni en órdenes             | P1        | `tests/security/`; k6                 | Por verificar                   |
| R10 | Caída del feed: la pantalla y el motor se contradicen       | P1        | Resiliencia con feed simulado         | Pendiente                       |
| R11 | Pérdida de datos al reiniciar la API o restaurar la base    | P1        | Simulacro de restauración             | Sin respaldos todavía           |
| R12 | Sesión robada o compartida: token de 7 días sin revocación  | P1        | `tests/security/`                     | Por verificar                   |
| R13 | Explotar el gap al abrir la ventana de la competencia       | P1        | Propiedades con reloj controlado      | Parcial (R2 de las propiedades) |
| R14 | Flujo completo roto en móvil                                | P1        | Playwright con emulación de móvil     | Sin flujo de órdenes en la web  |
| R15 | Dependencias vulnerables                                    | P2        | `pnpm audit`                          | 0 altas; 1 moderada, solo dev   |
| R16 | Cabeceras, CORS y TLS mal configurados                      | P2        | OWASP ZAP contra staging              | Sin staging                     |

### Riesgos vistos al leer el código, todavía sin probar

Son hipótesis. Ninguna es un defecto hasta que un test la confirme.

- `clientOrderId` era opcional: un reintento sin él duplicaba la orden. El contrato v2, ya en
  `main`, lo vuelve obligatorio; QA lo prueba contra la API en T3.
- No hay límite de peticiones en `POST /auth/login` ni en `POST /orders`.
- El WebSocket de mercado es público y no limita conexiones ni suscripciones por cliente.
- La API responde `no_price` cuando el motivo real es `stale_price` (temporal, aprobado; el
  Backend lo retira en su tarea T7). `below_minimum` ya sale tal cual desde `11bb4c5`.
- `GET /account` valora con el último tick aunque sea obsoleto, sin avisarlo en la respuesta.
- Con D-09 (orden por monto), un monto que no alcanza una unidad deja una orden rechazada con
  `quantity = 0`, como permite el contrato v2. Pero la columna tiene `CHECK quantity > 0`: guardarla
  daría el mismo 500 que DEF-003. Hoy no ocurre porque la API todavía no acepta órdenes por monto.

Descartado al revisar el código: dos posiciones abiertas del mismo símbolo en una cuenta. Las
impide el índice único parcial `positions_open_account_symbol_key` sobre (`account_id`, `symbol`)
con `closed_at IS NULL` (`apps/api/prisma/migrations/20261116000000_init/migration.sql`), además
del bloqueo de la fila.

## 4. Pruebas por módulo

### 4.1 Motor de trading (Agente Backend)

- **Propiedades** (`tests/properties/`, hechas): 16 propiedades con `fast-check` sobre el motor
  real, con semilla fija, y 6 casos de regresión de DEF-001 y DEF-002. El monto mínimo, los
  umbrales de precio obsoleto por símbolo, la tolerancia de tick futuro y los motivos de rechazo
  vienen de `@coin/shared`, sin copias. Cubren las invariantes 1 a 5 de `docs/engine-rules.md`,
  precio de ejecución, redondeo en contra del participante y mínimo de 10 USD (D-01), ticks del
  futuro (D-11), orden de los rechazos y valoración.
- **Idempotencia y concurrencia** (pendiente): la invariante 6 vive en `place-order.ts` y
  necesita Postgres. Mismo `clientOrderId` repetido, en paralelo y desde dos procesos.
- **Reconciliación en base** (pendiente): consultas SQL en `tests/audit/` que comparan
  `ledger_entries` con `accounts.balance`, y `fills` con `positions`.

### 4.2 API y seguridad (Agente Backend)

- Autorización: un token nunca accede a otra cuenta; token vencido, alterado o firmado con otro
  secreto se rechaza.
- Entradas (hechas para el contrato v2, `tests/security/`): propiedades con fast-check sobre los
  esquemas de login, orden, cierre y consulta de velas. Cubren números manipulados (negativos,
  cero, `NaN`, infinitos, texto), campos que fija el servidor (precio, cuenta, estado), símbolos
  falsos, UUID inválidos, contaminación de prototipos y límites de la consulta de velas. La API
  real rechaza con 400, sin tocar la base, lo que el contrato rechaza en `POST /orders`. Hallazgos:
  DEF-003 y DEF-004. `POST /positions/:id/close` y `GET /candles` todavía no existen: se probaron
  solo contra el esquema.
- Observación sin riesgo: la consulta de velas convierte `limit=0x10` en 16, `1e3` en 1000 y
  `" 7 "` en 7, siempre dentro de 1–1000. Hoy `limit=` vacío se rechaza, aunque `from=` y `to=`
  vacíos cuentan como no enviados. El Arquitecto decidió (2026-11-21) que también cuente como no
  enviado y use 500; lo cambia en `packages/shared/src/candle.ts`. QA agrega ese caso cuando entre
  su PR: un `it.fails` antes pondría en rojo el CI del PR del Arquitecto.
- Abuso: fuerza bruta de códigos de inscripción, ráfagas de órdenes, rutas de administración.
- Escaneo base con OWASP ZAP y `pnpm audit`, solo contra staging.

### 4.3 Datos de mercado (Agente Datos de Mercado)

- Carga: `tests/load/ws-market-500.js`, 500 conexiones durante 2 horas.
- Resiliencia: caída y regreso del proveedor; el estado `stale` llega a los clientes y el motor
  deja de ejecutar en el mismo umbral.
- Contrato: todo mensaje cumple `marketServerMessageSchema`.

### 4.4 Web (Agente Frontend)

- Playwright en escritorio y móvil: ingreso, compra, venta, reconexión y precio obsoleto.
- Los números en pantalla coinciden con `GET /account`.

### 4.5 Ranking

- `pnpm audit:leaderboard` reconstruye el ranking desde el libro contable y compara.
- Se corre antes de cada premiación. Cualquier diferencia bloquea la premiación.

### 4.6 Operación (Agente Arquitecto)

- Restauración de un respaldo en un servidor limpio, con reconciliación posterior.
- Reinicio de la API en plena operación: no se pierden ni se duplican órdenes.

## 5. Criterios Go/No-Go

| Criterio                                                 | Estado            |
| -------------------------------------------------------- | ----------------- |
| 500 usuarios simulados 2 horas sin errores               | Local 15 min: sí  |
| Confirmación de orden en menos de 200 ms (p95) con carga | Sin probar        |
| Cero defectos Críticos o Altos abiertos                  | Sí, al 2026-11-18 |
| Restauración de respaldo verificada                      | Sin probar        |
| Recuperación tras caída del feed verificada              | Sin probar        |
| Auditoría del ranking sin diferencias                    | Sin probar        |
| Simulacro con usuarios reales y hallazgos cerrados       | Sin fecha         |

## 6. Lo que QA necesita de cada agente

| De               | Qué                                                                                                         | Para         |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | ------------ |
| Backend          | Responder `stale_price` tal cual, sin pasarlo a `no_price` (su tarea T7)                                    | R4           |
| Backend          | Ruta del ranking (el límite de peticiones ya está en `main`, PR #17)                                        | R3           |
| Backend          | Corregir DEF-004: el login debe usar `loginRequestSchema` de `@coin/shared` (D-04)                          | R12          |
| Backend          | Con D-09, guardar una orden por monto rechazada con `quantity = 0` sin violar el CHECK                      | R1           |
| Datos de Mercado | Escritura de `last:{symbol}` en Redis y umbral de obsolescencia en una sola fuente                          | R4, R10      |
| Arquitecto       | `limit=` vacío en `GET /candles` cuenta como no enviado y usa 500 (decidido; PR del Arquitecto en curso)    | —            |
| Arquitecto       | Entorno de staging con datos sintéticos, k6 disponible y respaldos (depende de D-06)                        | R7, R11, R16 |
| Arquitecto       | Actualizar `typescript-eslint` a 8.73.0 (cierra la alerta moderada de `minimatch`)                          | R15          |
| Arquitecto       | Ya no quedan altas: agregar `pnpm audit --audit-level high` al CI                                           | R15          |
| Frontend         | Flujo de órdenes en la web y los `data-testid` de `docs/qa/data-testid.md` (confirmar la lista y aplicarla) | R14          |

Resueltos: Postgres y Redis en el CI, que además falla si un test queda omitido (PR #14); límite
de peticiones en login y órdenes (PR #17); división del ítem de `tests/security/` del checklist
(respuesta del Arquitecto del 2026-11-21, aplicada por QA); DEF-003 corregido por el Backend en el
PR #21 y cerrado por QA; umbral de precio obsoleto por símbolo (`staleAfterMs(symbol)`) y
`MAX_TICK_FUTURE_MS` del contrato en la API y el motor (PR #23); alerta alta de `effect`, cerrada
con el override del PR #30. Falta una prueba de la API que
confirme el umbral por símbolo: las propiedades no lo ven, porque el arnés ya le da al motor el
umbral de cada símbolo.

## 7. Decisiones del Gerente

Las ya tomadas están en `docs/decisiones-gerente.md` (por ejemplo D-01 para el redondeo y D-19
para la aprobación del ranking). Siguen abiertas:

1. Sanciones y proceso de descargos del reglamento.
2. Cómo se verifica una persona por cuenta.
3. Fecha y participantes del simulacro general, al menos dos semanas antes del congreso.
4. Agregar a D-01 la excepción de cierre total por menos de 10 USD, que hoy solo consta en
   `docs/engine-rules.md`.

## 8. Reglas de trabajo de QA

- Los tests son deterministas: feed simulado, reloj controlado y semilla fija.
- Carga y escaneos corren solo en staging. Nunca en producción ni contra terceros.
- No se usan datos personales reales de asistentes.
- QA no modifica código de producto. Demuestra cada defecto con un test que falla.
