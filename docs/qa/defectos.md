# Defectos reportados por QA

- Responsable: Agente QA + Seguridad.
- Un defecto Crítico o Alto abierto bloquea el Go.
- QA no corrige: reporta con pasos para reproducir. Un defecto se cierra solo después de volver
  a probarlo.

| ID      | Severidad | Módulo | Estado               | Título                                               |
| ------- | --------- | ------ | -------------------- | ---------------------------------------------------- |
| DEF-001 | Alta      | Motor  | Cerrado (2026-11-18) | El redondeo a centavos por orden crea dinero         |
| DEF-002 | Media     | Motor  | Cerrado (2026-11-18) | Un tick con fecha futura nunca se considera obsoleto |
| DEF-003 | Media     | API    | Abierto              | Una cantidad fuera de `DECIMAL(28,8)` responde 500   |
| DEF-004 | Baja      | API    | Abierto              | El login no aplica el esquema del contrato v2        |

Probado el 2026-11-16 sobre la rama `feat/api-engine-v0` (commit `9dc48f8`). Vuelto a probar el
mismo día sobre `main` (commit `ed77101`), ya con el motor integrado: los dos seguían abiertos.
Vueltos a probar el 2026-11-18 sobre la rama `qa/cierre-def-001-def-002`, que reúne la corrección
de DEF-001 (`37fc65a`, ajustada al contrato v2 en `11bb4c5`), la de DEF-002 (`0fc8d0f`, ya en
`main`) y `main` al día: los dos se cierran. Detalle en la sección "Cierre" de cada uno.

DEF-003 y DEF-004 se probaron el 2026-11-21 sobre `main` en `4d12094`.

## DEF-001: el redondeo a centavos por orden crea dinero

- **Severidad**: Alta. Permite subir el retorno sin riesgo de mercado, así que afecta el ranking.
- **Responsable de corregir**: Agente Backend. La regla la decide el Gerente.
- **Dónde**: `apps/api/src/engine/market-order.ts`, cálculo de `notional`
  (`docs/engine-rules.md`, sección 4).

**Pasos**

1. Cuenta nueva con 100.000,00 USD. TRXUSD con `bid = ask = 0,2849`.
2. Enviar 1.000 compras de 1 TRX. Cada una cuesta `1 × 0,2849 = 0,2849`, que se redondea a 0,28.
3. Vender los 1.000 TRX en una sola orden: `1.000 × 0,2849 = 284,90`.

**Resultado esperado**: el saldo final no supera 100.000,00. Comprar y vender al mismo precio no
puede dar ganancia.

**Resultado real**: saldo final de 100.004,90. Con un spread de un tick (`bid = 0,2848`,
`ask = 0,2849`) el saldo final es 100.004,80: el spread no compensa el redondeo.

**Evidencia**: `tests/properties/engine-defects.test.ts`, dos casos marcados con `it.fails`: el
caso concreto de arriba y una propiedad general (a precio fijo, ninguna secuencia de órdenes sube
el equity).

**Alcance**

- Cada orden puede ganar hasta medio centavo. No depende del símbolo: basta elegir una cantidad
  cuyo monto termine por debajo de la mitad del centavo.
- La ganancia crece con el número de órdenes: 200.000 órdenes dan hasta 1.000 USD, un 1 % de
  retorno. Es una estimación a partir del caso medido, no una medición.
- Hoy nada lo frena: `POST /orders` no tiene límite de peticiones ni monto mínimo por orden. La
  ventana de 30 días da tiempo de sobra a un script.

**Opciones para el Gerente** (no las implementa QA): monto mínimo por orden, redondear siempre
en contra del participante (compra hacia arriba, venta hacia abajo), una comisión mínima por
orden, o un límite de órdenes por cuenta. El límite solo reduce el daño; no lo elimina.

**Cierre** (2026-11-18)

- Regla del Gerente (D-01): la compra redondea el monto hacia arriba al centavo y la venta hacia
  abajo; una orden de menos de 10 USD se rechaza con `below_minimum`, salvo la venta que cierra
  toda la posición. Corrección del Backend en `37fc65a` (`docs/engine-rules.md` §4 y §5).
- El caso original ya no sirve para probar el redondeo: el mínimo rechaza cada compra de
  0,2849 USD. Se queda como prueba del mínimo: las 1.000 compras dan `below_minimum` y el saldo
  sigue en 100.000,00.
- Caso que sí distingue el redondeo: 100 compras de 37 TRX a 0,2849 (10,5413 c/u) y una venta de
  3.700. Con el motor corregido cada compra cuesta 10,55 y el saldo final es 99.999,13. Con el
  motor viejo (`main` en `6325ade`) el mismo caso da 100.000,13.
- Propiedad general (a precio fijo, ninguna secuencia sube el equity): 500 corridas en verde. La
  guardia G2 confirma que ejecuta órdenes: 1.113 compras y 543 ventas, y 529 `below_minimum`.
