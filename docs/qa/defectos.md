# Defectos reportados por QA

- Responsable: Agente QA + Seguridad.
- Un defecto Crítico o Alto abierto bloquea el Go.
- QA no corrige: reporta con pasos para reproducir. Un defecto se cierra solo después de volver
  a probarlo.

| ID      | Severidad | Módulo | Estado  | Título                                               |
| ------- | --------- | ------ | ------- | ---------------------------------------------------- |
| DEF-001 | Alta      | Motor  | Abierto | El redondeo a centavos por orden crea dinero         |
| DEF-002 | Media     | Motor  | Abierto | Un tick con fecha futura nunca se considera obsoleto |

Probado el 2026-11-16 sobre la rama `feat/api-engine-v0` (commit `9dc48f8`). Vuelto a probar el
mismo día sobre `main` (commit `ed77101`), ya con el motor integrado: los dos siguen abiertos.

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

## Cómo se cierra un defecto

1. El responsable corrige. El caso `it.fails` correspondiente se pone en rojo.
2. QA vuelve a probar, quita `it.fails` para que el caso quede como test normal y actualiza la
   tabla de este archivo.
