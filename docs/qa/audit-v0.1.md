# Auditoría de dependencias — V0.1

- Responsable: Agente QA + Seguridad. Primera medición el 2026-11-21 sobre `main` en `7986425`.
  Vuelta a medir el 2026-11-22 sobre `main` en `de42884`, después del override de `effect`
  (PR #30).
- Comandos: `pnpm audit --json` (todas las dependencias) y `pnpm audit --prod` (solo las que se
  instalan en producción).
- Documentos hermanos: [`plan.md`](plan.md) (riesgo R15) y [`defectos.md`](defectos.md).

## Resumen al 2026-11-22

| Alcance                          | Críticas | Altas | Moderadas | Bajas |
| -------------------------------- | -------- | ----- | --------- | ----- |
| Todo el monorepo                 | 0        | 0     | 1         | 0     |
| Producción (`pnpm audit --prod`) | 0        | 0     | 0         | 0     |

**Ya no hay alertas altas**: la casilla "`pnpm audit` sin vulnerabilidades altas" del checklist se
cumple. Queda una moderada, `minimatch`, que llega solo por el linter.

## Alertas abiertas

### `minimatch` — moderada

| Campo             | Valor                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Aviso             | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249): denegación de servicio con patrones glob que se multiplican |
| Versión instalada | 10.2.6 (vulnerables: ≥ 7.0.0 y < 11.0.1)                                                                                              |
| Versión corregida | ≥ 11.0.1                                                                                                                              |
| Ruta              | `typescript-eslint` 8.72.2 `> @typescript-eslint/typescript-estree > minimatch` (7 rutas, todas desde la raíz)                        |
| Tipo              | Desarrollo: solo lo usa `pnpm lint`                                                                                                   |
| ¿Explotable aquí? | No: los patrones glob salen de la configuración del linter, que escribe el equipo                                                     |
| Dueño             | Arquitecto (dependencias de desarrollo de la raíz); la deja para después                                                              |
| Recomendación     | Actualizar `typescript-eslint` a 8.73.0: su `@typescript-eslint/typescript-estree` ya pide `minimatch ^11.0.1`                        |

## Alertas cerradas

### `effect` — alta (cerrada el 2026-11-22)

- Aviso [GHSA-7589-6fvf-x4pw](https://github.com/advisories/GHSA-7589-6fvf-x4pw): ReDoS en la
  expresión regular que compila `Schema.TemplateLiteral`. Llegaba con `effect` 3.20.0 por la CLI de
  Prisma (`apps/api > prisma > @prisma/config > effect`), solo en desarrollo.
- Cómo se cerró: el Arquitecto agregó en `pnpm-workspace.yaml` el override
  `'@prisma/config>effect': ~3.22.1` (PR #30, `69a25cd`). Prisma todavía no publicaba una versión
  con la corrección.
- Verificación de QA sobre `main` en `de42884`: `pnpm audit` ya no muestra la alerta,
  `pnpm why effect -r` da `effect@3.22.5` y `pnpm test` pasa. El Backend revisó además
  `prisma validate` y `prisma generate`.
- Si el lockfile cambia la versión de `effect`, hay que volver a correr `prisma validate` (está
  anotado junto al override).

### `picomatch` — alta (dejó de aparecer)

`picomatch` (GHSA-fc5q-39xc-vjpf), reportada por QA el 2026-11-18 por la ruta
`apps/web > @tailwindcss/vite > vite`, ya no sale en `pnpm audit`. Sin embargo, no cambió ninguna
dependencia: `picomatch@4.0.7` sigue en `pnpm-lock.yaml`. Lo que cambió fue el aviso, que dejó de
marcar esa versión. Por eso D-15 (actualizar `vite`) no constaba como hecha cuando se midió.

## Cómo repetir la medición

```bash
pnpm audit                   # resumen de todo el monorepo
pnpm audit --prod            # solo dependencias de producción
pnpm audit --json            # detalle: avisos, versiones y rutas
pnpm why effect -r           # de dónde viene un paquete
```

`pnpm audit` sale con código 1 si encuentra cualquier alerta, aunque sea moderada. Como ya no quedan
altas, el CI puede correr `pnpm audit --audit-level high` para que una alerta alta nueva lo ponga en
rojo (pedido al Arquitecto en `plan.md` §6).
