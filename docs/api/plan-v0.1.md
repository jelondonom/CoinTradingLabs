# Plan del Agente Backend Motor de Trading — V0.1

Actualizado: 2026-11-22. Fuentes:

- `docs/decisiones-gerente.md`;
- ADR-0004 (contrato v2);
- `docs/engine-rules.md`;
- la lista de tareas del Arquitecto;
- las respuestas del Gerente, del Arquitecto, de QA y del Frontend (al final).

Si este plan choca con `decisiones-gerente.md`, manda `decisiones-gerente.md`. Se pone al día en el
PR de cada tarea que lo cambie (decisión del Gerente, G8).

## Reglas de trabajo para cada tarea

- **Rama y carpeta:** rama `<tipo>/<tarea>` desde `origin/main`, en la carpeta
  `C:\dev\ctl-backend-<tarea>`. Al fusionar el PR se borran la rama remota y la carpeta.
- **Flujo:**
  1. `/plan` y OK del Gerente.
  2. Código y tests.
  3. `pnpm test` (con Postgres y Redis: ningún test `skipped`), `pnpm lint` y `pnpm build` en
     la raíz.
  4. `/code-review`.
  5. PR con la plantilla llena.
  6. CI en verde con `main` al día. El merge lo hace el Gerente.
- **Reglas del motor:** si una tarea cambia una regla, actualiza `docs/engine-rules.md` y avisa a
  QA. El PR espera al de QA con sus propiedades al día (`AGENTS.md`).
- **Migraciones:** nunca `prisma migrate dev`. Se generan con `prisma migrate diff` más SQL a mano,
  y se revisa que no quede drift.
- **Dependencias:** solo con OK del Gerente; la versión exacta se confirma en npm y va en el PR.
- **Checklist:** las casillas de `docs/checklist-v0.md` se marcan en el mismo PR, solo con
  evidencia (test, comando o número de PR).
- **Carpetas ajenas:** solo se miran. La única excepción en `tests/` es voltear el `it.fails` del
  defecto que arregla el PR en `tests/properties/engine-defects.test.ts` (`AGENTS.md`).

## Hecho

| Tarea                                       | Evidencia                    |
| ------------------------------------------- | ---------------------------- |
| DEF-002: tick con fecha futura (D-11)       | PR #10                       |
| DEF-001: redondeo y mínimo de 10 USD (D-01) | PR #12 y PR #15              |
| Límite de peticiones (D-13)                 | PR #17                       |
| Tabla de velas (D-18)                       | PR #20                       |
| DEF-003: cantidad fuera de `DECIMAL(28,8)`  | PR #21                       |
| Umbral obsoleto por símbolo desde `shared`  | PR #23 (QA confirmó en Q5)   |

## Orden (Gerente, G7, 2026-11-22)

effect → 3 → 4 → 7 → 8 → 6 → 5 → 9 → 10 → 11.

Después de la 4, el orden sigue el del Frontend: login, orden por monto, cierre y eventos al
final. La 9 (ranking) espera además el esquema `leaderboard.ts` del Arquitecto.

## Tarea effect — alerta alta de `effect` en `pnpm audit`

- **Qué pasa:** `effect` 3.20.0 entra por `prisma > @prisma/config` (solo la CLI, en
  desarrollo). Está corregido en 3.22.1 o superior. QA lo detalla en `docs/qa/audit-v0.1.md`.
- **Revisado el 2026-11-22:** ninguna versión de Prisma lo corrige; `@prisma/config` 7.10.1 y las
  versiones `8.1.0-dev` siguen pidiendo 3.20.0.
- **Plan:**
  1. Al empezar, volver a mirar npm; si salió un Prisma corregido, subir juntos `prisma`,
     `@prisma/client` y `@prisma/adapter-pg`.
  2. Si no, override `effect: ^3.22.1` en `pnpm.overrides` del `package.json` de la raíz. Ese
     archivo es del Arquitecto (A8).
  3. Verificar `prisma generate`, migraciones, `pnpm test`, `pnpm audit` y `pnpm why effect -r`.
  4. Si el override rompe algo, el PR documenta el riesgo: no explotable con datos de un
     participante.
- **Avisar a:** QA, para su reporte de audit y la casilla del checklist.

## Tarea 3 — Errores del contrato, `stale_price` hacia afuera y DEF-004

- **Errores:** `AppError` usa los códigos de `API_ERROR_CODES`, y su estado sale de
  `API_ERROR_HTTP_STATUS`.
  - `invalid_request` pasa a `validation_error`.
  - Una ruta inexistente responde 404 `not_found` con el formato del contrato.
  - Un cuerpo que rechaza Fastify (JSON inválido, demasiado grande u otro `Content-Type`)
    responde 400.
