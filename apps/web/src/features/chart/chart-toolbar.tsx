import { CANDLE_INTERVALS } from '@coin/shared';
import { t } from '../../i18n/index.js';
import { cx } from '../../lib/cx.js';
import { useUiStore, type ChartType } from '../../stores/ui-store.js';

const CHART_TYPES: readonly ChartType[] = ['candles', 'line', 'area'];

export function ChartToolbar() {
  const interval = useUiStore((state) => state.interval);
  const chartType = useUiStore((state) => state.chartType);
  const setInterval = useUiStore((state) => state.setInterval);
  const setChartType = useUiStore((state) => state.setChartType);

  return (
    <div className="flex flex-none items-center gap-1 border-b border-line px-2 py-1">
      <div role="group" aria-label={t('chart.interval')} className="flex gap-1">
        {CANDLE_INTERVALS.map((option) => (
          <button
            key={option}
            type="button"
            data-testid={`chart-interval-${option}`}
            aria-pressed={option === interval}
            onClick={() => setInterval(option)}
            className={cx(
              // 40 px de ancho y 44 de alto: las seis temporalidades y el tipo de gráfica caben en 360 px.
              'min-h-11 min-w-10 rounded-md px-2 text-sm lg:min-h-8 lg:min-w-9',
              option === interval ? 'bg-text font-semibold text-surface' : 'text-muted',
            )}
          >
            {option}
          </button>
        ))}
      </div>
      <span className="flex-1" />
      <label className="flex items-center">
        <span className="sr-only">{t('chart.type')}</span>
        <select
          value={chartType}
          onChange={(event) => setChartType(event.target.value as ChartType)}
          className="min-h-11 rounded-md border border-line bg-surface px-2 text-sm lg:min-h-8"
        >
          {CHART_TYPES.map((option) => (
            <option key={option} value={option}>
              {t(`chart.${option}`)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
