# Reglas del motor de trading (V0)

- Responsable: Agente Backend Motor de Trading.
- Estado: V0, aprobado por el Gerente el 2026-11-16.
- Código: `apps/api/src/engine/`. Esquema: `apps/api/prisma/schema.prisma`.

Este documento es la referencia para implementar y probar el motor. Si el código y este documento
no coinciden, es un error en uno de los dos.

## 1. Supuestos V0

| Tema                  | Regla V0                                                             |
| --------------------- | -------------------------------------------------------------------- |
| Saldo inicial         | 100.000 USD por cuenta                                               |
| Apalancamiento        | 1:1. Sin margen ni stop-out                                          |
| Tipos de orden        | Solo `market`                                                        |
| Dirección             | Solo largos. Una venta únicamente reduce o cierra una posición larga |
| Venta parcial         | Permitida                                                            |
| Comisiones            | Ninguna. El único costo es la diferencia entre `bid` y `ask`         |
| Moneda                | Todo cotiza y se liquida en USD                                      |
| Posiciones por cuenta | Una posición abierta por símbolo (posición neta, precio promedio)    |

Comisiones, tamaño máximo por orden y límite de posiciones abiertas siguen pendientes de decisión
del Gerente. Mientras no se decidan, no existen.

## 2. Principios

1. El servidor es la única fuente de verdad. El cliente envía símbolo, lado, cantidad y
   `clientOrderId`; nunca precios, saldos ni P&L.
2. El motor es puro: recibe estado (cuenta, posición, instrumento, tick, hora) y devuelve un
   resultado. No lee reloj, red ni base de datos.
3. Todo cálculo usa `decimal.js`. Los valores viajan como `number` en el cable (ADR-0002) y se
   convierten solo en el borde de la API.
4. Las órdenes de una misma cuenta se procesan en serie, y cada ejecución ocurre dentro de una
   sola transacción de base de datos.
5. El saldo se deriva de `ledger_entries`, que es solo de inserción.

## 3. Precio de ejecución

- Una compra se ejecuta al `ask` del último tick del servidor.
- Una venta se ejecuta al `bid` del último tick del servidor.
- El precio del tick se usa tal cual, sin redondeo adicional. Con cada ejecución se guardan
  `bid`, `ask` y la marca de tiempo del tick (`fills.tick_bid`, `tick_ask`, `tick_ts`).
- Una orden market se ejecuta completa o se rechaza. No hay ejecución parcial.

## 4. Redondeo

- **Cantidad**: debe tener como máximo `quantityPrecision` decimales y ser mayor o igual a
  `minQuantity`. Si no, la orden se rechaza con `invalid_quantity`. El motor nunca redondea una
  cantidad por su cuenta.
- **Monto de una ejecución** (`notional`): `cantidad × precio`, redondeado a centavos siempre en
  contra del participante (D-01). En una compra se redondea hacia arriba (`ROUND_CEIL`) y en una
  venta hacia abajo (`ROUND_FLOOR`). Es el único valor que mueve el libro contable.
- **Por qué** (DEF-001): con redondeo al más cercano, comprar en trozos y vender de golpe al
  mismo precio creaba dinero (hasta medio centavo por orden). Con el redondeo en contra, a precio
  fijo ninguna secuencia de órdenes sube el equity.
- **Resto del dinero** (valor de mercado, costo liberado en una venta parcial): se redondea a
  centavos al más cercano, la mitad hacia arriba (`ROUND_HALF_UP`). Estos valores no mueven el
  saldo.

## 5. Validaciones y rechazos

Las validaciones se evalúan en este orden. La primera que falla define el motivo. Una orden
rechazada se guarda con `status = rejected` y su motivo, y no genera asientos contables.

