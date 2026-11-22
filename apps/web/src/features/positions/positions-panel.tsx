import { PanelTabs } from '../../components/panel-tabs.js';
import { t } from '../../i18n/index.js';
import { useUiStore } from '../../stores/ui-store.js';

/**
 * Posiciones e historial. Hasta que exista el WebSocket de cuenta solo muestra el estado vacío:
 * el cliente no inventa posiciones ni resultados. En escritorio lleva sus pestañas arriba; en
 * celular las pestañas van bajo la gráfica (`app.tsx`).
 */
export function PositionsPanel({ isDesktop }: { isDesktop: boolean }) {
  const panelTab = useUiStore((state) => state.panelTab);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      {isDesktop && <PanelTabs isDesktop />}
      <p
        data-testid={panelTab === 'positions' ? 'positions-empty' : undefined}
        className="p-4 text-sm text-muted"
      >
        {t(panelTab === 'positions' ? 'positions.empty' : 'history.empty')}
      </p>
    </div>
  );
}
