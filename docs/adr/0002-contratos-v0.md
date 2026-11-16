# ADR-0002: Convenciones de los contratos V0

- Estado: aceptada
- Fecha: 2026-11-16

## Contexto

Los cuatro módulos (motor de trading, datos de mercado, frontend y QA) necesitan un contrato común
antes de empezar a construir en paralelo. Supuestos V0 del Gerente: saldo inicial de 100.000 USD,
apalancamiento 1:1 sin margen ni stop-out, solo órdenes market de compra y venta, y seis símbolos
(BTCUSD, ETHUSD, AAPL, NVDA, EURUSD, XAUUSD).

## Opciones consideradas

- Números: `number` de JavaScript o cadenas decimales en el cable.
- Tiempo: epoch en milisegundos o cadenas ISO 8601.
- Mensajes WebSocket: unión discriminada por `type` o un canal por tipo de evento.

## Decisión

- Los contratos viven en `packages/shared` como esquemas Zod; los tipos se infieren de ellos.
- Precios, cantidades y dinero viajan como `number`. En Postgres se guardan como `Decimal` y el
  motor de trading es el único responsable del redondeo, según `pricePrecision` y
  `quantityPrecision` de cada instrumento.
- Las marcas de tiempo son milisegundos desde epoch, en UTC.
- Todo cotiza en USD, igual que la cuenta: en V0 no hay conversión de moneda.
- Una compra market se ejecuta al `ask`; una venta market, al `bid`.
- `Order.type` solo admite `market`. Estados: `pending`, `filled`, `rejected`.
- `Position.side` admite `long` y `short`. Que los cortos se habiliten en V0 lo decide el motor.
- Velas en intervalos `1m`, `5m`, `15m`, `1h` y `1d`.
- Mensajes WebSocket como uniones discriminadas por `type`, validadas en ambos extremos:
  - Mercado (`/ws/market`, público): `subscribe`, `unsubscribe`, `ping` → `tick`, `candle`,
    `subscribed`, `pong`, `error`.
  - Cuenta (`/ws/account`, privado): `auth`, `ping` → `account.snapshot`, `account.update`,
    `order.update`, `position.update`, `position.closed`, `pong`, `error`.
- `CONTRACT_VERSION = 0`. Un cambio incompatible sube la versión y se avisa a los agentes afectados.

## Consecuencias

- `number` simplifica las gráficas y el flujo de ticks, pero obliga a redondear en un solo lugar.
  Si QA encuentra diferencias de centavos en el ranking, se revisa pasar el dinero a cadenas
  decimales.
- La autenticación queda fuera de V0: el mensaje `auth` reserva el campo `token` y la API responde
  `not_implemented`.
- Límite, stop, margen y stop-out no existen en el contrato; agregarlos requiere una versión nueva.