- **`stale_price`:** se borra `toPublicRejectReason`; `rejectReason` sale tal cual.
- **DEF-004:** el login usa `loginRequestSchema` de `@coin/shared` (recorta los espacios). Su
  `it.fails` está en `tests/security/api-conformance.test.ts`, fuera de la excepción de
  `AGENTS.md`: lo voltea QA en su PR (Q7).
- **Limpieza:** se borra `TradingDeps.staleAfterMs`, que QA ya dejó de usar (PR #24).
- **Pruebas:** `app-error.test.ts`; errores del contrato en `app.test.ts`; `toOrderDto`; integración
  con `stale_price`, `validation_error` y DEF-004.
- **Checklist:** "Umbral obsoleto por símbolo desde `shared`; `stale_price` hacia afuera" y
  "Errores con el formato `apiError` del contrato v2".
- **Avisar a:** QA (cerrar DEF-004) y Frontend (códigos nuevos).

## Tarea 4 — Login con cookie `coin_session` y logout (D-04)

- **Login:** responde `{ accountId, expiresAt }` y la cookie `coin_session`, que lleva el mismo
  token firmado (`HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age`). Se deja de aceptar Bearer.
- **`Secure`:** se activa con `NODE_ENV=production`; staging corre así (A1).
- **Logout:** `POST /auth/logout` responde 204 y borra la cookie. El token entra en una lista negra
  de Redis hasta que vence (G2).
  - Si Redis cae, la sesión se acepta igual y queda un aviso en el log, como con D-13.
  - La sesión sigue durando 7 días.
- **Dependencia:** `@fastify/cookie`, aprobada por el Gerente (G1).
- **Pruebas:** atributos de la cookie, Bearer → 401, logout → 204, y la misma cookie da 401
  después del logout.
- **Checklist:** "Login con cookie `httpOnly` y WS de cuenta autenticado (D-04)", junto con la
  tarea 5.
- **Avisar a:** Frontend (F4) y QA (R12).

## Tarea 7 — Orden por monto (D-09)

- **Cantidad:** `floor(amountUsd / precio)` a `quantityPrecision` decimales, con el `ask` en
  compras y el `bid` en ventas. Después se aplica D-01 igual que hoy.
- **Cantidad 0:**
  - Sin precio (`market_closed`, `no_price`, `stale_price`), la orden rechazada guarda
    `quantity = 0` y conserva `amountUsd` (A3).
  - Si el monto no alcanza una unidad, da `invalid_quantity` y también guarda 0.
- **Migración:**
  - Columna `orders.amount_usd`.
  - El CHECK de cantidad positiva pasa a admitir 0 solo en una orden rechazada por monto.
- **Monto que no cabe:** 422 `invalid_quantity`, sin orden y con `order.refused` en `audit_logs`,
  como DEF-003 (A4).
- **Se quita** el bloqueo temporal de la orden por monto.
- **Regla del motor:** cambia, así que el PR espera las propiedades de QA (Q8).
- **Checklist:** "Orden por monto (D-09) y `POST /positions/:id/close`", junto con la tarea 8.
- **Avisar a:** QA y Frontend (F6).

## Tarea 8 — `POST /positions/:id/close`

- **Qué hace:** con `{ clientOrderId }`, vende la posición completa al `bid`, con la exención de
  cierre de D-01. Responde 201 si es nueva y 200 si repite el `clientOrderId`.
- **Errores:**
  - Posición ajena o ya cerrada → 404 `not_found`, sin revelar si existe (Q9).
  - `:id` inválido → 400.
  - Sin precio → orden rechazada guardada (201).
- **Límite:** cuenta en el límite D-13 de órdenes.
- **Pruebas:** cierre, repetición, otra cuenta, posición ya cerrada y dos cierres a la vez.
- **Avisar a:** Frontend (F7) y QA (R5 y R6).

## Tarea 6 — `GET /account` con `accountResponseSchema`

- **`realizedPnl`:** suma de `positions.realized_pnl` de la cuenta.
- **`unrealizedPnl`:** valor al `bid` menos el costo, en las posiciones abiertas.
- **Invariante:** `equity − initialBalance = realizedPnl + unrealizedPnl`, al centavo.
- **La misma vista** sirve para el WS de cuenta (tarea 5).

## Tarea 5 — WS de cuenta

- **Conexión:**
  - `Origin` fuera de `API_ALLOWED_ORIGINS` → 403 en el handshake.
  - Sin sesión válida → cierre 4401, también cuando la sesión vence con el WS abierto, o cuando se
    revoca al cerrar sesión.
- **Mensajes:** `account.snapshot` al conectar. Después de cada ejecución, en orden: orden,
  posición y `account.update`.
- **Un solo proceso de API (A2):** los eventos van por memoria, detrás de una interfaz que permite
  pasar a Redis si las pruebas de carga lo piden.
- **Variable nueva:** `API_ALLOWED_ORIGINS`, obligatoria en producción con `https://<dominio>`.
  Caddy deja pasar `Origin` y `Cookie`.
- **Checklist:** "Eventos del WS de cuenta: orden, posición y saldo" y la casilla de D-04.
- **Avisar a:** Frontend (F5); preguntarle cuántas órdenes trae el snapshot (F2).

## Tarea 9 — Ranking (D-12)

- **Premios (G5):** dos, a los 2 días del congreso y a los 30 días.
  - Es una sola competencia, que termina a los 30 días.
  - Al final del día 2 se toma una foto del ranking en `leaderboard_snapshots` que no cambia
    después.
  - El enum `leaderboard_cutoff` ya tiene `two_day` y `thirty_day`.
- **Foto inmutable:** trigger append-only, una sola foto por corte, tomada en una transacción a la
  hora del corte.
- **Ranking en vivo:** con caché, calculado cada pocos segundos y nunca en cada petición.
- **Desempate D-12:** retorno con 4 decimales, luego menos órdenes, luego quien llegó primero. Se
  aclara con el Gerente al empezar (G9).
- **Espera:** `leaderboard.ts` del Arquitecto (A7).
- **Checklist:** "Ranking por retorno con caché y desempate D-12".
- **Avisar a:** QA (`audit:leaderboard`, D-19) y Frontend.

## Tarea 10 — Competencia y cuentas desde CSV (D-20)

- **Script de competencia:** "COIN Investment Challenge 2027", con inicio, fin (corte de los 30
  días) y corte del día 2. Las fechas están pendientes.
- **Script de cuentas:** entrada CSV `fullName,displayName[,email]`.
  - `displayName` lo llenan los organizadores, con nombre e inicial del apellido.
  - Los nombres repetidos se permiten.
  - `fullName` y `email` nunca se guardan en la base.
- **Salida, en la carpeta privada del servidor:**
  - `*.codes.csv`, con los códigos para imprimir: se borra al repartir;
  - `*.cuentas.csv`, sin códigos, para verificar ganadores: se borra después de premiar (G6).
- **Producción:** contenedor de un solo uso con el script compilado (A5); el runbook es del
  Arquitecto.
- **Checklist:** "Script de cuentas desde CSV (D-20)".

## Tarea 11 — `docs/engine-rules.md` al contrato v2

- **§10:** cerrar las solicitudes cumplidas, con su evidencia.
- **§11:** una sola tabla de rutas, errores y límites del contrato v2.
- El comentario de CI en `trading.integration.test.ts` ya está al día.

## Fase 2 (no empezar)

`GET /orders`, `GET /positions` e historial. Esperan el contrato 2.1.

## Decisiones y respuestas

- **Gerente, 2026-11-22:**
  - G1: instalar `@fastify/cookie`.
  - G2: lista negra en Redis al cerrar sesión, abierta si Redis cae; la sesión sigue en 7 días.
  - G3: columnas de la lista y códigos impresos en la entrada del evento. Quién entrega la lista,
    y cuándo, está pendiente.
  - G4: `fullName` obligatorio solo para el reparto; nombres repetidos iguales; `displayName` lo
    llenan los organizadores.
  - G5: nombre de la competencia y dos premios. Las fechas están pendientes.
  - G6: dos archivos de salida.
  - G7: el orden de arriba.
  - G8: este archivo.
- **Arquitecto, 2026-11-22:**
  - A1: staging con `NODE_ENV=production`.
  - A2: un proceso de API.
  - A3: cantidad 0 sin precio; ya está en el comentario de `orderSchema.quantity`.
  - A4: 422 `invalid_quantity`.
  - A5: comando del script, `.gitignore` con `*.codes.csv` y `/private/`, y borrado en el runbook.
  - Pendientes: A6 (`*.cuentas.csv` y el segundo borrado), A7 (foto de un corte en
    `leaderboard.ts`) y A8 (override de `effect`).
- **QA, 2026-11-21 y 2026-11-22:**
  - Q1–Q4: DEF-003 cerrado y sesión por cookie en su arnés.
  - Q5: propiedades al día con el umbral por símbolo.
  - Q6: quitó `staleAfterMs` de su arnés.
- **Frontend, 2026-11-21:** B1–B4 sobre el orden de entrega, `Origin`, `Retry-After` y las señales
  de sesión vencida.
- **Pendientes al empezar cada tarea:** Q7 y F1 (tarea 3), F2 (5), Q8 (7), Q9 (8) y G9 (9).
