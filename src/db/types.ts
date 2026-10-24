/**
 * The minimal database surface the repositories depend on. The app backs it
 * with expo-sqlite; tests back it with node:sqlite, so repository and
 * migration tests run against a real SQLite engine.
 */
export type SqlParam = string | number | null;

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface Db {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlParam[]): Promise<RunResult>;
  all<T>(sql: string, params?: readonly SqlParam[]): Promise<T[]>;
  first<T>(sql: string, params?: readonly SqlParam[]): Promise<T | null>;
  /**
   * Runs `fn` inside BEGIN/COMMIT. Any error rolls the whole transaction back.
   * Nested calls join the outer transaction.
   */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

/** A driver executes single statements; serialDb adds ordering and transactions on top. */
export interface Driver {
  exec(sql: string): Promise<void>;
  run(sql: string, params: readonly SqlParam[]): Promise<RunResult>;
  all<T>(sql: string, params: readonly SqlParam[]): Promise<T[]>;
  first<T>(sql: string, params: readonly SqlParam[]): Promise<T | null>;
}
