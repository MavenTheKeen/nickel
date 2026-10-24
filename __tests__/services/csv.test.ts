import { detectDelimiter, parseCsv, stripBom, toCsv } from '@/services/csv';

const fields = (text: string) => parseCsv(text).records.map((r) => r.fields);

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(fields('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles quoted commas and escaped quotes', () => {
    expect(fields('"Smith, J","He said ""hi""",3')).toEqual([['Smith, J', 'He said "hi"', '3']]);
  });

  it('strips a UTF-8 byte order mark', () => {
    expect(fields('﻿date,amount\n')).toEqual([['date', 'amount']]);
    expect(stripBom('abc')).toBe('abc');
  });

  it('accepts CRLF, LF and CR line endings', () => {
    expect(fields('a\r\nb\nc\rd')).toEqual([['a'], ['b'], ['c'], ['d']]);
  });

  it('keeps newlines inside quotes and reports the starting line', () => {
    const r = parseCsv('h1,h2\n"multi\nline",x\nlast,y');
    expect(r.records.map((x) => x.line)).toEqual([1, 2, 4]);
    expect(r.records[1]!.fields[0]).toBe('multi\nline');
  });

  it('skips blank lines but keeps their line numbers counted', () => {
    const r = parseCsv('a\n\n\nb\n');
    expect(r.records).toEqual([
      { line: 1, fields: ['a'] },
      { line: 4, fields: ['b'] },
    ]);
  });

  it('keeps empty fields', () => {
    expect(fields('a,,c\n,,\n')).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
    ]);
  });

  it('reports a file that ends inside quotes', () => {
    const r = parseCsv('a,b\n"open,1\n');
    expect(r.error).toEqual({ line: 2, message: 'File ends inside a quoted field' });
  });

  it('detects semicolon and tab delimiters', () => {
    expect(detectDelimiter('date;amount;note\n')).toBe(';');
    expect(detectDelimiter('date\tamount\n')).toBe('\t');
    expect(detectDelimiter('"a;b",c\n')).toBe(',');
    expect(fields('1;2,50;x')).toEqual([['1', '2,50', 'x']]);
  });
});

describe('toCsv', () => {
  it('quotes only when needed and round-trips', () => {
    const rows = [
      ['date', 'note'],
      ['2025-01-01', 'Plain'],
      ['2025-01-02', 'Has, comma'],
      ['2025-01-03', 'Has "quotes"'],
      ['2025-01-04', 'Two\nlines'],
    ];
    const text = toCsv(rows);
    expect(text).toContain('"Has, comma"');
    expect(text).not.toContain('"Plain"');
    expect(fields(text)).toEqual(rows);
  });

  it('neutralises spreadsheet formulas but keeps negative numbers', () => {
    expect(toCsv([['=SUM(A1)', '-12.50', '@x']])).toBe("'=SUM(A1),-12.50,'@x\r\n");
  });
});
