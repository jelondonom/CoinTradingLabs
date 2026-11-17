import { describe, expect, it } from 'vitest';
import { AccountQueue } from './account-queue.js';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('AccountQueue', () => {
  it('procesa en serie y en orden las tareas de una misma cuenta', async () => {
    const queue = new AccountQueue();
    const log: string[] = [];
    const task = (name: string, ms: number) => async () => {
      log.push(`inicio ${name}`);
      await wait(ms);
      log.push(`fin ${name}`);
      return name;
    };

    const results = await Promise.all([
      queue.run('a', task('1', 20)),
      queue.run('a', task('2', 1)),
      queue.run('a', task('3', 1)),
    ]);

    expect(results).toEqual(['1', '2', '3']);
    expect(log).toEqual(['inicio 1', 'fin 1', 'inicio 2', 'fin 2', 'inicio 3', 'fin 3']);
  });

  it('no bloquea a otras cuentas', async () => {
    const queue = new AccountQueue();
    const log: string[] = [];
    await Promise.all([
      queue.run('a', async () => {
        await wait(20);
        log.push('a');
      }),
      queue.run('b', async () => {
        log.push('b');
      }),
    ]);
    expect(log).toEqual(['b', 'a']);
  });

  it('una tarea que falla no detiene la cola ni deja memoria ocupada', async () => {
    const queue = new AccountQueue();
    const failed = queue.run('a', async () => {
      throw new Error('falló');
    });
    const next = queue.run('a', async () => 'sigue');

    await expect(failed).rejects.toThrow('falló');
    await expect(next).resolves.toBe('sigue');
    await wait(1);
    expect(queue.size).toBe(0);
  });
});
