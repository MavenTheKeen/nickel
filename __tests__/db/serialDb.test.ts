/**
 * @jest-environment node
 */
import { openMigratedDb } from '../helpers/testDb';

async function withCategory() {
  const db = await openMigratedDb();
  await db.run("INSERT INTO categories (name, color, icon) VALUES ('Food', '#000000', 'food')");
  return db;
}

const insert =
  "INSERT INTO transactions (amount_cents, date, category_id, created_at) VALUES (?, '2025-01-01', 1, 'x')";

describe('serial transactions', () => {
  it('commits all statements together', async () => {
    const db = await withCategory();
    await db.transaction(async (tx) => {
      await tx.run(insert, [-1]);
      await tx.run(insert, [-2]);
    });
    expect(await db.first('SELECT COUNT(*) AS n FROM transactions')).toEqual({ n: 2 });
  });

  it('rolls everything back on error', async () => {
    const db = await withCategory();
    await expect(
      db.transaction(async (tx) => {
        await tx.run(insert, [-1]);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await db.first('SELECT COUNT(*) AS n FROM transactions')).toEqual({ n: 0 });
  });

  it('does not let an outside write slip into a transaction that later rolls back', async () => {
    const db = await withCategory();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const failing = db.transaction(async (tx) => {
      await tx.run(insert, [-1]);
      await gate;
      throw new Error('rollback');
    });
    // Issued while the transaction is waiting; must run after it, not inside it.
    const outside = db.run(insert, [-99]);
    release();
    await expect(failing).rejects.toThrow('rollback');
    await outside;
    expect(await db.all('SELECT amount_cents FROM transactions')).toEqual([{ amount_cents: -99 }]);
  });

  it('keeps working after a failed statement', async () => {
    const db = await withCategory();
    await expect(db.run('NOT SQL')).rejects.toThrow();
    await db.run(insert, [-5]);
    expect(await db.first('SELECT COUNT(*) AS n FROM transactions')).toEqual({ n: 1 });
  });

  it('joins nested transactions into the outer one', async () => {
    const db = await withCategory();
    await expect(
      db.transaction(async (tx) => {
        await tx.transaction(async (inner) => {
          await inner.run(insert, [-1]);
        });
        throw new Error('outer fails');
      }),
    ).rejects.toThrow();
    expect(await db.first('SELECT COUNT(*) AS n FROM transactions')).toEqual({ n: 0 });
  });
});
