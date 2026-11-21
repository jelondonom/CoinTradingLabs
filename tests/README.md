# tests/

Carpeta del **Agente QA + Seguridad**. Paquete `@coin/qa` del monorepo. Ningún otro agente
escribe aquí sin avisar a QA; QA no escribe en `apps/` ni en `packages/`.

| Carpeta       | Contenido                                               | Herramienta         | Estado                        |
| ------------- | ------------------------------------------------------- | ------------------- | ----------------------------- |
| `properties/` | Invariantes contables del motor                         | Vitest y fast-check | 16 propiedades                |
| `load/`       | Escenarios de carga                                     | k6                  | 1 escenario, sin ejecutar     |
| `e2e/`        | Flujos completos en navegador, escritorio y móvil       | Playwright          | Vacía                         |
| `security/`   | Autorización, validación de entradas y abuso            | Vitest y fast-check | Payloads v2; sesión pendiente |
| `audit/`      | Consultas y scripts de auditoría del ranking y el libro | SQL sobre Postgres  | Vacía                         |

Los reportes viven en `docs/qa/`: plan de pruebas, defectos y reglamento anti-trampa.

## Comandos

```bash
pnpm --filter @coin/qa test
```

`pnpm test` en la raíz también corre este paquete.

## Convenciones

- Deterministas: semilla fija, sin reloj ni red. Única excepción: los `*.integration.test.ts`
  usan el Postgres local (`pnpm infra:up`) o el del CI, cada uno con su propia base.
- Un defecto demostrado va en un caso `it.fails` con su ID (`DEF-001`). Pasa mientras el defecto
  existe y se pone en rojo cuando se corrige; ahí QA vuelve a probar y lo cierra.
- Las pruebas importan el código de `apps/` por ruta relativa (por ejemplo
  `../../apps/api/src/engine/`) y nunca lo modifican.
- El CI falla si un test queda omitido: un test que necesite Postgres no puede depender de nada
  que el CI no tenga.
