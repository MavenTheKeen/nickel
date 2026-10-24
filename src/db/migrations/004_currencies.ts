// Frozen: never edit after release. Schema changes go in a new numbered file.
//
// A transaction in a foreign currency is stored in the home currency, as
// before, so every report and budget keeps working unchanged. The amount as
// paid, its currency and the rate used are kept alongside for display.
// Rates are integers in millionths (1.571 is 1571000), so conversion is
// integer arithmetic.
// fx_rates: rates already downloaded, so a date and pair are fetched once and
// work offline afterwards. A cache: not part of backups.
export const sql = `
ALTER TABLE transactions ADD COLUMN original_minor INTEGER
  CHECK (original_minor IS NULL OR (typeof(original_minor) = 'integer' AND original_minor <> 0));
ALTER TABLE transactions ADD COLUMN original_currency TEXT
  CHECK (original_currency IS NULL OR original_currency GLOB '[A-Z][A-Z][A-Z]');
ALTER TABLE transactions ADD COLUMN fx_rate_micros INTEGER
  CHECK (fx_rate_micros IS NULL OR (typeof(fx_rate_micros) = 'integer' AND fx_rate_micros > 0));

CREATE TABLE fx_rates (
  date        TEXT    NOT NULL,
  base        TEXT    NOT NULL CHECK (base GLOB '[A-Z][A-Z][A-Z]'),
  quote       TEXT    NOT NULL CHECK (quote GLOB '[A-Z][A-Z][A-Z]'),
  rate_micros INTEGER NOT NULL CHECK (typeof(rate_micros) = 'integer' AND rate_micros > 0),
  rate_date   TEXT    NOT NULL,
  fetched_at  TEXT    NOT NULL,
  PRIMARY KEY (base, quote, date)
);
`;
