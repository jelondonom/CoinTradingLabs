import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { t } from '../../i18n/index.js';
import { LoginScreen } from './login-screen.js';

/*
 * `renderToStaticMarkup` dibuja con el estado inicial de los stores: aquí se prueba la estructura.
 * El flujo (ingreso, errores, invitado) está en `session.test.ts` y se revisa en el navegador.
 */

function testIds(html: string): string[] {
  return [...html.matchAll(/data-testid="([^"]+)"/g)].map((match) => match[1] ?? '');
}

describe('LoginScreen', () => {
  for (const isDesktop of [false, true]) {
    it(`tiene el campo, Entrar y Ver el mercado, sin error al abrir (${isDesktop ? 'escritorio' : 'celular'})`, () => {
      const html = renderToStaticMarkup(<LoginScreen isDesktop={isDesktop} />);
      expect(testIds(html)).toEqual(['login-code', 'login-submit', 'login-guest']);
    });
  }

  it('el campo no autocompleta ni corrige, y pone mayúsculas', () => {
    const html = renderToStaticMarkup(<LoginScreen isDesktop={false} />);
    // React puede escribir los atributos en camelCase o en minúsculas: se compara sin mayúsculas.
    const input = (/<input[^>]*data-testid="login-code"[^>]*>/.exec(html)?.[0] ?? '').toLowerCase();
    expect(input).toContain('autocomplete="off"');
    expect(input).toContain('autocapitalize="characters"');
    expect(input).toContain('spellcheck="false"');
    expect(input).toContain('maxlength="64"');
  });

  it('el pie tranquiliza con el saldo ficticio en USD', () => {
    const html = renderToStaticMarkup(<LoginScreen isDesktop={false} />);
    expect(html).toContain(t('login.title'));
    expect(html).toContain('100.000,00 USD');
    expect(html).not.toContain('$');
  });
});
