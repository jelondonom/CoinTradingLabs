# AGENTS.md

Guía común para los agentes y desarrolladores que trabajan en este repositorio. Las instrucciones
propias de cada rol (Arquitecto, Backend, Datos de Mercado, Frontend, QA) viven fuera del repo.

## Proyecto

Plataforma web de trading demo para el COIN Investment Challenge (COIN 12, EAFIT, 2027). Hasta 800
cuentas y entre 400 y 450 usuarios operando al mismo tiempo. Un solo servidor.

## Stack

TypeScript 5 en modo `strict`, Node.js 24, pnpm workspaces, Fastify, PostgreSQL 17 con Prisma,
Redis, React con Vite, Vitest, Docker Compose, Caddy y GitHub Actions. Logs en JSON con pino.

## Comandos

- `pnpm dev`: arranca Postgres, Redis y las tres apps.
- `pnpm test`: tests de todo el monorepo. Deben pasar antes de cada commit.
- `pnpm lint`: ESLint, Prettier y `tsc --noEmit`. Debe pasar antes de cada PR.
- `pnpm build`: compila todo para producción.

## Estructura y responsables

- `apps/api/`: API REST, motor de trading y WebSocket de cuenta. Agente Backend.
  - `apps/api/src/engine/`: motor puro (ejecución, P&L, saldo, equity).
  - `apps/api/src/modules/`: auth, accounts, orders, positions y leaderboard.
  - `apps/api/src/ws/`: WebSocket privado de cuenta.
  - `apps/api/src/errors/`: errores de negocio con código estable.
  - `apps/api/prisma/`: esquema, migraciones y seed.
  - `docs/engine-rules.md`: reglas del motor de trading.
- `apps/market-data/`: precios, velas y WebSocket de mercado. Agente Datos de Mercado.
- `apps/web/`: aplicación React. Agente Frontend.
- `packages/shared/`: contratos Zod. Agente Arquitecto.
- `infra/`, `.github/`, `docs/adr/`: Agente Arquitecto.
- `tests/e2e/`, `tests/load/`: Agente QA.

## Convenciones

- camelCase en variables y funciones, PascalCase en tipos, kebab-case en archivos.
- Tests junto al archivo: `foo.ts` y `foo.test.ts`.
- Conventional Commits, ramas cortas y PR pequeños; `main` siempre desplegable.
- Toda variable de entorno se declara en `.env.example` y se valida con Zod al arrancar.
- Los imports entre archivos TypeScript llevan extensión `.js` (módulos ES).
- Un ADR por decisión estructural en `docs/adr/`, de máximo una página.

## Lo que no se hace

- No cambiar un contrato de `packages/shared/` sin avisar a los agentes afectados.
- No instalar dependencias sin avisar y justificar.
- No subir archivos `.env*`, llaves ni respaldos.
- No introducir Kubernetes, microservicios, Kafka ni service mesh.
- No desplegar a producción sin CI en verde y sin el OK del Gerente.
