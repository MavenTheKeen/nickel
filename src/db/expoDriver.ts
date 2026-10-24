import * as SQLite from 'expo-sqlite';

import { isExpoGo } from '@/platform/runtime';

import { getOrCreateDbKey, keyPragma } from './encryption';
import { createSerialDb } from './serialDb';
import type { Db } from './types';

export const DATABASE_NAME = 'nickel.db';

export interface DeviceDb {
  db: Db;
  /** True when SQLCipher is active. False in Expo Go, which ships plain SQLite. */
  encrypted: boolean;
}

async function open(name: string): Promise<DeviceDb> {
  const conn = await SQLite.openDatabaseAsync(name);
  let encrypted = false;
  if (!isExpoGo) {
    // The key must be the first statement on the connection.
    await conn.execAsync(keyPragma(await getOrCreateDbKey()));
    const cipher = await conn.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
    encrypted = !!cipher?.cipher_version;
  }
  // Fails here, not later, if the key does not match the file.
  await conn.getFirstAsync('SELECT count(*) FROM sqlite_master');
  await conn.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const db = createSerialDb({
    exec: (sql) => conn.execAsync(sql),
    run: async (sql, params) => {
      const r = await conn.runAsync(sql, [...params]);
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    all: (sql, params) => conn.getAllAsync(sql, [...params]),
    first: (sql, params) => conn.getFirstAsync(sql, [...params]),
  });
  return { db, encrypted };
}

let shared: Promise<DeviceDb> | null = null;

/**
 * The one connection for the process. The app and the background refresh
 * task share it, so all writes go through the same serial queue.
 */
export function getDeviceDb(): Promise<DeviceDb> {
  shared ??= open(DATABASE_NAME).catch((e: unknown) => {
    shared = null;
    throw e;
  });
  return shared;
}
