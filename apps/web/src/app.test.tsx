import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppView } from './app.js';
import { t } from './i18n/index.js';

/** Veces que aparece `text` en `html`. */
function count(html: string, text: string): number {
  return html.split(text).length - 1;
}

const render = (isDesktop: boolean) => renderToStaticMarkup(<AppView isDesktop={isDesktop} />);

describe('AppView: una sola copia de cada pieza que cambia con el ancho', () => {
  for (const isDesktop of [false, true]) {
    it(`dibuja un solo grupo de pestañas (${isDesktop ? 'escritorio' : 'celular'})`, () => {
      expect(count(render(isDesktop), `aria-label="${t('tabs.label')}"`)).toBe(1);
    });
  }

  it('la pestaña de operar solo existe en celular', () => {
    const operar = `>${t('tabs.trade')}</button>`;
    expect(count(render(false), operar)).toBe(1);
    expect(count(render(true), operar)).toBe(0);
  });

  it('el símbolo de la cabecera es un botón solo en celular', () => {
    const change = `aria-label="${t('symbols.change')}: BTCUSD"`;
    expect(count(render(false), change)).toBe(1);
    expect(count(render(true), change)).toBe(0);
  });
});
