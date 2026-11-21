# tests/security/

Carpeta del Agente QA + Seguridad: autorización, validación de entradas y abuso. El alcance y los
riesgos están en `docs/qa/plan.md`; los defectos, en `docs/qa/defectos.md`.

| Archivo                       | Qué prueba                                                                                                     | Necesita |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- | -------- |
| `payloads-v2.test.ts`         | Payloads manipulados contra los esquemas v2 de login, orden, cierre y consulta de velas                        | Nada     |
| `api-conformance.test.ts`     | La API real frente al contrato: rechaza con 400, sin tocar la base, lo que el contrato rechaza                 | Nada     |
| `def-003.integration.test.ts` | Regresión de DEF-003 (cerrado): una cantidad que no cabe en `DECIMAL(28,8)` responde 422, sin orden y auditada | Postgres |
| `payload-arbitraries.ts`      | Generadores de fast-check: cuerpos válidos y manipulados                                                       | —        |
| `api-harness.ts`              | Arma la API real (`buildApp`) con reloj fijo, sesión de prueba y una base falsa que anota accesos              | —        |

La sesión de prueba (`sessionHeaders`) manda el mismo token firmado como `Authorization: Bearer` y
como cookie `coin_session`: así las pruebas siguen sirviendo cuando el login pase a cookie (D-04).
Las bases con Postgres se crean con `prepareTestDatabase` de `apps/api/src/testing/test-database.ts`,
el mismo ayudante que usan los tests de integración del Backend.

## Cómo correr

```bash
pnpm --filter @coin/qa test
```

Los casos con Postgres usan `TEST_DATABASE_ADMIN_URL` (por defecto la base local de
`pnpm infra:up`). Sin Postgres se omiten en local; en el CI siempre corren, porque el CI falla si
algún test queda omitido.

## Reglas de esta carpeta

- Semilla fija `20270101`, como en `tests/properties/`.
- Los valores válidos salen de `@coin/shared` (`SYMBOLS`, `CANDLE_INTERVALS`, los esquemas), sin
  copias.
- La API y la base se importan de `apps/api` por ruta relativa y nunca se modifican.
- Cada archivo con Postgres usa su propia base (`coin_qa_<tema>`) para no chocar con otros tests
  que corren en paralelo.
- Un defecto demostrado va en un `it.fails` con su ID. Cada `it.fails` contra la base tiene al lado
  un caso de control normal: si el montaje falla, el control se pone en rojo y el `it.fails` no
  pasa por la razón equivocada.
