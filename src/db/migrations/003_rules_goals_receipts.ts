// Frozen: never edit after release. Schema changes go in a new numbered file.
//
// category_rules: "merchant contains X -> category Y", applied to new and
// imported transactions. Patterns are stored already normalised (see
// services/merchant.ts), so matching needs no per-row work in SQL.
// categories.rollover: unspent budget carries into the next period.
// goals / goal_contributions: savings targets. Contributions are money set
// aside, not spending, so they live outside the transactions table.
// transactions.receipt: file name of a photo in the app's receipts folder.
// dismissed_suggestions: recurring-bill suggestions the user said no to.
export const sql = `
CREATE TABLE category_rules (
  id          INTEGER PRIMARY KEY,
  pattern     TEXT    NOT NULL CHECK (length(trim(pattern)) > 0),
  category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  created_at  TEXT    NOT NULL
);
CREATE UNIQUE INDEX category_rules_pattern ON category_rules (pattern);

ALTER TABLE categories ADD COLUMN rollover INTEGER NOT NULL DEFAULT 0 CHECK (rollover IN (0, 1));

CREATE TABLE goals (
  id           INTEGER PRIMARY KEY,
  name         TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  target_cents INTEGER NOT NULL CHECK (typeof(target_cents) = 'integer' AND target_cents > 0),
  target_date  TEXT    CHECK (target_date IS NULL OR target_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  color        TEXT    NOT NULL,
  icon         TEXT    NOT NULL,
  created_at   TEXT    NOT NULL,
  archived     INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
);

CREATE TABLE goal_contributions (
  id           INTEGER PRIMARY KEY,
  goal_id      INTEGER NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents <> 0),
  date         TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  note         TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX goal_contributions_goal_date ON goal_contributions (goal_id, date);

ALTER TABLE transactions ADD COLUMN receipt TEXT;

CREATE TABLE dismissed_suggestions (
  merchant_key TEXT PRIMARY KEY,
  dismissed_at TEXT NOT NULL
);
`;
