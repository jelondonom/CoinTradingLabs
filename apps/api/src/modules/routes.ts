import { createHash, randomBytes } from 'node:crypto';
import {
  LOGIN_PATH,
  LOGOUT_PATH,
  SESSION_COOKIE_NAME,
  loginRequestSchema,
  placeOrderRequestSchema,
  type LoginResponse,
} from '@coin/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
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

/** Cookie del dispositivo para el límite de login (D-13). Solo lleva un identificador aleatorio. */
export const DEVICE_COOKIE_NAME = 'coin_device';
/** Vida de `coin_device` (G-C, Gerente, 2026-11-25). */
const DEVICE_COOKIE_MAX_AGE_S = 90 * 24 * 60 * 60;
/** 128 bits en base64url. */
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** Huella del token para la lista negra: el token en claro nunca se guarda. */
function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Lee la sesión de la cookie `coin_session` (D-04). La cabecera `Authorization` no se mira: con una
 * cookie válida decide la cookie, y un Bearer solo da 401. Un token revocado al cerrar sesión
 * también da 401.
 */
async function authenticate(request: FastifyRequest, deps: TradingDeps): Promise<TokenClaims> {
  const token = request.cookies[SESSION_COOKIE_NAME];
  const claims = token ? verifyToken(token, deps.tokenSecret, deps.now()) : null;
  if (!token || !claims) throw unauthorized();
  if (await deps.rateLimits.isSessionRevoked(tokenHash(token))) throw unauthorized();
  return claims;
}

/**
 * El dispositivo del navegador. Si no trae `coin_device` o la trae mal formada, se le pone una
 * nueva en esta respuesta, aunque el login falle: el fallo ya cuenta para ese dispositivo.
 */
function deviceIdOf(request: FastifyRequest, reply: FastifyReply, deps: TradingDeps): string {
  const current = request.cookies[DEVICE_COOKIE_NAME];
  if (current && DEVICE_ID_PATTERN.test(current)) return current;
  const deviceId = randomBytes(16).toString('base64url');
  reply.setCookie(DEVICE_COOKIE_NAME, deviceId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: deps.secureCookies ?? false,
    maxAge: DEVICE_COOKIE_MAX_AGE_S,
  });
  return deviceId;
}

/** Rutas REST de trading: login, logout, órdenes y cuenta. */
export function registerTradingRoutes(app: FastifyInstance, deps: TradingDeps): void {
  app.post(LOGIN_PATH, async (request, reply): Promise<LoginResponse> => {
    // D-13: el intento cuenta por dispositivo y por IP desde que entra; si sale bien, deja de
    // contar. Así solo quedan contados los fallidos. Ver `docs/engine-rules.md` §11.
    const deviceId = deviceIdOf(request, reply, deps);
    const attempt = await deps.rateLimits.startLogin(request.ip, deviceId);
    if (attempt.ipPassedHalfCeiling) {
      // G-B: una vez por IP y por ventana. El Arquitecto alerta sobre este log.
      request.log.warn({ ip: request.ip }, 'login: la IP pasó del 50 % de su techo de fallos');
    }

    const body = loginRequestSchema.safeParse(request.body);
    if (!body.success) throw validationError('Envía el código de inscripción en `code`.');

    const user = await deps.db.user.findUnique({
      where: { loginId: hashEnrollmentCode(body.data.code) },
      include: { account: true },
    });
    if (!user?.account) throw unauthorized('Código de inscripción inválido.');

    await attempt.succeeded(user.account.id);
    const expiresAt = deps.now() + deps.tokenTtlMs;
    const token = signToken(
      { userId: user.id, accountId: user.account.id, expiresAt },
      deps.tokenSecret,
    );
    reply.setCookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      secure: deps.secureCookies ?? false,
      maxAge: Math.floor(deps.tokenTtlMs / 1000),
    });
    return { accountId: user.account.id, expiresAt };
  });

  // Siempre 204: borra la cookie y, si la sesión era válida, revoca el token hasta que venza (G2).
  app.post(LOGOUT_PATH, async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    const claims = token ? verifyToken(token, deps.tokenSecret, deps.now()) : null;
    if (token && claims) await deps.rateLimits.revokeSession(tokenHash(token), claims.expiresAt);
    reply.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      secure: deps.secureCookies ?? false,
    });
    return reply.code(204).send();
  });

  app.post('/orders', async (request, reply) => {
    const claims = await authenticate(request, deps);
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
    const claims = await authenticate(request, deps);
    return getAccountView(deps, claims.accountId);
  });
}
