# COIN Trading Labs

Plataforma web de trading demo para el COIN Investment Challenge (COIN 12, EAFIT).

## Requisitos

- Node.js 24
- pnpm 12 (`npm install -g pnpm`)
- Docker Desktop, o Docker Engine con Compose

## Arranque

```bash
pnpm install
```

```bash
pnpm dev
```

`pnpm dev` levanta Postgres y Redis con Compose, compila `packages/shared` y arranca las tres apps:

| Servicio    | URL                          |
| ----------- | ---------------------------- |
| Web         | http://localhost:5173        |
| API         | http://localhost:3000/health |
| Market data | http://localhost:3001/health |

No hace falta un archivo `.env` en desarrollo. Para cambiar un valor, copia `.env.example` a `.env`.

## Comandos

| Comando           | Qué hace                                      |
| ----------------- | --------------------------------------------- |
| `pnpm dev`        | Infraestructura local y todas las apps        |
| `pnpm test`       | Tests de todo el monorepo                     |
| `pnpm lint`       | ESLint, Prettier y `tsc --noEmit`             |
| `pnpm build`      | Compila todo para producción                  |
| `pnpm format`     | Aplica Prettier                               |
| `pnpm infra:up`   | Solo Postgres y Redis                         |
| `pnpm infra:down` | Detiene Postgres y Redis (conserva los datos) |

## Estructura

- `apps/api/`: API REST, motor de trading y WebSocket privado de cuenta.
- `apps/market-data/`: ingesta de precios, velas y WebSocket público de mercado.
- `apps/web/`: aplicación React.
- `docs/web/`: bocetos y notas de interfaz.
- `packages/shared/`: tipos, esquemas Zod y contratos entre módulos.
- `infra/`: Compose y, más adelante, Caddy y los scripts de despliegue y respaldo.
- `docs/adr/`: decisiones de arquitectura.
- `tests/`: pruebas del Agente QA + Seguridad (propiedades, carga, flujo completo, seguridad y
  auditoría). Paquete `@coin/qa`.
- `docs/qa/`: plan de pruebas, defectos y reglamento anti-trampa. Agente QA + Seguridad.

## Estado V0

- Saldo inicial de 100.000 USD, apalancamiento 1:1, solo órdenes market.
- Catálogo de 31 símbolos: 10 cripto, 14 acciones y ETF, 6 materias primas y EURUSD.
- Los precios son simulados: todavía no hay un proveedor de mercado conectado.
- Los contratos están en `packages/shared` y sus convenciones en `docs/adr/0002-contratos-v0.md`.

## Convenciones

- camelCase en variables y funciones, PascalCase en tipos, kebab-case en archivos.
- Tests junto al archivo: `foo.ts` y `foo.test.ts`.
- Conventional Commits, ramas cortas y PR pequeños; `main` siempre desplegable.
- Toda variable de entorno se declara en `.env.example` y se valida con Zod al arrancar.
- No se cambia un contrato de `packages/shared` sin avisar a los agentes afectados.
