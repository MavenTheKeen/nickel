import type { Db, Driver, SqlParam } from './types';

/**
 * Wraps a driver so that every statement runs in order and a transaction holds
 * the connection until it finishes. Without this, an unrelated query issued
 * while a transaction awaits would run inside that transaction, and a rollback
 * would silently discard it.
 */
export function createSerialDb(driver: Driver): Db {
  let tail: Promise<unknown> = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task, task);
    tail = result.catch(() => undefined);
    return result;
  }

  // Handle given to code running inside a transaction: it talks to the driver
  // directly, because the queue is already held by the transaction.
  const inner: Db = {
    exec: (sql) => driver.exec(sql),
    run: (sql, params: readonly SqlParam[] = []) => driver.run(sql, params),
    all: (sql, params: readonly SqlParam[] = []) => driver.all(sql, params),
    first: (sql, params: readonly SqlParam[] = []) => driver.first(sql, params),
    transaction: (fn) => fn(inner),
  };

  return {
    exec: (sql) => enqueue(() => driver.exec(sql)),
    run: (sql, params = []) => enqueue(() => driver.run(sql, params)),
    all: (sql, params = []) => enqueue(() => driver.all(sql, params)),
    first: (sql, params = []) => enqueue(() => driver.first(sql, params)),
    transaction: (fn) =>
      enqueue(async () => {
        await driver.exec('BEGIN IMMEDIATE');
        try {
          const value = await fn(inner);
          await driver.exec('COMMIT');
          return value;
        } catch (error) {
          await driver.exec('ROLLBACK');
          throw error;
        }
      }),
  };
}
