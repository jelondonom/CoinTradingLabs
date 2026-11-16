import { buildApp } from './app.js';
import { createFeed } from './adapters/create-feed.js';
import { loadEnv } from './env.js';
import { TickConflator } from './gateway/tick-conflator.js';

const env = loadEnv();
const app = await buildApp({ logLevel: env.logLevel });
const log = app.server.log;
const conflator = new TickConflator(Math.round(1000 / env.maxTicksPerSecond), (tick) =>
  app.publishTick(tick),
);

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  log.info({ signal }, 'cerrando market-data');
  await feed?.stop();
  conflator.stop();
  await app.server.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

let feed: ReturnType<typeof createFeed> | undefined;
try {
  feed = createFeed(env, {
    info: (details, message) => log.info(details, message),
    warn: (details, message) => log.warn(details, message),
  });
  if (feed.simulated) {
    log.warn({ feed: feed.name }, 'precios SIMULADOS: no hay proveedor real conectado');
  }
  await app.server.listen({ host: env.host, port: env.port });
  conflator.start();
  const feedName = feed.name;
  await feed.start({
    onTick: (tick) => conflator.push(tick),
    onStatus: (status) => {
      if (status === 'connected') log.info({ feed: feedName }, 'feed conectado');
      else if (!closing) log.warn({ feed: feedName }, 'feed desconectado');
    },
  });
} catch (error) {
  log.fatal({ err: error }, 'market-data no pudo arrancar');
  process.exit(1);
}
