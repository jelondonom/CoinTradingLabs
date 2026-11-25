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

| N.º | Riesgo                                                                               | Prioridad | Cómo se prueba                        | Estado                                                                                         |
| --- | ------------------------------------------------------------------------------------ | --------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| R1  | Dinero creado o perdido por redondeo                                                 | P0        | Propiedades sobre el motor            | DEF-001 cerrado (D-01)                                                                         |
| R2  | El saldo no coincide con el libro contable                                           | P0        | Propiedades; SQL sobre Postgres       | Motor en verde; base pendiente                                                                 |
| R3  | El ranking mostrado no coincide con el reconstruido                                  | P0        | `pnpm audit:leaderboard`              | Sin ranking todavía                                                                            |
| R4  | Órdenes ejecutadas a un precio obsoleto o que nadie publicó                          | P0        | Propiedades; resiliencia del feed     | DEF-002 cerrado; feed pendiente                                                                |
| R5  | Una cuenta lee o modifica datos de otra                                              | P0        | `tests/security/`                     | Pendiente                                                                                      |
| R6  | Órdenes duplicadas por reintentos o concurrencia                                     | P0        | Integración con Postgres; ráfagas k6  | Pendiente                                                                                      |
| R7  | Caída o degradación con 500 usuarios                                                 | P0        | k6: WebSocket y ráfagas de órdenes    | WS local pasa; falta staging                                                                   |
| R8  | Multicuentas y cuentas coordinadas                                                   | P0        | Señales en `tests/audit/`; reglamento | Reglamento en borrador                                                                         |
| R17 | Bloqueo masivo del login por IP compartida (wifi del evento o proxy mal configurado) | P0        | `tests/security/`; ráfaga en staging  | Decidido (Gerente, 2026-11-24 y 2026-11-25); tests con `it.fails` hasta la tarea 4 del Backend |
| R9  | Límite de peticiones en login y órdenes que no frena el abuso                        | P1        | `tests/security/`; k6                 | Límite en `main` (PR #17); números de D-13 validados (Gerente, 2026-11-25)                     |
| R10 | Caída del feed: la pantalla y el motor se contradicen                                | P1        | Resiliencia con feed simulado         | Pendiente                                                                                      |
| R11 | Pérdida de datos al reiniciar la API o restaurar la base                             | P1        | Simulacro de restauración             | Sin respaldos todavía                                                                          |
| R12 | Sesión robada o compartida: token de 7 días sin revocación                           | P1        | `tests/security/`                     | Riesgo residual parcial, aceptado para V0.1 (Gerente, 2026-11-25)                              |
| R13 | Explotar el gap al abrir la ventana de la competencia                                | P1        | Propiedades con reloj controlado      | Parcial (R2 de las propiedades)                                                                |
| R14 | Flujo completo roto en móvil                                                         | P1        | Playwright con emulación de móvil     | Sin flujo de órdenes en la web                                                                 |
| R15 | Dependencias vulnerables                                                             | P2        | `pnpm audit`                          | 0 altas; 1 moderada, solo dev                                                                  |
| R16 | Cabeceras, CORS y TLS mal configurados                                               | P2        | OWASP ZAP contra staging              | Sin staging                                                                                    |

### Riesgos vistos al leer el código, todavía sin probar

Son hipótesis. Ninguna es un defecto hasta que un test la confirme.

- `clientOrderId` era opcional: un reintento sin él duplicaba la orden. El contrato v2, ya en
  `main`, lo vuelve obligatorio; QA lo prueba contra la API en T3.
- El WebSocket de mercado es público y no limita conexiones ni suscripciones por cliente.
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
- **Sesión robada o compartida (R12).** Con la tarea 4 del Backend, cerrar sesión revoca la cookie
  (lista negra en Redis). El Gerente aceptó el 2026-11-25 lo que queda como riesgo residual parcial
  de V0.1:
  - un token robado sigue sirviendo hasta 7 días si su dueño no cierra sesión;
  - un login nuevo no revoca los tokens anteriores;
  - con Redis caído, una cookie revocada vuelve a pasar (G2).

  Las pruebas de sesión ajena, vencida, alterada y revocada siguen en la fase 2.

- Entradas (hechas para el contrato v2, `tests/security/`): propiedades con fast-check sobre los
  esquemas de login, orden, cierre y consulta de velas. Cubren números manipulados (negativos,
  cero, `NaN`, infinitos, texto), campos que fija el servidor (precio, cuenta, estado), símbolos
  falsos, UUID inválidos, contaminación de prototipos y límites de la consulta de velas. La API
  real rechaza con 400, sin tocar la base, lo que el contrato rechaza en `POST /orders`. Hallazgos
  (los dos cerrados): DEF-003 y DEF-004. `POST /positions/:id/close` y `GET /candles` todavía no
  existen: se probaron solo contra el esquema.
- Observación sin riesgo: la consulta de velas convierte `limit=0x10` en 16, `1e3` en 1000 y
  `" 7 "` en 7, siempre dentro de 1–1000. Hoy `limit=` vacío se rechaza, aunque `from=` y `to=`
  vacíos cuentan como no enviados. El Arquitecto decidió (2026-11-21) que también cuente como no
  enviado y use 500, y lo cambió en `packages/shared/src/candle.ts` (PR #26). QA agrega ese caso
  en una tarea propia.
- Abuso: fuerza bruta de códigos de inscripción, ráfagas de órdenes, rutas de administración.
- **Login con IP compartida (R17, D-13).** Hoy el límite cuenta 100 fallos por IP cada 15 minutos y,
  agotado, esa IP recibe 429 aunque el código sea válido. En el wifi del evento, cientos de
  asistentes salen por una sola IP pública: los errores de tipeo de todos juntos pueden bloquear el
  ingreso de todos a la vez. Detrás de Caddy, si falta `API_TRUST_PROXY`, todas las peticiones
  llegan con la IP de Caddy y pasa lo mismo fuera del evento.
  - **Decisión del Gerente (2026-11-24)**, con la tarea 4 del Backend:
    - límite por dispositivo con la cookie `coin_device` (`httpOnly`, `Secure`, `SameSite=Lax`): 10
      fallos cada 15 minutos;
    - techo por IP de 2.000 fallos cada 15 minutos;
    - con el techo agotado, un dispositivo que ya entró con un código válido sigue entrando, pero
      sigue sujeto a sus 10 fallos;
    - QA valida los números iniciales (D-13): validados por el Gerente el 2026-11-25;
    - el Arquitecto pone `API_TRUST_PROXY` detrás de Caddy.
  - **Ajustes del Gerente (2026-11-25):**
    - tope de G-A: una cuenta marca como conocidos como máximo 5 dispositivos en 30 días. El sexto
      entra normalmente, pero no queda conocido y no salta el techo. No se expulsa al más antiguo:
      rotar dispositivos anularía el tope;
    - `coin_device` dura 90 días (G-C) y se informa en §10 del reglamento;
    - con una cookie de sesión válida, la cabecera `Authorization` se ignora; solo un Bearer sin
      cookie da 401;
    - G-B: plan B para subir el techo por IP por variable el día del evento, y una alerta cuando
      el techo de una IP pase del 50 %. Los dos van en el runbook del Arquitecto. No hay ingreso
      antes del evento: los códigos se entregan en la entrada (G3b).
  - **Automático** (`tests/security/login-device.integration.test.ts`, con Postgres): cinco
    casos con `it.fails` hasta la tarea 4, más un caso de control:
    1. un dispositivo con 10 fallos se bloquea; otro de la misma IP sigue entrando;
    2. con 150 fallos repartidos entre 30 dispositivos de una IP, un código válido no recibe 429;
    3. con el techo de la IP agotado, un dispositivo conocido entra y uno nuevo no;
    4. un dispositivo conocido con 10 fallos sí se bloquea;
    5. con 5 dispositivos conocidos en una cuenta, el sexto entra, pero con el techo agotado recibe
       429 (G-A).

    El PR del Backend que lo implemente voltea esas líneas (D-21); QA confirma y cierra R17. Los
    tests suponen que la API pone `coin_device` en la respuesta de `POST /auth/login` cuando el
    navegador no la trae.

  - **Staging y simulacro** (fase 2):
    - por el proxy, el `request.ip` del log es la IP del cliente, no la de Caddy;
    - ráfaga de apertura: 450 logins desde una sola IP, con entre 10 % y 20 % de errores de tipeo
      y sus reintentos. Criterio de Go: ningún código válido recibe 429;
    - ráfaga de apertura con un script hostil: los mismos 450 logins y, desde la misma IP, un
      script que cambia de cookie en cada intento hasta agotar el techo. Se espera que la alerta
      del 50 % salte antes del bloqueo y que, con el plan B del runbook, los dispositivos nuevos
      vuelvan a entrar. Criterio de Go (Gerente, 2026-11-25): como máximo 5 minutos desde la
      alerta del 50 % hasta que los dispositivos nuevos vuelven a entrar.
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

| Criterio                                                                                           | Estado            |
| -------------------------------------------------------------------------------------------------- | ----------------- |
| 500 usuarios simulados 2 horas sin errores                                                         | Local 15 min: sí  |
| Confirmación de orden en menos de 200 ms (p95) con carga                                           | Sin probar        |
| Cero defectos Críticos o Altos abiertos                                                            | Sí, al 2026-11-18 |
| Restauración de respaldo verificada                                                                | Sin probar        |
| Recuperación tras caída del feed verificada                                                        | Sin probar        |
| Auditoría del ranking sin diferencias                                                              | Sin probar        |
| Simulacro con usuarios reales y hallazgos cerrados                                                 | Sin fecha         |
| Ráfaga de apertura (450 logins desde una IP, 10–20 % de errores): ningún código válido recibe 429  | Sin probar        |
| Ráfaga hostil: de la alerta del 50 % al reingreso de dispositivos nuevos en 5 min o menos (plan B) | Sin probar        |

## 6. Lo que QA necesita de cada agente

| De               | Qué                                                                                                                                                                                       | Para         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Backend          | Ruta del ranking (el límite de peticiones ya está en `main`, PR #17)                                                                                                                      | R3           |
| Backend          | Login por dispositivo con techo por IP, tope de 5 dispositivos conocidos por cuenta con su test (G-A) y `coin_device` de 90 días (G-C); tarea 4, voltear los 5 `it.fails` de R17 por D-21 | R17          |
| Arquitecto       | `API_TRUST_PROXY` con la IP o la subred de Caddy en staging y producción                                                                                                                  | R17          |
| Arquitecto       | Runbook: plan B para subir el techo por IP por variable y alerta cuando el techo de una IP pase del 50 % (G-B)                                                                            | R17          |
| Backend          | Con D-09, guardar una orden por monto rechazada con `quantity = 0` sin violar el CHECK                                                                                                    | R1           |
| Datos de Mercado | Escritura de `last:{symbol}` en Redis y umbral de obsolescencia en una sola fuente                                                                                                        | R4, R10      |
| Arquitecto       | Entorno de staging con datos sintéticos, k6 disponible y respaldos (depende de D-06)                                                                                                      | R7, R11, R16 |
| Arquitecto       | Actualizar `typescript-eslint` a 8.73.0 (cierra la alerta moderada de `minimatch`)                                                                                                        | R15          |
| Arquitecto       | Ya no quedan altas: agregar `pnpm audit --audit-level high` al CI                                                                                                                         | R15          |
| Frontend         | Flujo de órdenes en la web y los `data-testid` de `docs/qa/data-testid.md` (confirmar la lista y aplicarla)                                                                               | R14          |

Resueltos: Postgres y Redis en el CI, que además falla si un test queda omitido (PR #14); límite
de peticiones en login y órdenes (PR #17); división del ítem de `tests/security/` del checklist
(respuesta del Arquitecto del 2026-11-21, aplicada por QA); DEF-003 corregido por el Backend en el
PR #21 y cerrado por QA; umbral de precio obsoleto por símbolo (`staleAfterMs(symbol)`) y
`MAX_TICK_FUTURE_MS` del contrato en la API y el motor (PR #23); alerta alta de `effect`, cerrada
con el override del PR #30; `limit=` vacío en `GET /candles` usa 500 (PR #26); `stale_price`
hacia afuera y DEF-004 corregidos por el Backend en el
PR #34 (Tarea 3), y DEF-004 cerrado por QA. Falta una prueba de la API que
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
