# AGENTS.md

Guía común para los agentes y desarrolladores que trabajan en este repositorio. Las instrucciones
propias de cada rol (Arquitecto, Backend, Datos de Mercado, Frontend, QA) viven fuera del repo.

## Proyecto

Plataforma web de trading demo para el COIN Investment Challenge (COIN 12, EAFIT, 2027). Hasta 800
cuentas y entre 400 y 450 usuarios operando al mismo tiempo. Un solo servidor.

## Stack

TypeScript 5 en modo `strict`, Node.js 24, pnpm workspaces, Fastify, PostgreSQL 17 con Prisma,
Redis, React con Vite, Vitest, Docker Compose, Caddy y GitHub Actions. Logs en JSON con pino.
Frontend: Lightweight Charts, Zustand y Tailwind CSS (ver `docs/adr/0003-librerias-frontend.md`).

## Comandos

- `pnpm dev`: arranca Postgres, Redis y las tres apps.
- `pnpm test`: tests de todo el monorepo. Deben pasar antes de cada commit. En el CI corren con
  PostgreSQL y Redis, y ningún test puede quedar `skipped`: el CI falla. Para un defecto conocido
  usa `it.fails`, no `it.skip`.
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
- `apps/web/`: aplicación React. Agente Frontend. El detalle de sus carpetas está en
  `apps/web/README.md`.
- `docs/web/`: bocetos y notas de interfaz. Agente Frontend.
- `packages/shared/`: contratos Zod. Agente Arquitecto.
- `infra/`, `.github/`, `docs/adr/`: Agente Arquitecto.
- `tests/` (`properties/`, `load/`, `e2e/`, `security/`, `audit/`) y `docs/qa/`: Agente QA +
  Seguridad. Paquete `@coin/qa`. Ver `tests/README.md`.

## Convenciones

- camelCase en variables y funciones, PascalCase en tipos, kebab-case en archivos.
- Tests junto al archivo: `foo.ts` y `foo.test.ts`.
- Conventional Commits, ramas cortas y PR pequeños; `main` siempre desplegable.
- Toda variable de entorno se declara en `.env.example` y se valida con Zod al arrancar.
- Los imports entre archivos TypeScript llevan extensión `.js` (módulos ES).
- Un ADR por decisión estructural en `docs/adr/`, de máximo una página.

## Ramas y trabajo en paralelo

- Una sesión por rol. Una rama por agente y por tarea. Dos agentes nunca escriben en la misma rama.
- Cada tarea en su propia carpeta:
  `git worktree add -b <rama> ../ctl-<agente>-<tarea> origin/main`. Antes de empezar, revisa
  `git worktree list` y `git status -sb`. No escribas en la carpeta de otro agente ni le cambies
  la rama (tampoco a `C:\dev\CoinTradingLabs`, que comparten varios): solo mírala.
- Si `main` avanzó mientras trabajabas, trae `main` a tu rama antes de abrir el PR.
- Si aparece un conflicto, lo resuelve el agente dueño de la rama.
- Todo cambio llega a `main` por PR, sin excepciones. Solo se fusiona con la última corrida del CI
  en verde y con `main` ya traído a la rama. Si `main` avanzó después de esa corrida, trae `main`
  y espera una corrida nueva.
- Después de fusionar, borra la rama remota y la carpeta (`git worktree remove`). En Windows
  quedan carpetas `node_modules`: comprueba primero que no queda nada más
  (`find <carpeta> -path '*/node_modules' -prune -o -type f -print` no imprime nada) y luego
  bórralas con `cmd /c rd /s /q`.

## Cambios de reglas del motor

- Cuando una decisión (D-xx) cambia una regla del motor, el Backend actualiza la tabla de
  `docs/engine-rules.md` y avisa a QA. QA pone al día sus propiedades en su propio PR.
- El PR del Backend no se fusiona hasta que el de QA esté listo. Si hace falta, el de QA entra
  antes, con `it.fails` en lo que todavía no cumple el motor.
- Única excepción a escribir en carpeta ajena: el PR que arregla un defecto voltea su `it.fails`
  en `tests/properties/engine-defects.test.ts`, y nada más de `tests/`.

## Lo que no se hace

- No cambiar un contrato de `packages/shared/` sin avisar a los agentes afectados.
- No copiar reglas que viven en `packages/shared/` (`MIN_ORDER_USD`, `staleAfterMs`,
  `MAX_TICK_FUTURE_MS`, motivos de rechazo): se importan.
- No instalar dependencias sin avisar y justificar.
- No subir archivos `.env*`, llaves ni respaldos.
- No introducir Kubernetes, microservicios, Kafka ni service mesh.
- No desplegar a producción sin CI en verde y sin el OK del Gerente.
