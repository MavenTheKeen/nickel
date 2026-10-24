// Frozen: never edit after release. Schema changes go in a new numbered file.
export const sql = `
CREATE TABLE categories (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  color      TEXT    NOT NULL,
  icon       TEXT    NOT NULL,
  is_income  INTEGER NOT NULL DEFAULT 0 CHECK (is_income IN (0, 1)),
  archived   INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX categories_name_unique ON categories (name COLLATE NOCASE);

CREATE TABLE import_batches (
  id          INTEGER PRIMARY KEY,
  filename    TEXT    NOT NULL,
  imported_at TEXT    NOT NULL,
  row_count   INTEGER NOT NULL CHECK (row_count >= 0),
  error_count INTEGER NOT NULL CHECK (error_count >= 0)
);

CREATE TABLE recurring_rules (
  id           INTEGER PRIMARY KEY,
  amount_cents INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents <> 0),
  category_id  INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  cadence      TEXT    NOT NULL CHECK (cadence IN ('weekly', 'monthly', 'yearly')),
  anchor_date  TEXT    NOT NULL CHECK (anchor_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  next_index   INTEGER NOT NULL DEFAULT 0 CHECK (next_index >= 0),
  next_due     TEXT    NOT NULL CHECK (next_due GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  note         TEXT    NOT NULL DEFAULT '',
  merchant     TEXT    NOT NULL DEFAULT '',
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);
CREATE INDEX recurring_rules_due ON recurring_rules (active, next_due);

CREATE TABLE transactions (
  id              INTEGER PRIMARY KEY,
  amount_cents    INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents <> 0),
  date            TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  category_id     INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  note            TEXT    NOT NULL DEFAULT '',
  merchant        TEXT    NOT NULL DEFAULT '',
  recurring_id    INTEGER REFERENCES recurring_rules (id) ON DELETE SET NULL,
  import_batch_id INTEGER REFERENCES import_batches (id) ON DELETE CASCADE,
  created_at      TEXT    NOT NULL
);
CREATE INDEX transactions_date ON transactions (date);
CREATE INDEX transactions_category_date ON transactions (category_id, date);
CREATE INDEX transactions_import_batch ON transactions (import_batch_id);
CREATE INDEX transactions_recurring ON transactions (recurring_id);

CREATE TABLE budgets (
  id          INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  month       TEXT    NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  limit_cents INTEGER NOT NULL CHECK (typeof(limit_cents) = 'integer' AND limit_cents > 0),
  UNIQUE (category_id, month)
);

CREATE TABLE events (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  props_json TEXT NOT NULL DEFAULT '{}',
  ts         TEXT NOT NULL,
  session_id TEXT NOT NULL
);
CREATE INDEX events_name_ts ON events (name, ts);

CREATE TABLE flags (
  key         TEXT PRIMARY KEY,
  variant     TEXT NOT NULL,
  assigned_at TEXT NOT NULL
);
`;
