import type { Db } from '@/db/types';
import type { Goal, GoalContribution, IsoDate } from '@/types/domain';

interface GoalRow {
  id: number;
  name: string;
  target_cents: number;
  target_date: string | null;
  color: string;
  icon: string;
  created_at: string;
  archived: number;
  saved_cents: number;
}

const SELECT_GOALS = `SELECT g.id, g.name, g.target_cents, g.target_date, g.color, g.icon,
  g.created_at, g.archived,
  COALESCE((SELECT SUM(c.amount_cents) FROM goal_contributions c WHERE c.goal_id = g.id), 0) AS saved_cents
  FROM goals g`;

const toGoal = (r: GoalRow): Goal => ({
  id: r.id,
  name: r.name,
  targetCents: r.target_cents,
  targetDate: r.target_date,
  color: r.color,
  icon: r.icon,
  createdAt: r.created_at,
  archived: r.archived === 1,
  savedCents: r.saved_cents,
});

export type GoalInput = Pick<Goal, 'name' | 'targetCents' | 'targetDate' | 'color' | 'icon'>;

export async function listGoals(db: Db, opts: { includeArchived?: boolean } = {}): Promise<Goal[]> {
  const rows = await db.all<GoalRow>(
    `${SELECT_GOALS} ${opts.includeArchived ? '' : 'WHERE g.archived = 0'}
     ORDER BY g.archived, g.target_date IS NULL, g.target_date, g.id`,
  );
  return rows.map(toGoal);
}

export async function getGoal(db: Db, id: number): Promise<Goal | null> {
  const row = await db.first<GoalRow>(`${SELECT_GOALS} WHERE g.id = ?`, [id]);
  return row ? toGoal(row) : null;
}

export async function createGoal(db: Db, input: GoalInput, now = new Date()): Promise<number> {
  return db.transaction(async (tx) => {
    const r = await tx.run(
      `INSERT INTO goals (name, target_cents, target_date, color, icon, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.name.trim(),
        input.targetCents,
        input.targetDate,
        input.color,
        input.icon,
        now.toISOString(),
      ],
    );
    return r.lastInsertRowId;
  });
}

export async function updateGoal(db: Db, id: number, input: GoalInput): Promise<void> {
  await db.transaction(async (tx) => {
    const r = await tx.run(
      'UPDATE goals SET name = ?, target_cents = ?, target_date = ?, color = ?, icon = ? WHERE id = ?',
      [input.name.trim(), input.targetCents, input.targetDate, input.color, input.icon, id],
    );
    if (r.changes !== 1) throw new Error(`Goal ${id} not found`);
  });
}

export async function setGoalArchived(db: Db, id: number, archived: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run('UPDATE goals SET archived = ? WHERE id = ?', [archived ? 1 : 0, id]);
  });
}

/** Deletes the goal and, through ON DELETE CASCADE, its contributions. */
export async function deleteGoal(db: Db, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM goals WHERE id = ?', [id]);
  });
}

interface ContributionRow {
  id: number;
  goal_id: number;
  amount_cents: number;
  date: string;
  note: string;
}

const toContribution = (r: ContributionRow): GoalContribution => ({
  id: r.id,
  goalId: r.goal_id,
  amountCents: r.amount_cents,
  date: r.date,
  note: r.note,
});

/** Positive adds to the goal; negative takes money back out. */
export async function addContribution(
  db: Db,
  goalId: number,
  amountCents: number,
  date: IsoDate,
  note = '',
): Promise<number> {
  return db.transaction(async (tx) => {
    const r = await tx.run(
      'INSERT INTO goal_contributions (goal_id, amount_cents, date, note) VALUES (?, ?, ?, ?)',
      [goalId, amountCents, date, note.trim()],
    );
    return r.lastInsertRowId;
  });
}

export async function deleteContribution(db: Db, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM goal_contributions WHERE id = ?', [id]);
  });
}

export async function listContributions(db: Db, goalId: number): Promise<GoalContribution[]> {
  const rows = await db.all<ContributionRow>(
    `SELECT id, goal_id, amount_cents, date, note FROM goal_contributions
     WHERE goal_id = ? ORDER BY date DESC, id DESC`,
    [goalId],
  );
  return rows.map(toContribution);
}

/** Net amount put into all goals between two dates, inclusive. */
export async function contributedBetween(db: Db, start: IsoDate, end: IsoDate): Promise<number> {
  const r = await db.first<{ n: number }>(
    'SELECT COALESCE(SUM(amount_cents), 0) AS n FROM goal_contributions WHERE date BETWEEN ? AND ?',
    [start, end],
  );
  return r?.n ?? 0;
}
