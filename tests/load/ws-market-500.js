/* global __ENV */
/**
 * Carga del WebSocket público de mercado: 500 conexiones simultáneas a `/ws/market`.
 *
 * Solo corre contra staging o contra el entorno local. Nunca contra producción ni terceros.
 *
 *   k6 run -e WS_URL=wss://staging.<dominio>/ws/market tests/load/ws-market-500.js
 *
 * Variables (todas opcionales salvo WS_URL):
 *   WS_URL        URL completa del WebSocket de mercado.
 *   VUS           Conexiones simultáneas. Por defecto 500.
 *   RAMP_S        Segundos de subida hasta VUS. Por defecto 120.
 *   HOLD_S        Segundos sostenidos con todas las conexiones. Por defecto 7200 (criterio Go/No-Go).
 *   SYMBOLS       Símbolos a los que se suscribe cada conexión, separados por coma.
 *   STALE_OK      `true` si se espera que el feed esté caído (prueba de resiliencia).
 */
import { check, fail, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import ws from 'k6/ws';

const WS_URL = __ENV.WS_URL;
const VUS = Number(__ENV.VUS || 500);
const RAMP_S = Number(__ENV.RAMP_S || 120);
const HOLD_S = Number(__ENV.HOLD_S || 7200);
const SYMBOLS = (__ENV.SYMBOLS || 'BTCUSD,ETHUSD,AAPL,NVDA,XAUUSD,EURUSD').split(',');
const STALE_OK = __ENV.STALE_OK === 'true';

/** Cada conexión vive este tiempo y luego se reabre: así también se mide la reconexión. */
const SESSION_MS = 10 * 60 * 1000;
const PING_EVERY_MS = 15 * 1000;
/** Sin ningún tick en este tiempo, la conexión se cuenta como silenciosa. */
const SILENCE_MS = 30 * 1000;

const ALLOWED_HOST =
  /^wss?:\/\/(localhost|127\.0\.0\.1|\[::1\]|([a-z0-9-]+\.)*staging\.[a-z0-9.-]+)(:\d+)?\//i;

const connectTime = new Trend('ws_connect_ms', true);
const subscribeTime = new Trend('ws_subscribe_ms', true);
const pongTime = new Trend('ws_pong_ms', true);
const tickLag = new Trend('ws_tick_lag_ms', true);
const ticks = new Counter('ws_ticks');
const contractErrors = new Counter('ws_contract_errors');
const serverErrors = new Counter('ws_server_errors');
const sessionOk = new Rate('ws_session_ok');
const silent = new Rate('ws_session_silent');
const unexpectedClose = new Rate('ws_unexpected_close');

export const options = {
  scenarios: {
    market: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: `${RAMP_S}s`, target: VUS },
        { duration: `${HOLD_S}s`, target: VUS },
      ],
      gracefulStop: '30s',
    },
  },
  thresholds: {
    ws_session_ok: ['rate>0.99'],
    ws_unexpected_close: ['rate<0.01'],
    ws_session_silent: STALE_OK ? [] : ['rate<0.01'],
    ws_contract_errors: ['count==0'],
    ws_server_errors: ['count==0'],
    ws_connect_ms: ['p(95)<1000'],
    ws_subscribe_ms: ['p(95)<200'],
    ws_pong_ms: ['p(95)<200'],
    // Retraso entre la marca del tick y su llegada. Supone relojes sincronizados (NTP).
    ws_tick_lag_ms: ['p(95)<1000'],
  },
};

export function setup() {
  if (!WS_URL) fail('Falta WS_URL. Ejemplo: -e WS_URL=ws://localhost:3001/ws/market');
  if (!ALLOWED_HOST.test(WS_URL)) {
    fail(`WS_URL no es staging ni local: ${WS_URL}. Las pruebas de carga no corren en producción.`);
  }
  // Las conexiones se cierran solas al terminar la prueba, para no contarlas como caídas.
  return { endsAt: Date.now() + (RAMP_S + HOLD_S) * 1000 };
}

function isTick(data) {
  return (
    data &&
    typeof data.symbol === 'string' &&
    typeof data.bid === 'number' &&
    typeof data.ask === 'number' &&
    typeof data.ts === 'number' &&
    data.bid > 0 &&
    data.ask >= data.bid
  );
}

export default function (data) {
  const sessionMs = Math.min(SESSION_MS, data.endsAt - Date.now());
  if (sessionMs < 1000) {
    sleep(1);
    return;
  }
  const startedAt = Date.now();
  let subscribedAt = 0;
  let pingSentAt = 0;
  let lastTickAt = 0;
  let gotSubscribed = false;
  let closedByTest = false;

  const response = ws.connect(WS_URL, {}, (socket) => {
    socket.on('open', () => {
      connectTime.add(Date.now() - startedAt);
      subscribedAt = Date.now();
      socket.send(JSON.stringify({ type: 'subscribe', symbols: SYMBOLS }));

      socket.setInterval(() => {
        pingSentAt = Date.now();
        socket.send(JSON.stringify({ type: 'ping' }));
      }, PING_EVERY_MS);

      socket.setTimeout(() => {
        closedByTest = true;
        socket.close();
      }, sessionMs);
    });

    socket.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw);
      } catch {
        contractErrors.add(1);
        return;
      }
      switch (message.type) {
        case 'tick':
          if (!isTick(message.data) || !SYMBOLS.includes(message.data.symbol)) {
            contractErrors.add(1);
            return;
          }
          lastTickAt = Date.now();
          ticks.add(1);
          tickLag.add(lastTickAt - message.data.ts);
          return;
        case 'subscribed':
          if (!gotSubscribed) subscribeTime.add(Date.now() - subscribedAt);
          gotSubscribed = true;
          return;
        case 'pong':
          if (pingSentAt) pongTime.add(Date.now() - pingSentAt);
          pingSentAt = 0;
          return;
        case 'status':
        case 'candle':
          return;
        case 'error':
          serverErrors.add(1);
          return;
        default:
          contractErrors.add(1);
      }
    });

    socket.on('error', () => {
      serverErrors.add(1);
    });

    socket.on('close', () => {
      unexpectedClose.add(!closedByTest);
    });
  });

  const upgraded = check(response, { 'handshake 101': (r) => r && r.status === 101 });
  const quiet = lastTickAt === 0 || Date.now() - lastTickAt > SILENCE_MS;
  silent.add(quiet);
  sessionOk.add(upgraded && gotSubscribed && (STALE_OK || !quiet));
}
