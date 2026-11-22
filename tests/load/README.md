# tests/load/

Escenarios de k6 del Agente QA. **Solo corren contra staging o en local.** Nunca contra
producción ni contra terceros: el escenario se niega a arrancar con otra URL.

k6 es un binario aparte, no una dependencia de npm: <https://grafana.com/docs/k6/latest/set-up/install-k6/>.

| Escenario          | Qué mide                                                      | Estado                                                                                                       |
| ------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ws-market-500.js` | 500 conexiones a `/ws/market` durante 2 horas, con reconexión | En local, pasa (2026-11-22, 15 min): [`docs/qa/k6-ws-local.md`](../../docs/qa/k6-ws-local.md). Falta staging |

Prueba corta en local, con `pnpm dev` arriba:

```bash
k6 run -e WS_URL=ws://localhost:3001/ws/market -e VUS=50 -e RAMP_S=10 -e HOLD_S=60 tests/load/ws-market-500.js
```

Corrida local de 500 conexiones, como la del reporte (unos 17 min):

```bash
k6 run --summary-export k6-500.json -e WS_URL=ws://localhost:3001/ws/market -e VUS=500 -e RAMP_S=120 -e HOLD_S=900 tests/load/ws-market-500.js
```

Corrida completa del criterio Go/No-Go, contra staging:

```bash
k6 run -e WS_URL=wss://staging.<dominio>/ws/market tests/load/ws-market-500.js
```

Pendiente (fase 2): ráfagas de órdenes contra `POST /orders` y confirmación en menos de 200 ms
(p95).
