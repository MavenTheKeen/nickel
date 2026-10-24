// Frozen: never edit after release. Schema changes go in a new numbered file.
//
// settings: key/value app preferences and the install id.
// budget_warnings: one row per warning sent, so the same 80% or 100% warning
// is never repeated within a month.
// flags.overridden: marks a variant forced from the debug screen.
export const sql = `
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE budget_warnings (
  category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  month       TEXT    NOT NULL,
  threshold   INTEGER NOT NULL CHECK (threshold IN (80, 100)),
  sent_at     TEXT    NOT NULL,
  PRIMARY KEY (category_id, month, threshold)
);

ALTER TABLE flags ADD COLUMN overridden INTEGER NOT NULL DEFAULT 0 CHECK (overridden IN (0, 1));
`;
