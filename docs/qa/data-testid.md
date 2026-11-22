# Lista de `data-testid` — V0.1

- Estado: **cerrada con el Frontend** el 2026-11-21. Incluye su lista de 16 nombres (Q1) con los 23
  que sumó QA y sus cuatro reglas, los tamaños de pantalla (Q2), sus cinco ajustes (Q3 a Q7) y sus
  tres precisiones (Q8 a Q10), aceptados por QA. Es la lista que aplica `apps/web` y la que usan las
  pruebas de `tests/e2e/`.
- QA mantiene esta lista; el Frontend la aplica. Un nombre, un atributo o un valor de `data-state` no
  se cambia ni se borra sin avisar a QA en el PR, para que QA actualice este archivo.
- Cuándo llegan a la web: los nombres de lo que ya existe, en la tarea F1 del Frontend; el resto, en
  la tarea de cada pantalla.
- Documentos hermanos: [`plan.md`](plan.md) (riesgo R14) y `docs/checklist-v0.md` (flujo completo).

## Reglas

1. El nombre es `<pantalla>-<elemento>`. En listas, `<pantalla>-row-<clave>`.
2. El símbolo va tal cual está en `SYMBOLS` de `@coin/shared`, en mayúsculas: `symbol-row-BTCUSD`.
   Los intervalos, tal cual `CANDLE_INTERVALS`: `chart-interval-5m`. Así las pruebas arman los
   nombres desde el contrato.
3. Los estados van en `data-state`, con los valores de las tablas de abajo. Nunca solo en el texto:
   el texto cambia con el idioma (`i18n`).
4. Los números llevan `data-value` con el número crudo que mandó el servidor, escrito con
   `String(n)`: sin redondeo, sin separador de miles, sin moneda y con `-` para los negativos (por
   ejemplo `100000`, `99987.65`, `-12.5`). Las pruebas lo leen con `Number()`, nunca como texto. El
   saldo y el P&L realizado salen tal cual del servidor y se comparan exactos con `GET /account`. La
   equity, el P&L no realizado y el P&L de cada posición los recalcula el cliente con cada tick
   (ADR-0004): se comparan con el feed simulado con semilla o con una tolerancia.
5. `data-error-code` lleva el código exacto que mandó el servidor, aunque no esté en el contrato
   (hoy llega `invalid_request` en vez de `validation_error`, hasta la tarea 3 del Backend), y
   `network` si no hubo respuesta (es un código del cliente, no de la API). Va en `ticket-result`,
   en `login-error` y en `history-row` rechazada. En el ingreso, un código inválido llega como
   `unauthorized` (401) y demasiados intentos como `rate_limited` (429).
6. Cada `data-testid` existe **una sola vez en el DOM**. El Frontend quita en F1 las copias dobles de
   hoy: la cabecera del símbolo (un botón para celular y un texto para escritorio, en `app.tsx`) y
   las pestañas de posiciones e historial (en `app.tsx` y en `positions-panel.tsx`). Los elementos
   de una vista cerrada siguen en el DOM, ocultos: las pruebas abren la vista antes de usarlos.
7. Los botones que ya marcan su estado con `aria-pressed` o `aria-current` lo conservan: las pruebas
   los leen.

## Nombres por pantalla

La columna "Propuso" dice de quién vino el nombre: de la lista del Frontend (Q1), de QA o de las
propuestas de seguimiento del Frontend (Q6, Q7).

### Ingreso

| `data-testid`  | Qué es                       | Atributos         | Propuso                         |
| -------------- | ---------------------------- | ----------------- | ------------------------------- |
| `login-code`   | Campo del código             | —                 | Frontend                        |
| `login-submit` | Botón "Entrar"               | —                 | Frontend                        |
| `login-error`  | Mensaje de error del ingreso | `data-error-code` | Frontend (el atributo es de QA) |

### Cabecera

| `data-testid`   | Qué es                                    | Atributos    | Propuso |
| --------------- | ----------------------------------------- | ------------ | ------- |
| `header-symbol` | Símbolo elegido; en celular abre la lista | —            | QA      |
| `header-price`  | Precio del símbolo elegido                | `data-value` | QA      |

### Navegación de celular (360 px)

Hoy solo existe en celular: el escritorio todavía no tiene vistas de ranking ni de cuenta.

| `data-testid`                                               | Qué es                       | Atributos                          | Propuso |
| ----------------------------------------------------------- | ---------------------------- | ---------------------------------- | ------- |
| `nav-terminal`, `nav-markets`, `nav-ranking`, `nav-account` | Botones de la barra inferior | `aria-current="page"` en el activo | QA      |
| `tab-trade`, `tab-positions`, `tab-history`                 | Pestañas del panel           | `aria-pressed`                     | QA      |

### Símbolos

