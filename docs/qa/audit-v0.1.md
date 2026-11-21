# Auditoría de dependencias — V0.1

- Responsable: Agente QA + Seguridad. Medido el 2026-11-21 sobre `main` en `7986425`.
- Comandos: `pnpm audit --json` (todas las dependencias) y `pnpm audit --prod` (solo las que se
  instalan en producción).
- Documentos hermanos: [`plan.md`](plan.md) (riesgo R15) y [`defectos.md`](defectos.md).

## Resumen

| Alcance                          | Críticas | Altas | Moderadas | Bajas |
| -------------------------------- | -------- | ----- | --------- | ----- |
| Todo el monorepo                 | 0        | 1     | 1         | 0     |
| Producción (`pnpm audit --prod`) | 0        | 0     | 0         | 0     |

Las dos alertas llegan solo por dependencias de desarrollo: la CLI de Prisma y el linter. Ninguna
se instala en producción ni se puede alcanzar con datos de un participante. Aun así, la casilla
"`pnpm audit` sin vulnerabilidades altas" del checklist **sigue sin cumplirse** mientras exista la
alerta alta de `effect`.

## Alertas abiertas

### `effect` — alta

| Campo             | Valor                                                                                                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aviso             | [GHSA-7589-6fvf-x4pw](https://github.com/advisories/GHSA-7589-6fvf-x4pw): ReDoS en la expresión regular que compila `Schema.TemplateLiteral`                                                                            |
| Versión instalada | 3.20.0 (vulnerables: ≤ 3.22.0)                                                                                                                                                                                          |
| Versión corregida | ≥ 3.22.1                                                                                                                                                                                                                |
| Ruta              | `apps/api > prisma > @prisma/config > effect` (también como dependencia par opcional de `@prisma/client`)                                                                                                               |
| Tipo              | Desarrollo: `prisma` es dependencia de desarrollo de `apps/api` (CLI para `generate` y migraciones)                                                                                                                     |
| ¿Explotable aquí? | No con datos de un participante. La API y el cliente generado no importan `effect` ni `@prisma/config`: solo lo carga la CLI de Prisma, que trabaja con archivos del equipo (`prisma.config.ts`, esquema y migraciones) |
| Dueño             | Backend (dependencias de `apps/api`), con el Arquitecto (`pnpm.overrides` en el `package.json` de la raíz)                                                                                                              |
| Recomendación     | Opción A (recomendada): override `effect >= 3.22.1` y verificar `prisma generate`, migraciones y `pnpm test`. Opción B: el Gerente acepta el riesgo por escrito hasta que Prisma publique la corrección                 |

Actualizar Prisma no lo arregla hoy: la versión más nueva de `@prisma/config` en npm todavía pide
`effect` 3.20.0.

### `minimatch` — moderada

| Campo             | Valor                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Aviso             | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249): denegación de servicio con patrones glob que se multiplican |
| Versión instalada | 10.2.6 (vulnerables: ≥ 7.0.0 y < 11.0.1)                                                                                              |
| Versión corregida | ≥ 11.0.1                                                                                                                              |
| Ruta              | `typescript-eslint` 8.72.2 `> @typescript-eslint/typescript-estree > minimatch` (7 rutas, todas desde la raíz)                        |
| Tipo              | Desarrollo: solo lo usa `pnpm lint`                                                                                                   |
| ¿Explotable aquí? | No: los patrones glob salen de la configuración del linter, que escribe el equipo                                                     |
| Dueño             | Arquitecto (dependencias de desarrollo de la raíz)                                                                                    |
| Recomendación     | Actualizar `typescript-eslint` a 8.73.0: su `@typescript-eslint/typescript-estree` ya pide `minimatch ^11.0.1`                        |

## Alertas que ya no aparecen

`picomatch` (alta, GHSA-fc5q-39xc-vjpf), reportada por QA el 2026-11-18 por la ruta
`apps/web > @tailwindcss/vite > vite`, ya no sale en `pnpm audit`. Sin embargo, no cambió ninguna
dependencia: `picomatch@4.0.7` sigue en `pnpm-lock.yaml`, y `apps/web/package.json` no cambia desde
`944d0a5`. Lo que cambió fue el aviso, que dejó de marcar esa versión. Por eso **D-15 (actualizar
`vite`) no consta como hecha**: la decisión sigue siendo del Frontend.

## Cómo repetir la medición

```bash
pnpm audit                   # resumen de todo el monorepo
pnpm audit --prod            # solo dependencias de producción
pnpm audit --json            # detalle: avisos, versiones y rutas
pnpm why effect -r           # de dónde viene un paquete
```

`pnpm audit` sale con código 1 si encuentra cualquier alerta. Cuando no queden altas, el CI puede
correr `pnpm audit --audit-level high` para que una alerta alta nueva lo ponga en rojo (pedido al
Arquitecto en `plan.md` §6).
