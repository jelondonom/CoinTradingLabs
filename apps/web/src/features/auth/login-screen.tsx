import { INITIAL_BALANCE_USD } from '@coin/shared';
import { useId, useState, type FormEvent } from 'react';
import { t } from '../../i18n/index.js';
import type { ApiFailure } from '../../lib/api/api-client.js';
import { errorCodeAttribute, errorMessage } from '../../lib/api/error-message.js';
import { cx } from '../../lib/cx.js';
import { formatMoney } from '../../lib/format.js';
import { useSessionStore } from '../../stores/session-store.js';
import { session } from './session.js';

type LoginError = { kind: 'too_short' } | { kind: 'failed'; failure: ApiFailure };

/**
 * Pantalla `/ingreso` (boceto `docs/web/bocetos/ingreso-v1.html`). La sesión es la cookie
 * `httpOnly` que pone el servidor (D-04): aquí no se guarda nada de ella.
 */
export function LoginScreen({ isDesktop }: { isDesktop: boolean }) {
  const notice = useSessionStore((state) => state.notice);
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<LoginError | null>(null);
  const codeId = useId();
  const errorId = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError(null);
    const outcome = await session.login(code);
    if (outcome.kind !== 'ok') {
      setError(outcome);
      setSending(false);
    }
  }

  const message =
    error?.kind === 'too_short'
      ? t('login.tooShort')
      : error
        ? errorMessage(error.failure, { context: 'login' })
        : null;

  return (
    <div className="flex h-dvh flex-col bg-bg text-text">
      <header className="flex h-12 flex-none items-center border-b border-line bg-surface px-3">
        <span className="font-extrabold tracking-wide">
          {isDesktop ? t('app.name') : t('app.shortName')}
        </span>
      </header>
      {notice === 'expired' && (
        <p
          role="status"
          className="flex-none border-b border-line bg-raised px-3 py-2 text-center text-sm"
        >
          {t('errors.sessionExpired')}
        </p>
      )}
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:items-center lg:justify-start lg:pt-12">
        <form
          noValidate
          onSubmit={(event) => void submit(event)}
          className={cx(
            'flex flex-1 flex-col gap-4 bg-surface px-5 pt-7 pb-4',
            'lg:w-[420px] lg:flex-none lg:rounded-2xl lg:border-2 lg:border-text lg:px-7 lg:pt-8',
          )}
        >
          <div>
            <h1 className="text-2xl font-bold">{t('login.title')}</h1>
            <p className="mt-1 text-sm text-muted">{t('login.help')}</p>
          </div>

          <div>
            <label htmlFor={codeId} className="mb-1 block text-sm font-semibold">
              {t('login.codeLabel')}
            </label>
            <input
              id={codeId}
              name="code"
              data-testid="login-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={t('login.codePlaceholder')}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={64}
              aria-invalid={error ? true : undefined}
              aria-describedby={message ? errorId : undefined}
              className={cx(
                'min-h-12 w-full rounded-lg bg-transparent px-3 text-lg tracking-wide uppercase placeholder:tracking-normal placeholder:normal-case',
                error ? 'border-[2.5px] border-text' : 'border-[1.5px] border-text',
              )}
            />
          </div>

          {message && (
            <p
              id={errorId}
              role="alert"
              data-testid="login-error"
              data-error-code={
                error?.kind === 'failed' ? errorCodeAttribute(error.failure) : undefined
              }
              className="rounded-lg border-[1.5px] border-l-[6px] border-text bg-raised px-3 py-2.5 text-sm"
            >
              <span aria-hidden="true">⚠ </span>
              {message}
            </p>
          )}

          <button
            type="submit"
            data-testid="login-submit"
            disabled={sending}
            className="min-h-13 rounded-xl bg-text text-base font-bold text-surface disabled:opacity-60"
          >
            {sending ? t('login.submitting') : t('login.submit')}
          </button>

          <button
            type="button"
            data-testid="login-guest"
            onClick={() => session.enterAsGuest()}
            className="min-h-11 text-sm underline underline-offset-4"
          >
            {t('login.guest')}
          </button>

          <p className="mt-auto border-t border-dashed border-line pt-3 text-center text-xs text-muted lg:mt-4">
            {t('login.demo', { balance: formatMoney(INITIAL_BALANCE_USD) })}
          </p>
        </form>
      </main>
    </div>
  );
}
