/**
 * Cola en serie por cuenta: dos tareas de la misma cuenta nunca corren a la vez; las de
 * cuentas distintas sí. Es la primera barrera; la segunda es el bloqueo de la fila de la
 * cuenta dentro de la transacción, que también protege si hay más de un proceso.
 */
export class AccountQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(accountId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(accountId) ?? Promise.resolve();
    // La tarea siguiente corre aunque la anterior haya fallado.
    const result = previous.then(task, task);
    const tail = result.catch(() => undefined);
    this.tails.set(accountId, tail);
    void tail.then(() => {
      if (this.tails.get(accountId) === tail) this.tails.delete(accountId);
    });
    return result;
  }

  /** Cuentas con tareas pendientes. */
  get size(): number {
    return this.tails.size;
  }
}