| `data-testid`             | Qué es                    | Atributos                                                | Propuso                          |
| ------------------------- | ------------------------- | -------------------------------------------------------- | -------------------------------- |
| `symbols-search`          | Buscador de la lista      | —                                                        | QA                               |
| `symbol-row-<símbolo>`    | Fila de un símbolo        | —                                                        | Frontend                         |
| `symbol-price-<símbolo>`  | Precio en la fila         | `data-value`                                             | QA                               |
| `symbol-status-<símbolo>` | Estado del símbolo (D-05) | `data-state`: `live`, `stale`, `no-price`, `unavailable` | Frontend (`data-state` es de QA) |

### Gráfica

| `data-testid`                | Qué es                                                     | Atributos                                                                                                  | Propuso                      |
| ---------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `chart`                      | Contenedor de la gráfica                                   | `data-state`: `building`, `ready` (`ready` = al menos 2 velas); `data-interval` con la temporalidad activa | QA (atributos: Frontend, Q6) |
| `chart-interval-<intervalo>` | Botón de temporalidad: `1m`, `5m`, `15m`, `1h`, `4h`, `1d` | `aria-pressed`                                                                                             | Frontend                     |

### Ticket

| `data-testid`          | Qué es                                           | Atributos                                               | Propuso                            |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------- | ---------------------------------- |
| `ticket-amount`        | Campo del monto en USD                           | —                                                       | Frontend                           |
| `ticket-quick-<monto>` | Botón de monto rápido: hoy `100`, `1000`, `5000` | `aria-pressed`                                          | QA                                 |
| `ticket-estimate`      | Cantidad estimada                                | `data-value`                                            | QA                                 |
| `ticket-status`        | Por qué el ticket está o no habilitado           | `data-state`: `ready`, `offline`, `stale`, `engine-off` | QA                                 |
| `ticket-buy`           | Botón "Comprar"                                  | —                                                       | Frontend                           |
| `ticket-sell`          | Botón "Vender"                                   | —                                                       | Frontend (Q6)                      |
| `ticket-confirm`       | Botón "Confirmar" de la ventana de confirmación  | —                                                       | Frontend                           |
| `ticket-cancel`        | Botón "Cancelar" de la ventana de confirmación   | —                                                       | QA                                 |
| `ticket-result`        | Mensaje de resultado de la orden                 | `data-state`: `success`, `error`; `data-error-code`     | Frontend (los atributos son de QA) |

Los valores de `ticket-status` pueden cambiar en la tarea F6 del Frontend (quitar `engine-off` y
sumar `no-price`, `unavailable`, `below-minimum` y `sending`). El Frontend lo avisa en ese PR y QA
actualiza esta tabla.

### Cuenta

| `data-testid`          | Qué es        | Atributos    | Propuso  |
| ---------------------- | ------------- | ------------ | -------- |
| `account-balance`      | Saldo         | `data-value` | Frontend |
| `account-equity`       | Equity        | `data-value` | Frontend |
| `account-realized-pnl` | P&L realizado | `data-value` | QA       |

Llegan con la tarea de la cuenta del Frontend, con datos del servidor. Hoy la barra de arriba
muestra el saldo inicial fijo (100.000), no el real: ninguna prueba debe depender de esa barra.

### Posiciones

| `data-testid`              | Qué es                         | Atributos    | Propuso  |
| -------------------------- | ------------------------------ | ------------ | -------- |
| `position-row-<símbolo>`   | Fila de una posición abierta   | —            | Frontend |
| `position-pnl-<símbolo>`   | P&L de esa posición            | `data-value` | Frontend |
| `position-close-<símbolo>` | Botón "Cerrar" de esa posición | —            | Frontend |
| `positions-empty`          | Mensaje de "sin posiciones"    | —            | QA       |

### Historial

| `data-testid` | Qué es                                      | Atributos                                                                            | Propuso |
| ------------- | ------------------------------------------- | ------------------------------------------------------------------------------------ | ------- |
| `history-row` | Una fila por orden, la más reciente primero | `data-order-id`; `data-state`: `filled`, `rejected`; `data-error-code` si se rechazó | QA      |

`data-order-id` lleva `Order.id`, el UUID que asigna el servidor (Q8): siempre existe, mientras que
`clientOrderId` puede venir `null` en órdenes anteriores al contrato v2. El historial solo muestra
órdenes guardadas; un rechazo sin orden guardada (422, por ejemplo una cantidad que no cabe en la
base) no aparece en el historial: se ve en `ticket-result`.

### Ranking

| `data-testid`          | Qué es                                                     | Atributos                          | Propuso                     |
| ---------------------- | ---------------------------------------------------------- | ---------------------------------- | --------------------------- |
| `ranking-row-<puesto>` | Fila del ranking (`ranking-row-1`)                         | `data-me="true"` en la del usuario | QA (atributo: Frontend, Q7) |
| `ranking-me`           | Fila aparte, fija, con el puesto del usuario ("Tu puesto") | —                                  | QA (forma: Frontend, Q7)    |

Una fila no puede tener dos `data-testid`: por eso la del usuario dentro de la tabla se marca con
`data-me="true"` y `ranking-me` es una fila aparte. El detalle se cierra en la tarea del ranking.

### Conexión y sesión

