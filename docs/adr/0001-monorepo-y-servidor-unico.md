# ADR-0001: Monorepo con pnpm y despliegue en un solo servidor

- Estado: aceptada
- Fecha: 2026-11-16

## Contexto

COIN Trading Labs es una plataforma de trading demo para COIN 12: hasta 800 cuentas y entre 400 y
450 usuarios operando al mismo tiempo, con un catálogo cerrado de símbolos. El equipo es pequeño y
la plataforma debe estar arriba durante el evento.

## Opciones

1. Un repositorio por servicio.
2. Monorepo con pnpm workspaces y un servidor con Docker Compose.
3. Monorepo con orquestación (Kubernetes) y servicios desacoplados por una cola.

## Decisión

Opción 2.

- Un monorepo con `apps/api`, `apps/market-data`, `apps/web` y `packages/shared`.
- `packages/shared` es la única fuente de contratos (Zod). Se compila a `dist` y las apps lo
  consumen como dependencia del workspace.
- Sin orquestador de tareas: `pnpm -r` ejecuta los scripts en orden de dependencias.
- En local, Compose levanta solo Postgres y Redis; las apps corren con `pnpm dev`.
- En desarrollo Vite hace de proxy hacia `api` y `market-data`. En staging y producción ese papel
  lo cumple Caddy, así el navegador siempre habla con un solo origen.
- Versiones fijadas el 2026-11-16: Node.js 24 y TypeScript 5.9, como define el stack del proyecto.

## Consecuencias

- Un cambio de contrato y su uso viajan en el mismo PR.
- Un solo servidor es un punto único de falla: lo cubren los respaldos y el runbook.
- Escalar más allá de un servidor exige una prueba de carga que lo justifique y un ADR nuevo.
- Pendiente de decisión del Gerente: Node.js 26 ya es la versión LTS activa y TypeScript 7 ya es
  estable. Nos quedamos en Node 24 (con soporte de mantenimiento) y TypeScript 5.9 porque así lo
  fija el stack y porque `typescript-eslint` 8 todavía no admite TypeScript 7.
