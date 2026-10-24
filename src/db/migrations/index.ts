import { sql as m001 } from './001_initial';
import { sql as m002 } from './002_settings_and_warnings';
import { sql as m003 } from './003_rules_goals_receipts';
import { sql as m004 } from './004_currencies';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** Ordered list; the version number is the PRAGMA user_version after it runs. */
export const migrations: readonly Migration[] = [
  { version: 1, name: 'initial', sql: m001 },
  { version: 2, name: 'settings_and_warnings', sql: m002 },
  { version: 3, name: 'rules_goals_receipts', sql: m003 },
  { version: 4, name: 'currencies', sql: m004 },
];