- Propiedades E2 (techo y piso), E4 (un ciclo cuesta el spread más menos de 2 centavos) y R1
  (orden de los rechazos con `below_minimum`) en verde. G1: 125 `below_minimum`.
- Desde `11bb4c5` el motor lee el mínimo de `MIN_ORDER_USD` (`@coin/shared`) y la API responde
  `below_minimum` tal cual (`toPublicRejectReason` en `apps/api/src/modules/dto.ts` y su test).

## DEF-002: un tick con fecha futura nunca se considera obsoleto

- **Severidad**: Media. Necesita un tick mal fechado o relojes desalineados; un participante no
  puede provocarlo por sí solo.
- **Responsable de corregir**: Agente Backend, con Datos de Mercado.
- **Dónde**: `apps/api/src/engine/market-order.ts`, condición `now − tick.ts > staleAfterMs`.

**Pasos**

1. Cuenta nueva. Tick válido con `ts` una hora después de la hora del servidor.
2. Enviar una compra market válida.

**Resultado esperado**: orden rechazada. Un tick del futuro no es un precio confiable.

**Resultado real**: la orden se ejecuta. Como `now − tick.ts` es negativo, ese tick sigue
sirviendo para ejecutar órdenes durante la hora siguiente más el umbral, aunque el feed se caiga.

**Evidencia**: `tests/properties/engine-defects.test.ts`, caso `DEF-002`, marcado con `it.fails`.

**Cierre** (2026-11-18)

- Regla del Gerente (D-11): un tick con fecha más de 2 s posterior a la hora del servidor es
  obsoleto. Corrección del Backend en `0fc8d0f` (PR #10), que también pasó el `it.fails` a `it`
  por orden del Gerente.
- Tick fechado 1 h en el futuro: `stale_price` en 500 corridas.
- Bordes de D-11: +2.000 ms se ejecuta y +2.001 ms da `stale_price`, en 500 corridas.
- El arnés modela ahora los ticks del futuro: R1 y R2 los incluyen. G1: 155 órdenes ejecutadas
  con ticks de hasta 2 s en el futuro y 135 rechazadas con `stale_price` por venir de más de 2 s.

## DEF-003: una cantidad fuera de `DECIMAL(28,8)` responde 500

- **Severidad**: Media. Cualquier participante provoca un 500 a voluntad y el intento no queda en
  `orders` ni en `audit_logs` (la transacción se revierte): se pierde la evidencia de la conducta 5
  del reglamento. No mueve dinero.
- **Responsable de corregir**: Agente Backend (el contrato acepta cualquier número positivo y finito).
- **Dónde**: `apps/api/src/modules/orders/place-order.ts:128`, `tx.order.create()` de la orden
  rechazada. La columna `orders.quantity` es `DECIMAL(28,8)` con `CHECK quantity > 0`.

**Pasos**

1. Cuenta nueva con sesión válida y un tick de BTCUSD.
2. `POST /orders` con `{"symbol":"BTCUSD","side":"buy","type":"market","quantity":1e-30,
"clientOrderId":"<uuid>"}`. Repetir con `4e-9`, `1e20` y `1e21`.

**Resultado esperado**: 4xx, u orden rechazada con su motivo. Nunca 500.

**Resultado real**: 500 `internal` en los cuatro casos. `1e-30` y `4e-9` se redondean a 0 y violan
el CHECK; `1e20` y `1e21` desbordan la columna. Con `0.01` y `6e-9` responde 201.

**Evidencia**: `tests/security/def-003.integration.test.ts`, caso `DEF-003` con `it.fails`, contra
Postgres (corre en el CI).

## DEF-004: el login no aplica el esquema del contrato v2

- **Severidad**: Baja. Solo cambia 400 por 401 en códigos con espacios alrededor.
- **Responsable de corregir**: Agente Backend, con el login de D-04.
- **Dónde**: `apps/api/src/modules/routes.ts:16`, esquema propio `z.string().min(4).max(64)` sin
  trim, en lugar de `loginRequestSchema` de `@coin/shared`.

**Pasos**

1. `POST /auth/login` con `{"code":"  ab  "}`.
2. `POST /auth/login` con un código de 5 caracteres y 30 espacios a cada lado.

**Resultado esperado**: el paso 1 se rechaza con 400 (sin espacios tiene 2 caracteres); el paso 2
pasa la validación (sin espacios tiene 5).

**Resultado real**: el paso 1 pasa la validación y llega a la base; el paso 2 se rechaza con 400.

**Evidencia**: `tests/security/api-conformance.test.ts`, caso `DEF-004` con `it.fails`, sin Postgres.

## Cómo se cierra un defecto

1. El responsable corrige. El caso `it.fails` correspondiente se pone en rojo.
2. QA vuelve a probar, quita `it.fails` para que el caso quede como test normal y actualiza la
   tabla de este archivo.
3. El caso se queda en `tests/` como prueba de regresión.
