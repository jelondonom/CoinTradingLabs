import { readFileSync, readdirSync } from 'node:fs';
import pg from 'pg';

/**
 * Bases de Postgres desechables para los tests de integración. Solo para tests: el build de
 * producción excluye `src/testing/` (`tsconfig.build.json`).
 */
const ADMIN_URL =
  process.env.TEST_DATABASE_ADMIN_URL ?? 'postgresql://coin:coin@localhost:5432/coin';
const MIGRATIONS = new URL('../../prisma/migrations/', import.meta.url);

/**
 * Recrea la base `name` y le aplica todas las migraciones en orden. Cada archivo de integración
 * usa un nombre propio: dos archivos que recrearan la misma base en paralelo chocarían.
 * Devuelve su URL, o `null` si no hay Postgres. En el CI siempre hay Postgres (`ci.yml`) y
 * ningún test puede quedar saltado; en local hace falta `pnpm infra:up`.
 */
export async function prepareTestDatabase(name: string): Promise<string | null> {
  // El nombre va dentro de SQL sin parámetros (DROP/CREATE DATABASE no los admiten).
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error(`Nombre de base inválido: ${name}`);

  const admin = new pg.Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 1500 });
  try {
    await admin.connect();
  } catch {
    return null;
  }
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  try {
    const folders = readdirSync(MIGRATIONS, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const folder of folders) {
      await client.query(readFileSync(new URL(`${folder}/migration.sql`, MIGRATIONS), 'utf8'));
    }
  } finally {
    await client.end();
  }
  return url.href;
}
