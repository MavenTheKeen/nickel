// RFC 4180 CSV parsing and writing, plus the small deviations seen in bank
// exports: a UTF-8 byte order mark, semicolon or tab delimiters, CR-only line
// endings, and blank lines.

export interface CsvRecord {
  /** 1-based line number in the file where this record starts. */
  line: number;
  fields: string[];
}

export interface CsvParseResult {
  records: CsvRecord[];
  delimiter: string;
  /** Set when the file ends inside a quoted field. */
  error: { line: number; message: string } | null;
}

const CANDIDATE_DELIMITERS = [',', ';', '\t'] as const;

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Picks the candidate delimiter that appears most often outside quotes on the first line. */
export function detectDelimiter(text: string): string {
  const counts = new Map<string, number>(CANDIDATE_DELIMITERS.map((d) => [d, 0]));
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === '\n' || ch === '\r')) break;
    else if (!inQuotes && counts.has(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let best = ',';
  let bestCount = 0;
  for (const [d, n] of counts) {
    if (n > bestCount) {
      best = d;
      bestCount = n;
    }
  }
  return best;
}

export function parseCsv(input: string, delimiter?: string): CsvParseResult {
  const text = stripBom(input);
  const delim = delimiter ?? detectDelimiter(text);
  const records: CsvRecord[] = [];

  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  let fieldStarted = false; // distinguishes an empty line from a line with one empty field

  const endRecord = () => {
    if (fieldStarted || fields.length > 0) {
      fields.push(field);
      records.push({ line: recordLine, fields });
    }
    fields = [];
    field = '';
    fieldStarted = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n' || (ch === '\r' && text[i + 1] !== '\n')) line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      fieldStarted = true;
    } else if (ch === delim) {
      fields.push(field);
      field = '';
      fieldStarted = true;
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      field += ch;
      fieldStarted = true;
    }
  }

  if (inQuotes) {
    return {
      records,
      delimiter: delim,
      error: { line: recordLine, message: 'File ends inside a quoted field' },
    };
  }
  endRecord();
  return { records, delimiter: delim, error: null };
}

function escapeField(value: string, delimiter: string): string {
  // Spreadsheet apps run text starting with = + @ as a formula. A leading "-"
  // is left alone so negative amounts stay numbers.
  const safe = /^[=+@]/.test(value) ? `'${value}` : value;
  return /["\r\n]/.test(safe) || safe.includes(delimiter) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: readonly (readonly string[])[], delimiter = ','): string {
  return (
    rows.map((r) => r.map((f) => escapeField(f, delimiter)).join(delimiter)).join('\r\n') + '\r\n'
  );
}
