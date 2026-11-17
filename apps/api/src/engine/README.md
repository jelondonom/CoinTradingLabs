# engine/

Responsable: **Agente Backend Motor de Trading**.

Motor de trading: ejecución de órdenes, P&L, saldo y equity. Solo funciones puras: reciben estado
y devuelven resultado. Aquí no se toca red, base de datos, Redis ni reloj del sistema.

Las reglas que implementa están en `docs/engine-rules.md`. Todo cálculo usa `decimal.js`; nunca
`number` para dinero, precios o cantidades.
