import { getInstrument, type Candle } from '@coin/shared';
import {
  AreaSeries,
  CandlestickSeries,
  LineSeries,
  createChart,
  type IChartApi,
} from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n/index.js';
import { formatPrice } from '../../lib/format.js';
import { candleBuffer, setCandleInterval } from '../../lib/ws/market-feed.js';
import { useUiStore } from '../../stores/ui-store.js';
import { toBar, toPoint } from './candle-data.js';

type ChartColors = {
  text: string;
  grid: string;
  up: string;
  down: string;
  accent: string;
};

function readColors(element: HTMLElement): ChartColors {
  const style = getComputedStyle(element);
  const read = (name: string) => style.getPropertyValue(name).trim();
  return {
    text: read('--muted'),
    grid: read('--line'),
    up: read('--up'),
    down: read('--down'),
    accent: read('--accent'),
  };
}

function layoutOptions(colors: ChartColors) {
  return {
    layout: {
      background: { color: 'transparent' },
      textColor: colors.text,
      // Atribución a TradingView: la exige la licencia de Lightweight Charts. No quitar.
      attributionLogo: true,
    },
    grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
    rightPriceScale: { borderColor: colors.grid },
    timeScale: {
      borderColor: colors.grid,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 6,
    },
  };
}

/** Gráfica del símbolo activo. Los precios en vivo entran con `series.update()`, sin React. */
export function PriceChart() {
  const symbol = useUiStore((state) => state.symbol);
  const interval = useUiStore((state) => state.interval);
  const chartType = useUiStore((state) => state.chartType);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [hasHistory, setHasHistory] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      localization: { locale: 'es-CO' },
      ...layoutOptions(readColors(container)),
    });
    chartRef.current = chart;

    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    const onSchemeChange = () => chart.applyOptions(layoutOptions(readColors(container)));
    scheme.addEventListener('change', onSchemeChange);

    return () => {
      scheme.removeEventListener('change', onSchemeChange);
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!chart || !container) return;

    setCandleInterval(interval);
    const { pricePrecision } = getInstrument(symbol);
    const priceFormat = {
      type: 'custom' as const,
      minMove: 1 / 10 ** pricePrecision,
      // Mismo formato de precio que el resto de la interfaz.
      formatter: (price: number) => formatPrice(price, pricePrecision),
    };
    const colors = readColors(container);
    const offset = new Date().getTimezoneOffset();
    const history = candleBuffer.get(symbol);

    let update: (candle: Candle) => void;
    let remove: () => void;

    if (chartType === 'candles') {
      const series = chart.addSeries(CandlestickSeries, {
        priceFormat,
        upColor: colors.up,
        borderUpColor: colors.up,
        wickUpColor: colors.up,
        downColor: colors.down,
        borderDownColor: colors.down,
        wickDownColor: colors.down,
      });
      series.setData(history.map((candle) => toBar(candle, offset)));
      update = (candle) => series.update(toBar(candle, offset));
      remove = () => chart.removeSeries(series);
    } else {
      const series =
        chartType === 'line'
          ? chart.addSeries(LineSeries, { priceFormat, color: colors.accent, lineWidth: 2 })
          : chart.addSeries(AreaSeries, {
              priceFormat,
              lineColor: colors.accent,
              topColor: `${colors.accent}55`,
              bottomColor: `${colors.accent}00`,
              lineWidth: 2,
            });
      series.setData(history.map((candle) => toPoint(candle, offset)));
      update = (candle) => series.update(toPoint(candle, offset));
      remove = () => chart.removeSeries(series);
    }

    chart.timeScale().scrollToRealTime();
    let shown = history.length >= 2;
    setHasHistory(shown);

    const unsubscribe = candleBuffer.subscribe((candle) => {
      if (candle.symbol !== symbol) return;
      update(candle);
      if (!shown && candleBuffer.get(symbol).length >= 2) {
        shown = true;
        setHasHistory(true);
      }
    });

    return () => {
      unsubscribe();
      // Al desmontar, la gráfica ya fue destruida por el otro efecto y se llevó sus series.
      if (chartRef.current === chart) remove();
    };
  }, [symbol, interval, chartType]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="absolute inset-0"
        role="img"
        aria-label={t('chart.label', { symbol })}
        data-testid="chart"
        data-state={hasHistory ? 'ready' : 'building'}
        data-interval={interval}
      />
      {!hasHistory && (
        <p className="pointer-events-none absolute inset-x-4 top-3 text-center text-xs text-muted">
          {t('chart.building')}
        </p>
      )}
    </div>
  );
}
