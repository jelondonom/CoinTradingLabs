import {
  WS_ACCOUNT_PATH,
  accountClientMessageSchema,
  parseWsMessage,
  type AccountServerMessage,
  type HealthResponse,
} from '@coin/shared';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';

/** Devuelve `true` si la dependencia responde. */
export type HealthCheck = () => Promise<boolean>;

export type AppOptions = {
  logLevel?: string;
  checks: Record<string, HealthCheck>;
  /** Tiempo máximo por chequeo de salud. */
  checkTimeoutMs?: number;
};

async function runCheck(check: HealthCheck, timeoutMs: number): Promise<'up' | 'down'> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return (await Promise.race([check(), timeout])) ? 'up' : 'down';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { checks, checkTimeoutMs = 2000 } = options;
  const app = Fastify({
    logger: options.logLevel ? { level: options.logLevel } : false,
  });

  await app.register(websocket);

  app.get('/health', async (_request, reply) => {
    const entries = await Promise.all(
      Object.entries(checks).map(
        async ([name, check]) => [name, await runCheck(check, checkTimeoutMs)] as const,
      ),
    );
    const healthy = entries.every(([, status]) => status === 'up');
    const body: HealthResponse = {
      status: healthy ? 'ok' : 'degraded',
      service: 'api',
      uptimeSeconds: Math.round(process.uptime()),
      checks: Object.fromEntries(entries),
    };
    return reply.code(healthy ? 200 : 503).send(body);
  });

  // WebSocket privado de cuenta. V0: solo valida el contrato y responde ping.
  // La autenticación y los eventos de cuenta los implementa el Agente Backend.
  app.get(WS_ACCOUNT_PATH, { websocket: true }, (socket) => {
    const send = (message: AccountServerMessage) => socket.send(JSON.stringify(message));

    socket.on('message', (raw) => {
      const message = parseWsMessage(accountClientMessageSchema, raw.toString());
      if (!message) {
        send({ type: 'error', code: 'invalid_message', message: 'Mensaje fuera de contrato.' });
        return;
      }
      if (message.type === 'ping') {
        send({ type: 'pong', ts: Date.now() });
        return;
      }
      send({
        type: 'error',
        code: 'not_implemented',
        message: 'La autenticación aún no está disponible.',
      });
    });
  });

  return app;
}
