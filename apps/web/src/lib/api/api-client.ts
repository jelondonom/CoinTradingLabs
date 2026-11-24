import { API_ERROR_CODES, type ApiErrorCode } from '@coin/shared';

/**
 * Prefijos públicos de ADR-0004. Las rutas del contrato (`LOGIN_PATH`, `CANDLES_PATH`…) son rutas
 * internas de cada servicio; el navegador las llama con su prefijo, siempre en el mismo origen.
 */
export const API_PREFIX = '/api';
export const MARKET_PREFIX = '/market';

/** Tiempo máximo de una petición. El Wi-Fi del evento corta conexiones en silencio. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Lo mínimo de un esquema Zod que usa el cliente. Los esquemas de `@coin/shared` lo cumplen, así
 * `apps/web` no necesita importar `zod` y el tipo de `data` sale del esquema.
 */
export type ResponseSchema<T> = {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
};

/** Por qué falló una petición. Ninguna falla lanza una excepción. */
export type ApiFailure =
  | {
      /** El servidor respondió con el cuerpo de error del contrato: `{ error: { code, message } }`. */
      kind: 'api';
      status: number;
      /** El código tal cual llegó, aunque no esté en el contrato (hoy `invalid_request`, B1). */
      code: string;
      /** El mismo código si está en `API_ERROR_CODES`; si no, `null`. */
      knownCode: ApiErrorCode | null;
      /** Texto para personas; puede cambiar. La pantalla decide qué mostrar según el código. */
      message: string;
      /** Segundos de `Retry-After` (B3). Solo si la cabecera trae un entero mayor o igual a 1. */
      retryAfterSeconds?: number;
    }
  /** Error sin el cuerpo del contrato, por ejemplo un 502 en HTML del proxy. */
  | { kind: 'http'; status: number }
  /** No hubo respuesta: sin red, o se agotó el tiempo. */
  | { kind: 'network'; reason: 'offline' | 'timeout' }
  /** Un 2xx que no cumple el esquema del contrato v2. */
  | { kind: 'invalid_response'; status: number; url: string }
  /** Quien llamó canceló la petición con su `signal`. */
  | { kind: 'aborted' };

export type ApiResult<T> =
  { ok: true; status: number; data: T } | { ok: false; failure: ApiFailure };

type BaseRequest = {
  /** `api` se llama con `/api`; `market`, con `/market`. */
  service: 'api' | 'market';
  /** Ruta interna del contrato, por ejemplo `ORDERS_PATH`. */
  path: string;
  method?: 'GET' | 'POST';
  /** Parámetros de la query string. Los `undefined` y los vacíos no se envían. */
  query?: Readonly<Record<string, string | number | undefined>>;
  /** Se envía como JSON. */
  body?: unknown;
  /**
   * Si un 401 significa sesión vencida. Por defecto, sí en `api` y no en `market`. En
   * `POST /auth/login` es `false`: ahí un 401 significa "código inválido" (B4).
   */
  sessionRequired?: boolean;
  signal?: AbortSignal;
};

export type RequestWithSchema<T> = BaseRequest & { schema: ResponseSchema<T> };
export type RequestWithoutSchema = BaseRequest & { schema?: undefined };

export type ApiClient = {
  /** Con esquema: `data` tiene el tipo que el esquema valida. */
  request<T>(options: RequestWithSchema<T>): Promise<ApiResult<T>>;
  /** Sin esquema (por ejemplo, un 204): `data` es `undefined`. */
  request(options: RequestWithoutSchema): Promise<ApiResult<undefined>>;
  /**
   * Empieza una sesión nueva: permite un nuevo aviso de sesión vencida e ignora los 401 de las
   * peticiones que empezaron antes. Se llama cuando el ingreso sale bien.
   */
  clearUnauthorized(): void;
};

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type ApiClientOptions = {
  fetch?: FetchLike;
  timeoutMs?: number;
  /**
   * Sesión vencida: un 401 en una ruta que pide sesión. Se llama una sola vez, aunque fallen varias
   * peticiones a la vez, hasta el siguiente `clearUnauthorized()`. Un 401 de una petición que empezó
   * antes del último `clearUnauthorized()` (es decir, de la sesión anterior) se ignora.
   */
  onUnauthorized?: (info: { startedAt: number }) => void;
  /** Reloj inyectable para los tests. */
  now?: () => number;
};

const fail = (failure: ApiFailure): ApiResult<never> => ({ ok: false, failure });

