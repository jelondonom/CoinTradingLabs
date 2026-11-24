import { loginRequestSchema, placeOrderRequestSchema } from '@coin/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { dec } from '../engine/index.js';
import { invalidQuantity, unauthorized, validationError } from '../errors/app-error.js';
import { getAccountView } from './accounts/get-account.js';
import { hashEnrollmentCode } from './auth/enrollment-code.js';
import { signToken, verifyToken, type TokenClaims } from './auth/token.js';
import type { TradingDeps } from './deps.js';
import { toOrderDto } from './dto.js';
import { placeOrder } from './orders/place-order.js';
import { fitsQuantityColumn, recordRefusedOrder } from './orders/quantity-column.js';

/**
 * Respuesta de login con token Bearer. Se queda hasta la tarea 4 (cookie `coin_session`, D-04),
 * cuando pasa a `loginResponseSchema` de `@coin/shared`.
 */
export type BearerLoginResponse = { token: string; expiresAt: number; accountId: string };

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
  app.post('/auth/login', async (request): Promise<BearerLoginResponse> => {
    // D-13: todo intento cuenta por IP desde que entra; si sale bien, deja de contar.
    // Así solo quedan contados los fallidos. Ver `docs/engine-rules.md` §11.
    const attempt = await deps.rateLimits.startLogin(request.ip);

    const body = loginRequestSchema.safeParse(request.body);
    if (!body.success) throw validationError('Envía el código de inscripción en `code`.');

    const user = await deps.db.user.findUnique({
      where: { loginId: hashEnrollmentCode(body.data.code) },
      include: { account: true },
    });
    if (!user?.account) throw unauthorized('Código de inscripción inválido.');

    await attempt.succeeded();
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
    // D-13: cuenta toda petición autenticada, antes de tocar la base o la cola de la cuenta.
    await deps.rateLimits.consumeOrder(claims.accountId);
    const body = placeOrderRequestSchema.safeParse(request.body);
    if (!body.success) throw validationError(z.prettifyError(body.error));

    // DEF-003: una cantidad que no cabe en `orders.quantity` no se puede guardar ni como orden
    // rechazada. Se responde 422 sin orden y queda el intento en el log y en `audit_logs`. Va
    // fuera de la transacción de la orden: si no, el 422 revertiría también la auditoría.
    const { quantity } = body.data;
    if (quantity !== undefined && !fitsQuantityColumn(dec(quantity))) {
      request.log.warn(
        { accountId: claims.accountId, quantity: String(quantity) },
        'orden rechazada sin guardar: la cantidad no cabe en orders.quantity (DEF-003)',
      );
      await recordRefusedOrder(deps.db, {
        accountId: claims.accountId,
        userId: claims.userId,
        request: body.data,
        now: deps.now(),
      });
      throw invalidQuantity(
        'La cantidad tiene más decimales o dígitos de los que se pueden registrar (máximo 8 decimales).',
      );
    }

    const { order, replayed } = await placeOrder(deps, claims.accountId, body.data);
    // 201 si la orden se creó ahora; 200 si es la repetición de un `clientOrderId` ya usado.
    return reply.code(replayed ? 200 : 201).send(toOrderDto(order));
  });

  app.get('/account', async (request) => {
    const claims = authenticate(request, deps);
    return getAccountView(deps, claims.accountId);
  });
}
