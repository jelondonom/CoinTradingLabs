import { INITIAL_BALANCE_USD, INSTRUMENTS } from '@coin/shared';
import { loadEnv } from '../env.js';
import { createAccount } from '../modules/accounts/create-account.js';
import { hashEnrollmentCode } from '../modules/auth/enrollment-code.js';
import { createDb, type Db } from './prisma.js';
import { seedInstruments } from './seed-instruments.js';

const DEV_COMPETITION_NAME = 'COIN Investment Challenge (desarrollo)';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Cuentas de prueba, solo para desarrollo local. Sus códigos de inscripción son públicos:
 * nunca se cargan en producción.
 */
const DEV_ACCOUNTS = [
  { displayName: 'Demo 1', enrollmentCode: 'DEMO1-AAAAA' },
  { displayName: 'Demo 2', enrollmentCode: 'DEMO2-BBBBB' },
  { displayName: 'Demo 3', enrollmentCode: 'DEMO3-CCCCC' },
];

async function seedDevelopment(db: Db, now: Date): Promise<void> {
  const competition =
    (await db.competition.findFirst({ where: { name: DEV_COMPETITION_NAME } })) ??
    (await db.competition.create({
      data: {
        name: DEV_COMPETITION_NAME,
        startsAt: new Date(now.getTime() - DAY_MS),
        endsAt: new Date(now.getTime() + 365 * DAY_MS),
        initialBalance: INITIAL_BALANCE_USD.toFixed(2),
        leverage: 1,
      },
    }));

  for (const account of DEV_ACCOUNTS) {
    const loginId = hashEnrollmentCode(account.enrollmentCode);
    if (await db.user.findUnique({ where: { loginId } })) continue;
    await createAccount(db, { competitionId: competition.id, ...account, now });
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  const db = createDb(env.databaseUrl);
  try {
    await seedInstruments(db);
    console.log(`Instrumentos cargados: ${INSTRUMENTS.length}.`);
    if (env.nodeEnv === 'production') {
      console.log('Producción: no se crean la competencia ni las cuentas de prueba.');
    } else {
      await seedDevelopment(db, new Date());
      console.log(`Competencia y ${DEV_ACCOUNTS.length} cuentas de prueba listas.`);
    }
  } finally {
    await db.$disconnect();
  }
}

await main();
