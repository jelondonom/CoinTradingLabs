# ADR-0004: Contrato v2

- Estado: aceptada
- Fecha: 2026-11-18
- Decisiones del Gerente: D-03, D-04, D-05, D-09, D-11

## Contexto

Para cerrar el flujo de V0.1 faltaban en `packages/shared` la sesión, la vista de la cuenta, el
formato de error, las velas REST, la orden por monto y el cierre de posición. El Backend y el
Frontend tenían copias locales de esas formas.

## Decisión

**Un solo origen y sus rutas.** Caddy (producción) y Vite (desarrollo) enrutan así:

| Ruta pública  | Servicio      | Ruta interna  | Contenido                          |
| ------------- | ------------- | ------------- | ---------------------------------- |
| `/api/*`      | `api`         | sin `/api`    | login, órdenes, cuenta, posiciones |
| `/market/*`   | `market-data` | sin `/market` | velas REST: `GET /market/candles`  |
| `/ws/account` | `api`         | igual         | WS privado de cuenta               |
| `/ws/market`  | `market-data` | igual         | WS público de mercado              |

Las constantes de ruta del contrato (`LOGIN_PATH`, `CANDLES_PATH`, …) son rutas internas.

**Sesión (D-04).** `POST /auth/login` recibe `{ code }` y responde `{ accountId, expiresAt }` con
`Set-Cookie: coin_session` (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`). El token nunca va
en el cuerpo ni en `localStorage`. `POST /auth/logout` borra la cookie (204). El WS de cuenta se
autentica con la misma cookie al conectar, sin mensaje `auth`; el servidor valida `Origin` y
cierra con `4401` si la sesión no es válida. `SameSite=Strict` y el origen único cubren CSRF.

**Cuenta.** `accountView` = cuenta + `realizedPnl` + `unrealizedPnl`. `GET /account` responde
`{ account: accountView, positions }`. WS de cuenta: `account.snapshot`, `account.update`,
`order.filled`, `order.rejected`, `position.update`, `position.closed`. Entre ejecuciones el
cliente recalcula el P&L no realizado con los ticks.

**Órdenes (D-09, D-01).** `quantity` o `amountUsd`, exactamente uno. `clientOrderId` (UUID)
obligatorio. `MIN_ORDER_USD = 10` lo valida el servidor con `below_minimum`, no el esquema.
`POST /positions/:id/close` recibe `{ clientOrderId }` y vende la posición completa; responde la
orden. Nuevos motivos de rechazo: `below_minimum` y `stale_price`.

**Errores.** `{ error: { code, message } }`. Los códigos (`API_ERROR_CODES`) incluyen todos los
motivos de rechazo más `validation_error`, `unauthorized`, `not_found`, `rate_limited` e
`internal`; `API_ERROR_HTTP_STATUS` fija el estado HTTP. Regla: si la orden quedó guardada, el
rechazo viaja en `Order.rejectReason` (201); si no se guardó, como `apiError` con el mismo código
y HTTP 422. El cliente traduce con una sola tabla.

**Velas.** Intervalo nuevo `4h`. `GET /market/candles?symbol&interval&from&to&limit`: `from` y
`to` en ms UTC e incluidos, `limit` 500 por defecto y 1000 como máximo. Responde
`{ symbol, interval, candles }` ascendente por `openTime`.

**Precio obsoleto (D-11).** `staleAfterMs(symbol)` en `price-freshness.ts` es la única fuente
para `api` y `market-data`. `MAX_TICK_FUTURE_MS = 2000`: un tick más adelantado es inválido.

**Mercado (D-05).** `status` lleva `marketOpen`: todo opera 24/7, cerrado solo si el símbolo está
deshabilitado o su precio está obsoleto.

**Sin cambio.** `Position.side` conserva `short` (D-02 lo aplica el motor). `Order.clientOrderId`
admite `null` en respuestas, por órdenes anteriores a v2.

`CONTRACT_VERSION = 2`.

## Consecuencias

- Cambio incompatible para los cuatro agentes; cada uno adapta su parte (lista en el PR).
- Para no romper `main`, el PR incluye solo el arreglo mínimo de compilación en `api` (la orden
  por monto responde `invalid_request` hasta que el Backend la implemente) y en `market-data`
  (`marketOpen = !stale`). La implementación real es de cada dueño.
- Caddy debe replicar exactamente la tabla de rutas (T4).