/** URL relativa con el prefijo del servicio y la query string, sin parámetros vacíos. */
export function buildUrl(
  service: BaseRequest['service'],
  path: string,
  query: BaseRequest['query'] = {},
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const search = params.toString();
  return `${service === 'api' ? API_PREFIX : MARKET_PREFIX}${path}${search ? `?${search}` : ''}`;
}

/** Código y mensaje del cuerpo de error, sin exigir que el código esté en el contrato. */
function readErrorBody(json: unknown): { code: string; message: string } | null {
  if (typeof json !== 'object' || json === null) return null;
  const error: unknown = (json as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return null;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code !== 'string' || code === '') return null;
  return { code, message: typeof message === 'string' ? message : '' };
}

function knownCode(code: string): ApiErrorCode | null {
  return (API_ERROR_CODES as readonly string[]).includes(code) ? (code as ApiErrorCode) : null;
}

/** `Retry-After` en segundos enteros (B3). Otro formato no se usa. */
function retryAfterSeconds(header: string | null): number | undefined {
  if (header === null || !/^\d+$/.test(header.trim())) return undefined;
  const seconds = Number(header.trim());
  return seconds >= 1 ? seconds : undefined;
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** Cliente REST del contrato v2: URLs relativas, cookie de sesión y respuestas validadas. */
export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const doFetch: FetchLike = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  let unauthorizedNotified = false;
  /** Sube con cada ingreso exitoso (`clearUnauthorized`): separa las peticiones de cada sesión. */
  let sessionEpoch = 0;

  const notifyUnauthorized = (epoch: number, startedAt: number) => {
    // Un 401 de la sesión anterior no saca a quien acaba de ingresar.
    if (epoch !== sessionEpoch || unauthorizedNotified) return;
    unauthorizedNotified = true;
    options.onUnauthorized?.({ startedAt });
  };

  async function request(
    req: RequestWithSchema<unknown> | RequestWithoutSchema,
  ): Promise<ApiResult<unknown>> {
    if (req.signal?.aborted) return fail({ kind: 'aborted' });
    const epoch = sessionEpoch;
    const startedAt = now();

    const url = buildUrl(req.service, req.path, req.query);
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const abortFromCaller = () => controller.abort();
    req.signal?.addEventListener('abort', abortFromCaller, { once: true });

    /** Sin respuesta completa: se agotó el tiempo, canceló quien llamó o se cayó la red. */
    const noResponse = (): ApiResult<never> => {
      if (timedOut) return fail({ kind: 'network', reason: 'timeout' });
      if (req.signal?.aborted) return fail({ kind: 'aborted' });
      return fail({ kind: 'network', reason: 'offline' });
    };

    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (req.body !== undefined) headers['Content-Type'] = 'application/json';

      let response: Response;
      let text: string;
      try {
        response = await doFetch(url, {
          method: req.method ?? 'GET',
          credentials: 'same-origin',
          headers,
          body: req.body === undefined ? undefined : JSON.stringify(req.body),
          signal: controller.signal,
        });
        // Un 2xx sin esquema no usa el cuerpo: no se espera a descargarlo.
        text = response.ok && !req.schema ? '' : await response.text();
      } catch {
        return noResponse();
      }

      if (response.ok) {
        if (!req.schema) return { ok: true, status: response.status, data: undefined };
        const json = parseJson(text);
        const parsed = json.ok ? req.schema.safeParse(json.value) : { success: false as const };
        return parsed.success
          ? { ok: true, status: response.status, data: parsed.data }
          : fail({ kind: 'invalid_response', status: response.status, url });
      }

      if (response.status === 401 && (req.sessionRequired ?? req.service === 'api')) {
        notifyUnauthorized(epoch, startedAt);
      }

      const json = parseJson(text);
      const error = json.ok ? readErrorBody(json.value) : null;
      if (!error) return fail({ kind: 'http', status: response.status });

      const retryAfter = retryAfterSeconds(response.headers.get('retry-after'));
      return fail({
        kind: 'api',
        status: response.status,
        code: error.code,
        knownCode: knownCode(error.code),
        message: error.message,
        ...(retryAfter === undefined ? {} : { retryAfterSeconds: retryAfter }),
      });
    } finally {
      clearTimeout(timer);
      req.signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  return {
    request: request as ApiClient['request'],
    clearUnauthorized: () => {
      sessionEpoch += 1;
      unauthorizedNotified = false;
    },
  };
}
