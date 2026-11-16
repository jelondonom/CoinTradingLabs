import { SYMBOLS } from '@coin/shared';
import { buildApp } from './app.js';
import { loadEnv } from './env.js';
import { PriceSimulator } from './price-simulator.js';

const env = loadEnv();
const app = await buildApp({ logLevel: env.logLevel });
const simulator = new PriceSimulator();

app.server.log.warn('precios SIMULADOS (V0): no hay proveedor real conectado');

const timer = setInterval(() => {
  const ts = Date.now();
  for (const symbol of SYMBOLS) {
    app.publishTick(simulator.next(symbol, ts));
  }
}, env.tickIntervalMs);

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  app.server.log.info({ signal }, 'cerrando market-data');
  clearInterval(timer);
  await app.server.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.server.listen({ host: env.host, port: env.port });
} catch (error) {
  app.server.log.fatal({ err: error }, 'market-data no pudo arrancar');
  process.exit(1);
}
