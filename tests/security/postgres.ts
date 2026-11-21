/**
 * Base de datos propia para las pruebas de QA contra Postgres. Se recrea en cada corrida con las
 * migraciones de `apps/api/prisma`, como los tests de integración del Backend, y usa la misma
 * variable `TEST_DATABASE_ADMIN_URL`. Cada archivo usa un nombre distinto para no chocar con otros
 * tests que corren en paralelo.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createDb } from '../../apps/api/src/db/prisma.js';

const ADMIN_URL =
  process.env.TEST_DATABASE_ADMIN_URL ?? 'postgresql://coin:coin@localhost:5432/coin';
const MIGRATIONS = new URL('../../apps/api/prisma/migrations/', import.meta.url);

/**
 * Crea la base `name` desde cero y devuelve su URL. Devuelve `null` si no hay Postgres: en local
 * la suite se omite; en el CI siempre hay Postgres y un test omitido hace fallar la corrida.
 */
export async function prepareDatabase(name: string): Promise<string | null> {
  if (!/^[a-z_]+$/.test(name)) throw new Error(`Nombre de base inválido: ${name}`);

  const admin = createDb(ADMIN_URL);
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE ${name}`);
  } catch {
    return null;
  } finally {
    await admin.$disconnect();
  }

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const db = createDb(url.href);
  try {
    const folders = readdirSync(MIGRATIONS, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const folder of folders) {
      await db.$executeRawUnsafe(
        readFileSync(new URL(`${folder}/migration.sql`, MIGRATIONS), 'utf8'),
      );
    }
  } finally {
    await db.$disconnect();
  }
  return url.href;
}