| `data-testid`       | Qué es                                                 | Atributos                                          | Propuso                          |
| ------------------- | ------------------------------------------------------ | -------------------------------------------------- | -------------------------------- |
| `connection-status` | Pastilla de conexión                                   | `data-state`: `connecting`, `live`, `reconnecting` | Frontend (`data-state` es de QA) |
| `connection-banner` | Aviso de reconexión; solo existe mientras se reconecta | —                                                  | QA                               |
| `logout`            | Botón "Salir" (pruebas de sesión, fase 2)              | —                                                  | QA                               |

Los valores de `connection-status` son exactamente los de `ConnectionStatus` en
`apps/web/src/stores/market-store.ts`.

## Flujo completo: guía del E2E

El flujo del checklist, paso a paso, con los nombres que usa cada uno. En celular, la prueba cambia
de vista con `nav-*` y `tab-*` antes de cada paso.

| Paso                                             | Qué hace la prueba                                                                                                   | Nombres                                                                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Entrar con el código                          | Escribe el código y entra. Si falla, lee el motivo                                                                   | `login-code`, `login-submit`, `login-error`                                                                                            |
| 2. Ver la gráfica con historial y precio en vivo | Elige el símbolo, espera la gráfica lista y la conexión en vivo, cambia de temporalidad y ve que el precio cambia    | `header-symbol` o `symbols-search`, `symbol-row-<símbolo>`, `chart`, `chart-interval-<intervalo>`, `connection-status`, `header-price` |
| 3. Comprar por monto                             | Pone el monto, compara la estimación, confirma y lee el resultado. Caso de error: menos de 10 USD da `below_minimum` | `ticket-amount` o `ticket-quick-<monto>`, `ticket-estimate`, `ticket-status`, `ticket-buy`, `ticket-confirm`, `ticket-result`          |
| 4. Ver la posición con P&L vivo                  | Encuentra la posición y ve cambiar su P&L                                                                            | `position-row-<símbolo>`, `position-pnl-<símbolo>`                                                                                     |
| 5. Cerrar                                        | Cierra la posición y ve que desaparece y que queda en el historial                                                   | `position-close-<símbolo>`, `positions-empty`, `history-row`                                                                           |
| 6. Saldo y P&L realizado                         | Compara saldo, equity y P&L realizado con `GET /account`                                                             | `account-balance`, `account-equity`, `account-realized-pnl`                                                                            |
| 7. Aparecer en el ranking                        | Abre el ranking y encuentra su fila                                                                                  | `ranking-me`, `ranking-row-<puesto>` con `data-me="true"`                                                                              |

La venta parcial (`ticket-sell`) es un caso aparte del flujo (`docs/qa/plan.md` §4.4).

**Monto menor al mínimo (Q9).** Lo decide la tarea F6 del Frontend:

- Si el ticket bloquea en el cliente una compra que no llega a 10 USD (`MIN_ORDER_USD` de
  `@coin/shared`, sin copias), la prueba lee `ticket-status` con `data-state="below-minimum"` y el
  botón deshabilitado. El rechazo del servidor se prueba entonces directo contra la API.
- El bloqueo conviene calcularlo con el monto estimado, no con el monto escrito: el servidor redondea
  la cantidad hacia abajo (D-09), así que 10 USD de BTCUSD a 60.010 compran 0,00016 BTC, que cuestan
  9,61 USD, y el servidor responde `below_minimum`.
- Como el precio puede moverse entre la estimación y la orden, la prueba conserva siempre el caso del
  servidor: `ticket-result` con `data-error-code="below_minimum"`.

**Si el feed cae (Q10).** Son dos casos distintos:

| Caso                                   | Qué pasa                                                  | Qué lee la prueba                                                                                                                                                                                                                                         |
| -------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Se cae el WebSocket de mercado      | El navegador pierde la conexión y reintenta               | `connection-status` con `data-state="reconnecting"`, `connection-banner` visible y `ticket-status` con `data-state="offline"`. Qué muestra `symbol-status` mientras no hay conexión lo define la tarea F8 del Frontend; QA prefiere que no siga en `live` |
| B. El proveedor deja de mandar precios | La conexión sigue viva y llega `status` con `stale: true` | `symbol-status-<símbolo>` y `ticket-status` con `data-state="stale"`; sin `connection-banner`                                                                                                                                                             |

## Tamaños de pantalla

| Proyecto de Playwright | Tamaño   | Detalle                                                           |
| ---------------------- | -------- | ----------------------------------------------------------------- |
| Celular                | 360×740  | Chromium, pantalla táctil (`isMobile`, `hasTouch`)                |
| Escritorio             | 1280×800 | Chromium                                                          |
| Celular WebKit         | 360×740  | Fase 2: la cookie del login (D-04) se comporta distinto en WebKit |

Los acordó el Frontend (Q2) y coinciden con el checklist: "El flujo funciona en celular (360 px) y en
escritorio". Si las pruebas corren contra `vite preview` (puerto 4173), `API_ALLOWED_ORIGINS` de la
API tiene que incluir ese origen.
