import { placeOrderRequestSchema } from '@coin/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { invalidRequest, unauthorized } from '../errors/app-error.js';
import { getAccountView } from './accounts/get-account.js';
import { hashEnrollmentCode } from './auth/enrollment-code.js';
import { signToken, verifyToken, type TokenClaims } from './auth/token.js';
import type { TradingDeps } from './deps.js';
import { toOrderDto } from './dto.js';
import { placeOrder } from './orders/place-order.js';

/**
 * Contrato de login. Vive aquí hasta que el Arquitecto lo mueva a `@coin/shared`
 * (solicitud 7 de `docs/engine-rules.md`).
 */
export const loginRequestSchema = z.object({ code: z.string().min(4).max(64) });
export type LoginResponse = { token: string; expiresAt: number; accountId: string };

/** Lee y valida el token de la cabecera `Authorization: Bearer <token>`. */
function authenticate(request: FastifyRequest, deps: TradingDeps): TokenClaims {
  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  const claims = token ? verifyToken(token, deps.tokenSecret, deps.now()) : null;
  if (!claims) throw unauthorized();
  return claims;
}

/** Rutas REST de trading: login, órdenes y cuenta. */
export function registerTradingRoutes(app: FastifyInstance, deps: TradingDeps): void {
  app.post('/auth/login', async (request): Promise<LoginResponse> => {
    const body = loginRequestSchema.safeParse(request.body);
    if (!body.success) throw invalidRequest('Envía el código de inscripción en `code`.');

    const user = await deps.db.user.findUnique({
      where: { loginId: hashEnrollmentCode(body.data.code) },
      include: { account: true },
    });
    if (!user?.account) throw unauthorized('Código de inscripción inválido.');

    const expiresAt = deps.now() + deps.tokenTtlMs;
    return {
      token: signToken(
        { userId: user.id, accountId: user.account.id, expiresAt },
        deps.tokenSecret,
      ),
      expiresAt,
      accountId: user.account.id,
    };
  });

  app.post('/orders', async (request, reply) => {
    const claims = authenticate(request, deps);
    const body = placeOrderRequestSchema.safeParse(request.body);
    if (!body.success) throw invalidRequest(z.prettifyError(body.error));

    const { order, replayed } = await placeOrder(deps, claims.accountId, body.data);
    // 201 si la orden se creó ahora; 200 si es la repetición de un `clientOrderId` ya usado.
    return reply.code(replayed ? 200 : 201).send(toOrderDto(order));
  });

  app.get('/account', async (request) => {
    const claims = authenticate(request, deps);
    return getAccountView(deps, claims.accountId);
  });
}
