# k6: 500 WebSocket de mercado en local — V0.1

- Responsable: Agente QA + Seguridad. Medido el 2026-11-22 entre las 01:05 y las 01:22 (hora local),
  con el código de `main` en `3a92b66` (apps y escenario; la rama de este reporte solo suma
  documentación). El detalle del criterio Go/No-Go está en `plan.md` §5: en local, 15 min sin
  errores; las 2 horas quedan para staging.
- Escenario: [`tests/load/ws-market-500.js`](../../tests/load/ws-market-500.js). Cada conexión se
  suscribe a 6 símbolos (BTCUSD, ETHUSD, AAPL, NVDA, XAUUSD, EURUSD), manda un `ping` cada 15 s, y a
  los 10 min se cierra y se vuelve a abrir.
- Equipo: AMD Ryzen 7 260 (16 hilos) con 15,3 GB de RAM y Windows 11. k6 v2.4.0. **k6 y el servidor
  corren en la misma máquina.**
- market-data con `pnpm dev` y sus valores por defecto (`apps/market-data/src/env.ts`): feed
  simulado (`FEED=mock`), `TICK_INTERVAL_MS=1000`, `MAX_TICKS_PER_SECOND=4`, y Redis local.

## Comandos

```bash
# Humo: 50 conexiones, 10 s de subida y 60 s sostenidos
k6 run -e WS_URL=ws://localhost:3001/ws/market -e VUS=50 -e RAMP_S=10 -e HOLD_S=60 tests/load/ws-market-500.js

# Completa: 500 conexiones, 120 s de subida y 15 min sostenidos
k6 run --summary-export k6-500.json -e WS_URL=ws://localhost:3001/ws/market -e VUS=500 -e RAMP_S=120 -e HOLD_S=900 tests/load/ws-market-500.js
```

## Resultado: pasan todos los umbrales del escenario

| Métrica                            | Umbral     | Humo (50)     | Completa (500)                          |
| ---------------------------------- | ---------- | ------------- | --------------------------------------- |
| Sesiones correctas                 | > 99 %     | 100 % (50/50) | 100 % (1.000/1.000)                     |
| Cierres inesperados                | < 1 %      | 0 %           | 0 %                                     |
| Sesiones sin ticks por más de 30 s | < 1 %      | 0 %           | 0 %                                     |
| Errores de contrato                | 0          | 0             | 0                                       |
| Errores del servidor               | 0          | 0             | 0                                       |
| Conexión, p95                      | < 1.000 ms | 3 ms          | 11 ms (máximo 88 ms)                    |
| Respuesta a `subscribe`, p95       | < 200 ms   | < 1 ms        | 1 ms (máximo 76 ms)                     |
| Respuesta a `ping`, p95            | < 200 ms   | < 1 ms        | 19,4 ms (máximo 136 ms)                 |
| Retraso del tick, p95              | < 1.000 ms | 248 ms        | 288 ms (promedio 164 ms, máximo 354 ms) |
| Ticks recibidos                    | —          | 19.368        | 2.858.924 (unos 2.800 por segundo)      |
| Datos recibidos                    | —          | 2,1 MB        | 299 MB                                  |

Las 1.000 sesiones son las 500 conexiones iniciales más su reconexión a los 10 min: todas se
volvieron a abrir y a suscribir sin error. El retraso del tick es la diferencia entre la marca del
tick y su llegada; como k6 y el servidor comparten reloj, el mínimo sale en −1 ms por redondeo.

## Recursos de market-data

Proceso `node` de market-data, muestreado cada 30 s con `Get-Process`:

| Momento                               | Memoria                           | CPU                                                  |
| ------------------------------------- | --------------------------------- | ---------------------------------------------------- |
| Antes de la carga                     | 80 MB                             | —                                                    |
| Subida a 500 conexiones (2 min)       | 87 a 111 MB                       | —                                                    |
| 500 conexiones sostenidas (15 min)    | 111 a 146 MB                      | 61,8 s de CPU en 900 s: 6,9 % de un núcleo           |
| Reconexión de todas (minutos 10 a 12) | baja a 88 MB y vuelve a 97–115 MB | sin picos: el tramo de 30 s con más uso llegó al 8 % |
| Después de la prueba (2,5 min)        | 103 MB, estable                   | prácticamente cero                                   |

## Veredicto

**En local, pasa.** Un proceso de market-data sostuvo 500 conexiones con 6 símbolos cada una durante
15 min, con la reconexión de todas, sin errores y con latencias muy por debajo de los umbrales. Usó
alrededor del 7 % de un núcleo y menos de 150 MB.

## Límites de esta medición

- k6 y market-data corren en la misma máquina: no hay red real (latencia, pérdida de paquetes, TLS
  de Caddy).
- El feed es simulado, no Binance.
- Fueron 15 min sostenidos, no las 2 horas del criterio Go/No-Go. La memoria quedó 23 MB por encima
  del arranque y estable; descartar una fuga requiere la corrida larga.
- No mide la API ni las órdenes.

Pendiente, en la fase 2: la corrida de 2 horas contra staging (depende de D-06) y las ráfagas
contra `POST /orders`.
