import { t } from '../i18n/index.js';
import { cx } from '../lib/cx.js';
import { useUiStore, type PanelTab } from '../stores/ui-store.js';

const MOBILE_TABS: readonly PanelTab[] = ['trade', 'positions', 'history'];
/** En escritorio el ticket siempre está a la vista: no hace falta la pestaña de operar. */
const DESKTOP_TABS: readonly PanelTab[] = ['positions', 'history'];

type PanelTabsProps = {
  isDesktop: boolean;
  /** En celular las pestañas solo se ven en la terminal. */
  visible?: boolean;
};

/**
 * Pestañas del panel. La página tiene una sola copia: en celular van bajo la gráfica y en
 * escritorio arriba del panel inferior (regla 6 de `docs/qa/data-testid.md`). Cada forma marca su
 * propia pestaña activa: `mobileTab` en celular y `panelTab` en escritorio.
 */
export function PanelTabs({ isDesktop, visible = true }: PanelTabsProps) {
  const mobileTab = useUiStore((state) => state.mobileTab);
  const panelTab = useUiStore((state) => state.panelTab);
  const setTab = useUiStore((state) => state.setTab);
  const active: PanelTab = isDesktop ? panelTab : mobileTab;

  return (
    <div
      role="group"
      aria-label={t('tabs.label')}
      className={cx(
        visible ? 'flex' : 'hidden',
        'flex-none border-b border-line',
        !isDesktop && 'bg-surface',
      )}
    >
      {(isDesktop ? DESKTOP_TABS : MOBILE_TABS).map((tab) => (
        <button
          key={tab}
          type="button"
          aria-pressed={tab === active}
          onClick={() => setTab(tab)}
          className={cx(
            isDesktop ? 'min-h-10 px-4 text-sm' : 'min-h-11 flex-1 text-sm',
            tab === active
              ? cx(isDesktop ? 'font-semibold' : 'font-bold', 'shadow-[inset_0_-3px_0_var(--text)]')
              : 'text-muted',
          )}
        >
          {t(`tabs.${tab}`)}
        </button>
      ))}
    </div>
  );
}