| Orden | Condición                                                                 | Motivo                  |
| ----- | ------------------------------------------------------------------------- | ----------------------- |
| 1     | El instrumento está deshabilitado (`tradable = false`)                    | `market_closed`         |
| 2     | La hora está fuera de la ventana de la competencia `[startsAt, endsAt)`   | `market_closed`         |
| 3     | No hay ningún tick del símbolo                                            | `no_price`              |
| 4     | El tick es obsoleto: `ahora − tick.ts > umbral` o `tick.ts − ahora > 2 s` | `stale_price`           |
| 5     | La cantidad no cumple `quantityPrecision` o `minQuantity`                 | `invalid_quantity`      |
| 6     | `notional < 10 USD`, salvo una venta que cierra toda la posición          | `below_minimum`         |
| 7     | Compra: `notional > saldo`                                                | `insufficient_funds`    |
| 8     | Venta: no hay posición abierta o `cantidad > cantidad de la posición`     | `insufficient_position` |

Notas:

- **Mercado cerrado**: en V0 no hay horarios por tipo de activo, porque los precios de acciones y
  materias primas vienen de contratos que cotizan todos los días a toda hora.
- **Precio obsoleto** (D-11): el umbral de cada símbolo es `staleAfterMs(symbol)`, de
  `@coin/shared`, la misma función con la que `market-data` marca el precio obsoleto. Así la
  pantalla y el motor nunca se contradicen. La API se lo pasa al motor en cada orden
  (`apps/api/src/modules/orders/place-order.ts`); no hay variable de entorno.
- **Tick del futuro** (D-11, DEF-002): un tick con fecha más de 2 segundos posterior a la hora del
  servidor también es obsoleto (`MAX_TICK_FUTURE_MS`, de `@coin/shared`). Los 2 segundos toleran
  relojes un poco desalineados; sin este límite, un tick mal fechado seguiría sirviendo aunque el
  feed se caiga.
- **Monto mínimo** (D-01): 10 USD por orden (`MIN_ORDER_USD`, de `@coin/shared`), comparado contra el `notional` ya
  redondeado en su dirección. Una venta de toda la posición siempre se permite: si no, una
  posición que vale menos de 10 USD quedaría atrapada (decisión del Gerente, 2026-11-18). Una
  venta sin posición y por menos de 10 USD se rechaza con `below_minimum`, porque la fila 6 va
  antes que la 8.
- **Idempotencia**: si llega una orden con un `clientOrderId` que la cuenta ya usó, se devuelve la
  orden original sin ejecutar nada.

## 6. Efecto de una ejecución

### Compra

1. `notional = redondearHaciaArriba(cantidad × ask)`.
2. Asiento contable `trade_buy` por `−notional`. El saldo baja en `notional`.
3. Posición: si no hay una abierta, se crea. Luego `quantity += cantidad` y
   `costBasis += notional`.
4. `avgEntryPrice = costBasis / quantity`.
5. P&L realizado del fill: 0.

### Venta

Sea `Q` la cantidad de la posición antes de vender y `q` la cantidad vendida.

1. `notional = redondearHaciaAbajo(q × bid)`.
2. Costo liberado: si `q = Q`, es todo `costBasis`. Si `q < Q`, es
   `redondear(costBasis × q / Q)`.
3. P&L realizado del fill: `notional − costo liberado`. Se acumula en `positions.realized_pnl`.
4. Asiento contable `trade_sell` por `+notional`. El saldo sube en `notional`.
5. Posición: `quantity −= q` y `costBasis −= costo liberado`. `avgEntryPrice` no cambia.
6. Si `quantity` queda en cero, la posición se cierra (`closedAt`) y se emite `position.closed`.

El P&L se calcula desde `costBasis` y no desde el precio promedio para que no se pierdan centavos:
la suma del P&L realizado y no realizado siempre es igual a `equity − saldo inicial`.

## 7. Saldo, P&L y equity

- **Saldo** (`balance`): efectivo disponible. Es la suma de `amount` de los asientos de la cuenta.
- **Valor de mercado de una posición**: `redondear(quantity × bid)`. Una posición larga se valora
  al `bid` porque es el precio al que se podría vender.
- **P&L no realizado**: `valor de mercado − costBasis`.
- **P&L realizado**: suma de `realizedPnl` de los fills de venta.
- **Equity**: `saldo + suma del valor de mercado de las posiciones abiertas`.
- **Retorno** (ranking): `(equity − saldo inicial) / saldo inicial`.

