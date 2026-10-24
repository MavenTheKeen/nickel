/**
 * @jest-environment node
 */
import { createBackup, parseBackup, restoreBackup } from '@/db/backup';
import { migrate } from '@/db/migrate';
import { migrations } from '@/db/migrations';
import {
  addTransaction,
  allTransactions,
  getTransaction,
  updateTransaction,
} from '@/db/repositories/transactions';
import { getRate } from '@/hooks/fxRates';
import { RateUnavailableError } from '@/services/fx';

import { seededDb, tx } from '../helpers/fixtures';
import { openTestDb } from '../helpers/testDb';

const SCHEMA = migrations.at(-1)!.version;
const TODAY = '2025-06-20';

function fakeFetch(rate: number, date = '2025-06-13') {
  return jest.fn(async (input: RequestInfo | URL) => {
    const [, base = '', quote = ''] = /rate\/(\w+)\/(\w+)/.exec(String(input)) ?? [];
    return {
      ok: true,
      status: 200,
      json: async () => ({ date, base: base.toUpperCase(), quote: quote.toUpperCase(), rate }),
    } as unknown as Response;
  });
}

describe('getRate', () => {
  it('downloads a rate once and then answers from the stored copy', async () => {
    const { db } = await seededDb();
    const fetch = fakeFetch(1.571);
    expect(await getRate(db, 'EUR', 'CAD', '2025-06-14', TODAY, fetch)).toEqual({
      rateMicros: 1_571_000,
      rateDate: '2025-06-13',
      source: 'network',
    });
    expect(await getRate(db, 'EUR', 'CAD', '2025-06-14', TODAY, fetch)).toMatchObject({
      source: 'cache',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]![0])).toContain('/v2/rate/eur/cad?date=2025-06-14');
  });

  it('stores today and future dates under today, using the latest rate', async () => {
    const { db } = await seededDb();
    const fetch = fakeFetch(1.6, TODAY);
    await getRate(db, 'EUR', 'CAD', '2025-07-01', TODAY, fetch);
    await getRate(db, 'EUR', 'CAD', TODAY, TODAY, fetch);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]![0])).not.toContain('date=');
  });

  it('needs no rate for the home currency', async () => {
    const { db } = await seededDb();
    const fetch = fakeFetch(2);
    expect(await getRate(db, 'CAD', 'CAD', TODAY, TODAY, fetch)).toMatchObject({
      rateMicros: 1_000_000,
      source: 'same',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to the newest stored rate when offline, and fails without one', async () => {
    const { db } = await seededDb();
    await getRate(db, 'EUR', 'CAD', '2025-06-10', TODAY, fakeFetch(1.5, '2025-06-10'));
    await getRate(db, 'EUR', 'CAD', '2025-06-12', TODAY, fakeFetch(1.55, '2025-06-12'));
    const offline = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    expect(await getRate(db, 'EUR', 'CAD', '2025-06-18', TODAY, offline)).toEqual({
      rateMicros: 1_550_000,
      rateDate: '2025-06-12',
      source: 'offline',
    });
    await expect(getRate(db, 'GBP', 'CAD', '2025-06-18', TODAY, offline)).rejects.toThrow(
      RateUnavailableError,
    );
  });
});

describe('foreign amounts', () => {
  const original = { minor: -2400, currency: 'EUR', rateMicros: 1_571_000 };

  it('are stored with the transaction and kept or cleared on update', async () => {
    const { db, cats } = await seededDb();
    const id = await addTransaction(db, {
      ...tx({ categoryId: cats['Eating out']!.id, amountCents: -3770 }),
      original,
    });
    expect((await getTransaction(db, id))?.original).toEqual(original);
    const fields = {
      amountCents: -3770,
      date: '2025-06-10',
      categoryId: cats['Eating out']!.id,
      note: 'dinner',
      merchant: '',
    };
    await updateTransaction(db, id, fields);
    expect((await getTransaction(db, id))?.original).toEqual(original);
    await updateTransaction(db, id, { ...fields, original: null });
    expect((await getTransaction(db, id))?.original).toBeNull();
  });

  it('reject an invalid currency code', async () => {
    const { db, cats } = await seededDb();
    await expect(
      addTransaction(db, {
        ...tx({ categoryId: cats.Fun!.id }),
        original: { minor: -1, currency: 'eur', rateMicros: 1 },
      }),
    ).rejects.toThrow();
  });

  it('survive a backup and restore', async () => {
    const { db, cats } = await seededDb();
    await addTransaction(db, { ...tx({ categoryId: cats.Fun!.id, amountCents: -3770 }), original });
    const backup = await createBackup(db);
    const target = await seededDb();
    await restoreBackup(target.db, parseBackup(JSON.stringify(backup), SCHEMA));
    expect((await allTransactions(target.db))[0]?.original).toEqual(original);
  });
});

describe('schema 4', () => {
  it('upgrades a version 3 database with data', async () => {
    const db = openTestDb();
    await migrate(db, migrations.slice(0, 3));
    await db.run("INSERT INTO categories (name, color, icon) VALUES ('Food', '#000000', 'food')");
    await db.run(
      "INSERT INTO transactions (amount_cents, date, category_id, created_at, receipt) VALUES (-500, '2025-01-02', 1, 'x', 'a.jpg')",
    );
    expect(await migrate(db)).toEqual({ from: 3, to: SCHEMA });
    expect(
      await db.first(
        'SELECT receipt, original_minor, original_currency, fx_rate_micros FROM transactions',
      ),
    ).toEqual({
      receipt: 'a.jpg',
      original_minor: null,
      original_currency: null,
      fx_rate_micros: null,
    });
  });
});
