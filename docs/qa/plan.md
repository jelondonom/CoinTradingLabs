# Plan de pruebas de COIN Trading Labs

- Responsable: Agente QA + Seguridad. Reporta al Gerente General.
- Versión: 1, del 2026-11-16. Escrito sobre la rama `feat/api-engine-v0` (commit `9dc48f8`).
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
| R1  | Dinero creado o perdido por redondeo                        | P0        | Propiedades sobre el motor            | **DEF-001 abierto**             |
| R2  | El saldo no coincide con el libro contable                  | P0        | Propiedades; SQL sobre Postgres       | Motor en verde; base pendiente  |
| R3  | El ranking mostrado no coincide con el reconstruido         | P0        | `pnpm audit:leaderboard`              | Sin ranking todavía             |
| R4  | Órdenes ejecutadas a un precio obsoleto o que nadie publicó | P0        | Propiedades; resiliencia del feed     | **DEF-002 abierto**             |
| R5  | Una cuenta lee o modifica datos de otra                     | P0        | `tests/security/`                     | Pendiente                       |
| R6  | Órdenes duplicadas por reintentos o concurrencia            | P0        | Integración con Postgres; ráfagas k6  | Pendiente                       |
| R7  | Caída o degradación con 500 usuarios                        | P0        | k6: WebSocket y ráfagas de órdenes    | Escenario listo, sin ejecutar   |
| R8  | Multicuentas y cuentas coordinadas                          | P0        | Señales en `tests/audit/`; reglamento | Reglamento en borrador          |
| R9  | Sin límite de peticiones en login ni en órdenes             | P1        | `tests/security/`; k6                 | Por verificar                   |
| R10 | Caída del feed: la pantalla y el motor se contradicen       | P1        | Resiliencia con feed simulado         | Pendiente                       |
| R11 | Pérdida de datos al reiniciar la API o restaurar la base    | P1        | Simulacro de restauración             | Sin respaldos todavía           |
| R12 | Sesión robada o compartida: token de 7 días sin revocación  | P1        | `tests/security/`                     | Por verificar                   |
| R13 | Explotar el gap al abrir la ventana de la competencia       | P1        | Propiedades con reloj controlado      | Parcial (R2 de las propiedades) |
| R14 | Flujo completo roto en móvil                                | P1        | Playwright con emulación de móvil     | Sin flujo de órdenes en la web  |
| R15 | Dependencias vulnerables                                    | P2        | `pnpm audit`                          | Pendiente                       |
| R16 | Cabeceras, CORS y TLS mal configurados                      | P2        | OWASP ZAP contra staging              | Sin staging                     |

### Riesgos vistos al leer el código, todavía sin probar

Son hipótesis. Ninguna es un defecto hasta que un test la confirme.

- `clientOrderId` es opcional: un reintento sin él duplica la orden (solicitud 2 del Backend).
- No hay límite de peticiones en `POST /auth/login` ni en `POST /orders`.
- El WebSocket de mercado es público y no limita conexiones ni suscripciones por cliente.
- La API responde `no_price` cuando el motivo real es `stale_price` (temporal, aprobado).
- El CI no tiene Postgres: los tests de integración de la API no corren (solicitud 8).
- No hay restricción única que impida dos posiciones abiertas del mismo símbolo en una cuenta;
  depende del bloqueo de la fila.
- `GET /account` valora con el último tick aunque sea obsoleto, sin avisarlo en la respuesta.

## 4. Pruebas por módulo

### 4.1 Motor de trading (Agente Backend)

- **Propiedades** (`tests/properties/`, hechas): 16 propiedades con `fast-check` sobre el motor
  real, con semilla fija. Cubren las invariantes 1 a 5 de `docs/engine-rules.md`, precio de
  ejecución, redondeo, orden de los rechazos y valoración.
- **Idempotencia y concurrencia** (pendiente): la invariante 6 vive en `place-order.ts` y
  necesita Postgres. Mismo `clientOrderId` repetido, en paralelo y desde dos procesos.
- **Reconciliación en base** (pendiente): consultas SQL en `tests/audit/` que comparan
  `ledger_entries` con `accounts.balance`, y `fills` con `positions`.

### 4.2 API y seguridad (Agente Backend)

- Autorización: un token nunca accede a otra cuenta; token vencido, alterado o firmado con otro
  secreto se rechaza.
- Entradas: cantidades negativas, cero, `NaN`, notación científica, precio enviado por el
  cliente, símbolo fuera de catálogo, cuerpo gigante.
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

| Criterio                                                 | Estado          |
| -------------------------------------------------------- | --------------- |
| 500 usuarios simulados 2 horas sin errores               | Sin probar      |
| Confirmación de orden en menos de 200 ms (p95) con carga | Sin probar      |
| Cero defectos Críticos o Altos abiertos                  | **No**: DEF-001 |
| Restauración de respaldo verificada                      | Sin probar      |
| Recuperación tras caída del feed verificada              | Sin probar      |
| Auditoría del ranking sin diferencias                    | Sin probar      |
| Simulacro con usuarios reales y hallazgos cerrados       | Sin fecha       |

## 6. Lo que QA necesita de cada agente

| De               | Qué                                                                                | Para         |
| ---------------- | ---------------------------------------------------------------------------------- | ------------ |
| Backend          | Corregir DEF-001 y DEF-002                                                         | R1, R4       |
| Backend          | Límite de peticiones en login y órdenes; ruta del ranking                          | R3, R9       |
| Datos de Mercado | Escritura de `last:{symbol}` en Redis y umbral de obsolescencia en una sola fuente | R4, R10      |
| Arquitecto       | Postgres en el CI; `clientOrderId` obligatorio y `stale_price` en el contrato      | R6           |
| Arquitecto       | Entorno de staging con datos sintéticos, k6 disponible y respaldos                 | R7, R11, R16 |
| Frontend         | Flujo de órdenes en la web y atributos `data-testid` estables                      | R14          |

## 7. Decisiones del Gerente

1. Regla contra el redondeo (DEF-001): monto mínimo, redondeo en contra, comisión o límite.
2. Reglamento del Challenge: conductas prohibidas y sanciones (ver el borrador).
3. Cómo se verifica una persona por cuenta.
4. Quién aprueba el ranking final antes de premiar.
5. Fecha y participantes del simulacro general, al menos dos semanas antes del congreso.

## 8. Reglas de trabajo de QA

- Los tests son deterministas: feed simulado, reloj controlado y semilla fija.
- Carga y escaneos corren solo en staging. Nunca en producción ni contra terceros.
- No se usan datos personales reales de asistentes.
- QA no modifica código de producto. Demuestra cada defecto con un test que falla.