Si un símbolo no tiene tick reciente, su posición se valora con el último tick conocido. Si no
tiene ningún tick, se valora a su precio promedio de entrada (P&L no realizado cero).

## 8. Ejemplo completo

Cuenta nueva con 100.000,00 USD. Instrumento BTCUSD.

**Paso 1. Compra de 0,5 BTC** con tick `bid = 60.000,00` y `ask = 60.010,00`.

- `notional = 0,5 × 60.010,00 = 30.005,00`
- Saldo: `100.000,00 − 30.005,00 = 69.995,00`
- Posición: `quantity = 0,5`, `costBasis = 30.005,00`, `avgEntryPrice = 60.010,00`
- Valor de mercado: `0,5 × 60.000,00 = 30.000,00`
- P&L no realizado: `30.000,00 − 30.005,00 = −5,00`
- Equity: `69.995,00 + 30.000,00 = 99.995,00`

**Paso 2. Venta de 0,2 BTC** con tick `bid = 62.000,00` y `ask = 62.010,00`.

- `notional = 0,2 × 62.000,00 = 12.400,00`
- Costo liberado: `30.005,00 × 0,2 / 0,5 = 12.002,00`
- P&L realizado: `12.400,00 − 12.002,00 = 398,00`
- Saldo: `69.995,00 + 12.400,00 = 82.395,00`
- Posición: `quantity = 0,3`, `costBasis = 18.003,00`, `avgEntryPrice = 60.010,00`
- Valor de mercado: `0,3 × 62.000,00 = 18.600,00`
- P&L no realizado: `18.600,00 − 18.003,00 = 597,00`
- Equity: `82.395,00 + 18.600,00 = 100.995,00`
- Comprobación: `398,00 + 597,00 = 995,00 = 100.995,00 − 100.000,00`
- Retorno: `995,00 / 100.000,00 = 0,995 %`

Libro contable de la cuenta al final:

| Asiento | Tipo              | Monto       | Saldo después |
| ------- | ----------------- | ----------- | ------------- |
| 1       | `initial_deposit` | +100.000,00 | 100.000,00    |
| 2       | `trade_buy`       | −30.005,00  | 69.995,00     |
| 3       | `trade_sell`      | +12.400,00  | 82.395,00     |

## 9. Invariantes

Los tests del motor y las pruebas de QA deben comprobar siempre:

1. La suma de `ledger_entries.amount` de una cuenta es igual a `accounts.balance`.
2. El saldo nunca es negativo.
3. La cantidad de una posición nunca es negativa.
4. `equity − saldo inicial = P&L realizado + P&L no realizado`.
5. Una posición cerrada tiene `quantity = 0` y `costBasis = 0`.
6. El mismo `clientOrderId` en la misma cuenta nunca produce dos ejecuciones.

## 10. Coordinación de contratos

Solicitudes al Agente Arquitecto sobre `packages/shared`. El Agente Backend no cambia esos
archivos.

| N.º | Solicitud                                                                                                                                                                                      | Afecta a         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1   | Agregar `stale_price` a `orderRejectReasonSchema`                                                                                                                                              | Frontend, QA     |
| 2   | Volver obligatorio `clientOrderId` en `placeOrderRequestSchema`                                                                                                                                | Frontend, QA     |
| 3   | Definir con Datos de Mercado la llave y el formato del último tick en Redis (propuesta: `last:{symbol}`)                                                                                       | Datos de Mercado |
| 4   | Publicar el umbral de precio obsoleto por símbolo en un lugar que el motor pueda leer                                                                                                          | Datos de Mercado |
| 5   | Confirmar que una posición larga se valora al `bid`. El comentario de `tickSchema` dice que `last` valora                                                                                      | Frontend         |
| 6   | Confirmar `quantityPrecision` del catálogo: el motor acepta los valores actuales de `INSTRUMENTS` sin cambio                                                                                   | Datos de Mercado |
| 7   | Mover al contrato el login (`POST /auth/login`), la respuesta de `GET /account` y el formato de error                                                                                          | Frontend, QA     |
| 8   | Agregar Postgres al CI para que corran los tests de integración de la API                                                                                                                      | QA               |
| 9   | Publicar en `shared`, junto a `staleAfterMs`, la tolerancia de tick futuro (D-11). Cumplida en el contrato v2: `MAX_TICK_FUTURE_MS` en `price-freshness.ts`, que el motor usa sin copia propia | Datos de Mercado |
| 10  | Agregar `below_minimum` a los motivos de rechazo y publicar `MIN_ORDER_USD` = 10 (D-01). Cumplida en el contrato v2; el motor y la API ya los usan                                             | Frontend, QA     |

