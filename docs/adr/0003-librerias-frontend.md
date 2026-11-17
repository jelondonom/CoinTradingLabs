# ADR-0003: Librerías del frontend

- Estado: aceptada
- Fecha: 2026-11-16

## Contexto

El Agente Frontend necesita gráficas de velas, estado compartido entre componentes y un sistema de
estilos para una interfaz responsiva. Las referencias de producto son MetaTrader y TradingView, y
los usuarios son principiantes en móvil y escritorio.

## Opciones

- Gráficas: Lightweight Charts, o una librería genérica de gráficas.
- Estado: Zustand, Redux Toolkit o solo contexto de React.
- Estilos: Tailwind CSS, CSS Modules o una librería de componentes.

## Decisión

Se aceptan en `apps/web` las dependencias que propuso el Agente Frontend en la rama
`feat/web-terminal-bocetos`:

- `lightweight-charts` 5.3.0: la librería de gráficas financieras de TradingView. Liviana y hecha
  para velas en tiempo real.
- `zustand` 5.1.0: estado global mínimo, sin plantillas. Los ticks llegan muchas veces por segundo
  y permite que cada componente se suscriba solo a lo que usa.
- `tailwindcss` y `@tailwindcss/vite` 4.3.5: estilos responsivos sin hojas de estilo por
  componente. Solo se usan en compilación.

## Consecuencias

- Ninguna de las cuatro afecta al servidor ni a los contratos de `packages/shared`.
- `lightweight-charts` exige mostrar la atribución a TradingView en la interfaz.
- Cambia `pnpm-lock.yaml`: el PR del frontend debe traer `main` antes de fusionarse.
- No se agrega una librería de componentes. Si hace falta, se decide en un ADR nuevo.
