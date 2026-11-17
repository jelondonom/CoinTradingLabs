import { t } from '../../i18n/index.js';
import { cx } from '../../lib/cx.js';
import { useUiStore, type PanelTab } from '../../stores/ui-store.js';

const DESKTOP_TABS: ReadonlyArray<Exclude<PanelTab, 'trade'>> = ['positions', 'history'];

/**
 * Posiciones e historial. Hasta que exista el WebSocket de cuenta solo muestra el estado vacío:
 * el cliente no inventa posiciones ni resultados.
 */
export function PositionsPanel() {
  const panelTab = useUiStore((state) => state.panelTab);
  const setTab = useUiStore((state) => state.setTab);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div
        role="group"
        aria-label={t('tabs.label')}
        className="hidden flex-none border-b border-line lg:flex"
      >
        {DESKTOP_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            aria-pressed={tab === panelTab}
            onClick={() => setTab(tab)}
            className={cx(
              'min-h-10 px-4 text-sm',
              tab === panelTab ? 'font-semibold shadow-[inset_0_-3px_0_var(--text)]' : 'text-muted',
            )}
          >
            {t(`tabs.${tab}`)}
          </button>
        ))}
      </div>
      <p className="p-4 text-sm text-muted">
        {t(panelTab === 'positions' ? 'positions.empty' : 'history.empty')}
      </p>
    </div>
  );
}
