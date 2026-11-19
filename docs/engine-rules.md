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
- **Dinero**: todo monto se redondea a centavos (2 decimales) con redondeo al más cercano, y la
  mitad hacia arriba (`ROUND_HALF_UP`).
- **Monto de una ejecución** (`notional`): `cantidad × precio`, redondeado a centavos. Es el
  único valor que mueve el libro contable.

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
| 6     | Compra: `notional > saldo`                                                | `insufficient_funds`    |
| 7     | Venta: no hay posición abierta o `cantidad > cantidad de la posición`     | `insufficient_position` |

Notas:

- **Mercado cerrado**: en V0 no hay horarios por tipo de activo, porque los precios de acciones y
  materias primas vienen de contratos que cotizan todos los días a toda hora.
- **Precio obsoleto**: el motor usa el mismo umbral por símbolo que `market-data` (30 segundos por
  defecto), leído de una sola fuente, para que la pantalla y el motor nunca se contradigan.
- **Tick del futuro** (D-11, DEF-002): un tick con fecha más de 2 segundos posterior a la hora del
  servidor también es obsoleto (`MAX_FUTURE_SKEW_MS`). Los 2 segundos toleran relojes un poco
  desalineados; sin este límite, un tick mal fechado seguiría sirviendo aunque el feed se caiga.
- **Idempotencia**: si llega una orden con un `clientOrderId` que la cuenta ya usó, se devuelve la
  orden original sin ejecutar nada.

## 6. Efecto de una ejecución

### Compra

1. `notional = redondear(cantidad × ask)`.
2. Asiento contable `trade_buy` por `−notional`. El saldo baja en `notional`.
3. Posición: si no hay una abierta, se crea. Luego `quantity += cantidad` y
   `costBasis += notional`.
4. `avgEntryPrice = costBasis / quantity`.
5. P&L realizado del fill: 0.

### Venta

Sea `Q` la cantidad de la posición antes de vender y `q` la cantidad vendida.

1. `notional = redondear(q × bid)`.
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

| N.º | Solicitud                                                                                                    | Afecta a         |
| --- | ------------------------------------------------------------------------------------------------------------ | ---------------- |
| 1   | Agregar `stale_price` a `orderRejectReasonSchema`                                                            | Frontend, QA     |
| 2   | Volver obligatorio `clientOrderId` en `placeOrderRequestSchema`                                              | Frontend, QA     |
| 3   | Definir con Datos de Mercado la llave y el formato del último tick en Redis (propuesta: `last:{symbol}`)     | Datos de Mercado |
| 4   | Publicar el umbral de precio obsoleto por símbolo en un lugar que el motor pueda leer                        | Datos de Mercado |
| 5   | Confirmar que una posición larga se valora al `bid`. El comentario de `tickSchema` dice que `last` valora    | Frontend         |
| 6   | Confirmar `quantityPrecision` del catálogo: el motor acepta los valores actuales de `INSTRUMENTS` sin cambio | Datos de Mercado |

| 7 | Mover al contrato el login (`POST /auth/login`), la respuesta de `GET /account` y el formato de error | Frontend, QA |
| 8 | Agregar Postgres al CI para que corran los tests de integración de la API | QA |

Hasta que la solicitud 1 esté en el contrato, la base de datos guarda `stale_price` y la API
responde `no_price` de forma temporal (aprobado por el Gerente el 2026-11-16). La conversión está
en un solo lugar: `toPublicRejectReason`, en `apps/api/src/modules/dto.ts`.

## 11. API REST V0

Todas las respuestas de error tienen la forma `{ "error": { "code", "message" } }`, con los
códigos `invalid_request` (400), `unauthorized` (401), `not_found` (404) e `internal` (500).

| Ruta               | Sesión | Qué hace                                                             |
| ------------------ | ------ | -------------------------------------------------------------------- |
| `POST /auth/login` | No     | Recibe `{ code }` y devuelve `{ token, expiresAt, accountId }`       |
| `POST /orders`     | Sí     | Recibe `placeOrderRequestSchema` y devuelve la orden (`orderSchema`) |
| `GET /account`     | Sí     | Devuelve `{ account, positions }` con las posiciones abiertas        |

- **Ingreso**: un código de inscripción por asistente, sin contraseña (aprobado por
  el Gerente el 2026-11-16). El código no distingue mayúsculas, espacios ni guiones. La base
  guarda solo su SHA-256.
- **Sesión**: cabecera `Authorization: Bearer <token>`. El token dura 7 días por defecto
  (`AUTH_TOKEN_TTL_HOURS`) y se firma con `AUTH_TOKEN_SECRET`.
- **`POST /orders`** responde 201 con la orden, ejecutada o rechazada. Una orden rechazada no es
  un error HTTP: llega con `status = rejected` y su `rejectReason`. Si el `clientOrderId` ya se
  usó, responde 200 con la orden original.
- Un campo que el cliente no debe enviar (por ejemplo `price`) se ignora.

## 12. Fuera de V0

Órdenes limit y stop, stop loss y take profit, cortos, margen, stop-out, comisiones y horarios de
mercado por activo. Cada uno requiere una versión nueva del contrato y de este documento.
