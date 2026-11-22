import { CANDLE_INTERVALS, SYMBOLS } from '@coin/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppView } from './app.js';
import { t } from './i18n/index.js';

/*
 * `renderToStaticMarkup` dibuja con la instantánea de servidor de zustand, que es siempre el estado
 * inicial de los stores. Por eso aquí solo se prueba lo que depende de ese estado: la estructura, los
 * nombres y los estados de arranque. Los demás estados los cubren los tests de `symbol-state`,
 * `ticket-status` y `data-value`, y la revisión en el navegador.
 */

/** Veces que aparece `text` en `html`. */
function count(html: string, text: string): number {
  return html.split(text).length - 1;
}

/** Todos los `data-testid` del HTML, en orden. */
function testIds(html: string): string[] {
  return [...html.matchAll(/data-testid="([^"]+)"/g)].map((match) => match[1] ?? '');
}

/** Valor de `name` en el elemento con ese `data-testid`, o `undefined` si no lo tiene. */
function attribute(html: string, testId: string, name: string): string | undefined {
  const tag = new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`).exec(html)?.[0];
  if (!tag) throw new Error(`No hay ningún elemento con data-testid="${testId}"`);
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

const render = (isDesktop: boolean) => renderToStaticMarkup(<AppView isDesktop={isDesktop} />);

/** Nombres de `docs/qa/data-testid.md` que existen hoy en los dos anchos (tarea F1). */
const BOTH_WIDTHS = [
  'connection-status',
  'symbols-search',
  ...SYMBOLS.flatMap((symbol) => [
    `symbol-row-${symbol}`,
    `symbol-status-${symbol}`,
    `symbol-price-${symbol}`,
  ]),
  'header-symbol',
  'header-price',
  'chart',
  ...CANDLE_INTERVALS.map((interval) => `chart-interval-${interval}`),
  'ticket-amount',
  'ticket-estimate',
  'ticket-quick-100',
  'ticket-quick-1000',
  'ticket-quick-5000',
  'ticket-sell',
  'ticket-buy',
  'ticket-status',
  'tab-positions',
  'tab-history',
  'positions-empty',
  'nav-terminal',
  'nav-markets',
  'nav-ranking',
  'nav-account',
];

const WIDTHS = [
  { name: 'celular', isDesktop: false, expected: [...BOTH_WIDTHS, 'tab-trade'] },
  { name: 'escritorio', isDesktop: true, expected: BOTH_WIDTHS },
];

describe('AppView: una sola copia de cada pieza que cambia con el ancho', () => {
  for (const { name, isDesktop } of WIDTHS) {
    it(`dibuja un solo grupo de pestañas (${name})`, () => {
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

  it('cada forma de las pestañas marca su propia pestaña activa', () => {
    const mobile = render(false);
    expect(attribute(mobile, 'tab-trade', 'aria-pressed')).toBe('true');
    expect(attribute(mobile, 'tab-positions', 'aria-pressed')).toBe('false');

    const desktop = render(true);
    expect(attribute(desktop, 'tab-positions', 'aria-pressed')).toBe('true');
    expect(attribute(desktop, 'tab-history', 'aria-pressed')).toBe('false');
  });
});

describe('AppView: data-testid de docs/qa/data-testid.md', () => {
  for (const { name, isDesktop, expected } of WIDTHS) {
    it(`en ${name} cada nombre existe una sola vez en el DOM (regla 6)`, () => {
      const ids = testIds(render(isDesktop));
      expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
    });

    it(`en ${name} están justo los nombres de lo que ya existe`, () => {
      expect(new Set(testIds(render(isDesktop)))).toEqual(new Set(expected));
    });
  }

  it('connection-banner no existe mientras no se esté reconectando', () => {
    expect(testIds(render(false))).not.toContain('connection-banner');
  });
});

describe('AppView: estados de arranque en data-state y data-value', () => {
  for (const { name, isDesktop } of WIDTHS) {
    it(`sin conexión ni precios (${name})`, () => {
      const html = render(isDesktop);
      expect(attribute(html, 'connection-status', 'data-state')).toBe('connecting');
      expect(attribute(html, 'ticket-status', 'data-state')).toBe('offline');
      expect(attribute(html, 'symbol-status-BTCUSD', 'data-state')).toBe('no-price');
      expect(attribute(html, 'symbol-price-BTCUSD', 'data-value')).toBeUndefined();
      expect(attribute(html, 'header-price', 'data-value')).toBeUndefined();
      expect(attribute(html, 'ticket-estimate', 'data-value')).toBeUndefined();
      expect(attribute(html, 'chart', 'data-state')).toBe('building');
      expect(attribute(html, 'chart', 'data-interval')).toBe('1m');
      expect(attribute(html, 'chart-interval-1m', 'aria-pressed')).toBe('true');
    });
  }
});
