import {
  WS_ACCOUNT_PATH,
  accountClientMessageSchema,
  parseWsMessage,
  type AccountServerMessage,
  type ApiError,
  type HealthResponse,
} from '@coin/shared';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { AppError, internalError, notFound, validationError } from './errors/app-error.js';
import type { TradingDeps } from './modules/deps.js';
import { registerTradingRoutes } from './modules/routes.js';

/** Devuelve `true` si la dependencia responde. */
export type HealthCheck = () => Promise<boolean>;

export type AppOptions = {
  logLevel?: string;
  checks: Record<string, HealthCheck>;
  /** Tiempo máximo por chequeo de salud. */
  checkTimeoutMs?: number;
  /** Dependencias de trading. Sin ellas solo se sirven `/health` y el WebSocket. */
  trading?: TradingDeps;
  /**
   * IP o CIDR del proxy en el que se confía, separadas por coma (`API_TRUST_PROXY`). Detrás de
   * Caddy hace falta para que `request.ip` sea la del cliente y no la del proxy.
   */
  trustProxy?: string | false;
};

/** Responde un error con la forma del contrato (`apiErrorSchema`). */
function sendError(reply: FastifyReply, error: AppError): FastifyReply {
  const body: ApiError = { error: { code: error.code, message: error.message } };
  return reply.code(error.statusCode).headers(error.headers).send(body);
}

/**
 * `true` si Fastify rechazó la petición al leer o validar el cuerpo, antes de la ruta: JSON
 * inválido, cuerpo demasiado grande, `Content-Type` sin parser o URL mal formada. Para el
 * contrato todos son `validation_error` (400). Cualquier otro error que no sea un `AppError` es un
 * 500: así un 4xx desconocido nunca se disfraza de error del cliente.
 */
function isRequestBodyError(error: unknown): boolean {
  const { code, statusCode, validation } = error as {
    code?: unknown;
    statusCode?: unknown;
    validation?: unknown;
  };
  if (validation !== undefined) return true;
  if (typeof code === 'string' && (code.startsWith('FST_ERR_CTP_') || code === 'FST_ERR_BAD_URL')) {
    return true;
  }
  // El JSON mal formado llega como un `SyntaxError` con estado 400 y sin código de Fastify.
  return statusCode === 400;
}

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
    trustProxy: options.trustProxy ?? false,
  });

  await app.register(websocket);

  app.setErrorHandler((error, request, reply) => {
    // Los errores de la API conservan su código y su estado (401, 404, 422, 429…).
    if (error instanceof AppError) return sendError(reply, error);
    if (isRequestBodyError(error)) return sendError(reply, validationError('Petición inválida.'));
    request.log.error({ err: error }, 'error no controlado');
    return sendError(reply, internalError());
  });

  app.setNotFoundHandler((_request, reply) => sendError(reply, notFound('La ruta no existe.')));

  if (options.trading) registerTradingRoutes(app, options.trading);

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
