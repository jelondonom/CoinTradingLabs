import type { Db } from '../../db/prisma.js';
import { dec } from '../../engine/index.js';
import { hashEnrollmentCode } from '../auth/enrollment-code.js';

export type CreateAccountInput = {
  competitionId: string;
  displayName: string;
  /** Código de inscripción en claro. Solo se guarda su hash. */
  enrollmentCode: string;
  now: Date;
};

/**
 * Crea el usuario y su cuenta demo con el saldo inicial de la competencia.
 * El saldo nace del primer asiento contable (`initial_deposit`), en la misma transacción.
 */
export async function createAccount(
  db: Db,
  input: CreateAccountInput,
): Promise<{ userId: string; accountId: string }> {
  return db.$transaction(async (tx) => {
    const competition = await tx.competition.findUniqueOrThrow({
      where: { id: input.competitionId },
    });
    const initialBalance = dec(competition.initialBalance.toString()).toFixed(2);

    const user = await tx.user.create({
      data: {
        loginId: hashEnrollmentCode(input.enrollmentCode),
        displayName: input.displayName,
        createdAt: input.now,
      },
    });
    const account = await tx.account.create({
      data: {
        userId: user.id,
        competitionId: competition.id,
        initialBalance,
        balance: initialBalance,
        leverage: competition.leverage,
        createdAt: input.now,
      },
    });
    await tx.ledgerEntry.create({
      data: {
        accountId: account.id,
        type: 'initial_deposit',
        amount: initialBalance,
        balanceAfter: initialBalance,
        createdAt: input.now,
      },
    });
    await tx.auditLog.create({
      data: {
        accountId: account.id,
        actor: 'system',
        action: 'account.created',
        entityType: 'account',
        entityId: account.id,
        payload: { userId: user.id, competitionId: competition.id, initialBalance },
        createdAt: input.now,
      },
    });
    return { userId: user.id, accountId: account.id };
  });
}
