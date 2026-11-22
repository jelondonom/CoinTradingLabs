# tests/e2e/

Carpeta del Agente QA + Seguridad. Flujos completos con Playwright, en escritorio y con emulación de
celular.

Todavía no tiene pruebas: el E2E es de la fase 2, cuando la web tenga el flujo completo. El alcance
está en `docs/qa/plan.md` (riesgo R14).

- **Cómo encuentran las pruebas cada elemento:** con los `data-testid` de
  [`docs/qa/data-testid.md`](../../docs/qa/data-testid.md). Ahí están las reglas, los nombres por
  pantalla y el flujo completo paso a paso.
- **Tamaños de pantalla:** celular de 360×740 (táctil) y escritorio de 1280×800, en Chromium. WebKit
  en celular se suma en la fase 2.
- Playwright todavía no está instalado: se pide OK antes de agregarlo como dependencia.
