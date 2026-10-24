import type { Db } from '@/db/types';

export interface EventRecord {
  id: number;
  name: string;
  props: Record<string, unknown>;
  ts: string;
  sessionId: string;
}

interface EventRow {
  id: number;
  name: string;
  props_json: string;
  ts: string;
  session_id: string;
}

function parseProps(json: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(json);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const toEvent = (r: EventRow): EventRecord => ({
  id: r.id,
  name: r.name,
  props: parseProps(r.props_json),
  ts: r.ts,
  sessionId: r.session_id,
});

/** Append-only: there is no update, and deletion only happens through pruneEvents. */
export async function insertEvent(
  db: Db,
  e: { name: string; props: Record<string, unknown>; ts: string; sessionId: string },
): Promise<void> {
  await db.run('INSERT INTO events (name, props_json, ts, session_id) VALUES (?, ?, ?, ?)', [
    e.name,
    JSON.stringify(e.props),
    e.ts,
    e.sessionId,
  ]);
}

export async function recentEvents(db: Db, limit = 200): Promise<EventRecord[]> {
  const rows = await db.all<EventRow>(
    'SELECT id, name, props_json, ts, session_id FROM events ORDER BY id DESC LIMIT ?',
    [limit],
  );
  return rows.map(toEvent);
}

export async function allEvents(db: Db): Promise<EventRecord[]> {
  const rows = await db.all<EventRow>(
    'SELECT id, name, props_json, ts, session_id FROM events ORDER BY id',
  );
  return rows.map(toEvent);
}

export async function eventsNamed(db: Db, name: string, limit = 1000): Promise<EventRecord[]> {
  const rows = await db.all<EventRow>(
    'SELECT id, name, props_json, ts, session_id FROM events WHERE name = ? ORDER BY id DESC LIMIT ?',
    [name, limit],
  );
  return rows.map(toEvent);
}

export async function firstEventNamed(db: Db, name: string): Promise<EventRecord | null> {
  const row = await db.first<EventRow>(
    'SELECT id, name, props_json, ts, session_id FROM events WHERE name = ? ORDER BY id LIMIT 1',
    [name],
  );
  return row ? toEvent(row) : null;
}

/** Keeps the newest `keep` events so the log cannot grow without bound. */
export async function pruneEvents(db: Db, keep = 20_000): Promise<number> {
  const r = await db.run(
    'DELETE FROM events WHERE id <= (SELECT id FROM events ORDER BY id DESC LIMIT 1 OFFSET ?)',
    [keep],
  );
  return r.changes;
}