El contrato v2 (PR #11, `CONTRACT_VERSION = 2`) cumple también las solicitudes 1, 2, 4 y 7. La API
ya adopta la 1 (`stale_price` y `below_minimum` salen tal cual en `rejectReason`), la 2 y la 4.
De la 7 ya usa `loginRequestSchema` y el formato de error; faltan la cookie de sesión (tarea 4) y
`GET /account` con `accountResponseSchema` (tarea 6). El cierre de esta sección es la tarea 11.

## 11. API REST V0

Todas las respuestas de error cumplen `apiErrorSchema` de `@coin/shared`:
`{ "error": { "code", "message" } }`. El código es uno de `API_ERROR_CODES` y el estado HTTP sale
de `API_ERROR_HTTP_STATUS` (`apps/api/src/errors/app-error.ts`): `validation_error` (400),
`unauthorized` (401), `not_found` (404), `invalid_quantity` (422), `rate_limited` (429) e
`internal` (500).

- Una ruta que no existe responde 404 `not_found`.
- Un cuerpo que Fastify rechaza antes de la ruta (JSON inválido, demasiado grande u otro
  `Content-Type`) responde 400 `validation_error`, aunque Fastify habría dicho 413 o 415.
- Los errores de la API conservan su código y su estado: un 429 sigue siendo `rate_limited` con
  `Retry-After` y un 401 sigue siendo `unauthorized`.
- Un error no controlado responde 500 `internal` con un mensaje fijo. El detalle va solo al log.

| Ruta               | Sesión | Qué hace                                                                |
| ------------------ | ------ | ----------------------------------------------------------------------- |
| `POST /auth/login` | No     | Recibe `loginRequestSchema`; devuelve `{ token, expiresAt, accountId }` |
| `POST /orders`     | Sí     | Recibe `placeOrderRequestSchema` y devuelve la orden (`orderSchema`)    |
| `GET /account`     | Sí     | Devuelve `{ account, positions }` con las posiciones abiertas           |

- **Ingreso**: un código de inscripción por asistente, sin contraseña (aprobado por
  el Gerente el 2026-11-16). El código se recorta antes de medir su largo (de 4 a 64, DEF-004) y
  no distingue mayúsculas, espacios ni guiones. La base
  guarda solo su SHA-256.
- **Sesión**: cabecera `Authorization: Bearer <token>`. El token dura 7 días por defecto
  (`AUTH_TOKEN_TTL_HOURS`) y se firma con `AUTH_TOKEN_SECRET`.
- **`POST /orders`** responde 201 con la orden, ejecutada o rechazada. Una orden rechazada no es
  un error HTTP: llega con `status = rejected` y su `rejectReason`. Si el `clientOrderId` ya se
  usó, responde 200 con la orden original.
- **Cantidad que no cabe en `orders.quantity`** (DEF-003): con más de 8 decimales o con 20 dígitos
  enteros o más, `DECIMAL(28,8)` no la puede guardar ni como orden rechazada. `POST /orders`
  responde 422 `invalid_quantity` sin crear la orden: es un rechazo de negocio sin orden guardada,
  como prevé el contrato v2. El intento queda en el log (`warn`) y en `audit_logs` con
  `action = 'order.refused'`, `entity_type = 'order_request'`, el `clientOrderId` y la cantidad tal
  como llegó: es evidencia de la conducta 5 del reglamento (decisión del Gerente, 2026-11-21). Una
  cantidad inválida que sí cabe (por ejemplo 6 decimales en BTCUSD) sigue el camino normal:
  orden rechazada guardada y 201.
- Un campo que el cliente no debe enviar (por ejemplo `price`) se ignora.

### Límites de peticiones (D-13)

Los números los propone el Backend y los valida QA (D-13). Ventanas fijas en Redis
(`apps/api/src/modules/rate-limit/`); la ventana de un día va de medianoche a medianoche UTC.
Como las ventanas son fijas, en el borde entre dos ventanas se pueden juntar hasta dos límites
seguidos (por ejemplo, 30 órdenes a las 10:00:59 y otras 30 a las 10:01:00).

| Ruta               | Llave                              | Qué cuenta                         | Límite | Ventana   | Variable                               |
| ------------------ | ---------------------------------- | ---------------------------------- | ------ | --------- | -------------------------------------- |
| `POST /auth/login` | IP del cliente (IPv6: prefijo /64) | Solo intentos fallidos (400 y 401) | 100    | 15 min    | `RATE_LIMIT_LOGIN_FAILURES_PER_15_MIN` |
| `POST /orders`     | `accountId` del token              | Toda petición autenticada          | 30     | 1 min     | `RATE_LIMIT_ORDERS_PER_MINUTE`         |
| `POST /orders`     | `accountId` del token              | Toda petición autenticada          | 1.000  | 1 día UTC | `RATE_LIMIT_ORDERS_PER_DAY`            |

- **Respuesta**: 429 con `{ "error": { "code": "rate_limited", "message" } }` y la cabecera
  `Retry-After` en segundos hasta el fin de la ventana. El código está en el contrato v2.
- **Login**: todo intento cuenta desde que entra al handler, de forma atómica, y si sale bien se
  descuenta. Así quedan contados solo los fallidos y una ráfaga simultánea no se salta el límite.
  El costo es que, en una ráfaga, los intentos en curso ocupan cupo durante unos milisegundos. Un
  cuerpo que Fastify rechaza antes del handler (JSON inválido) responde 400 y no cuenta; es barato
  porque no llega a la base. Con el límite agotado, la IP recibe 429 en todo login hasta el fin de
  la ventana, aunque traiga un código válido. Un login exitoso no reinicia el contador: si lo
  hiciera, un participante podría alternar su código con intentos al azar. Una IPv6 se agrupa por
  su prefijo /64: quien controla una /64 podría estrenar dirección en cada intento. Los códigos tienen unos 49 bits
  (`enrollment-code.ts`): con 100 intentos cada 15 minutos, la probabilidad de que una IP acierte
  alguno de 800 códigos en 30 días es de unos 3 × 10⁻⁷. Los 100 dejan margen para los errores de
  tipeo de muchos asistentes detrás de una misma IP (wifi del evento, CGNAT).
- **Órdenes**: cuentan las ejecutadas, las rechazadas por el motor, las repetidas por
  `clientOrderId` y las mal formadas. Una petición sin sesión (401) no cuenta. Lo que se niega por
  límite no toca la base ni la cola de la cuenta. Una petición negada por el límite de un minuto
  no gasta el cupo del día. El tope diario limita el peor caso de la base a 800 × 1.000 × 30 =
  24 millones de órdenes.
- **Redis caído**: la petición pasa (fail-open) y queda un warning en el log, como máximo uno cada
  10 s. Sin Redis tampoco hay
  precios, así que una orden igual se rechaza con `no_price`.
- **Proxy**: detrás de Caddy, `API_TRUST_PROXY` debe tener la IP o la subred del proxy. Sin eso,
  todas las peticiones llegan con la IP de Caddy y el límite de login se vuelve global. Solo se
  lee `X-Forwarded-For` de las direcciones de esa lista: un cliente directo no puede falsear su IP.

## 12. Fuera de V0

Órdenes limit y stop, stop loss y take profit, cortos, margen, stop-out, comisiones y horarios de
mercado por activo. Cada uno requiere una versión nueva del contrato y de este documento.
