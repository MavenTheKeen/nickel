import {
  centsToDecimalString,
  divideRound,
  formatCents,
  parseMoney,
  splitCents,
} from '@/services/money';

describe('parseMoney', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['0.01', 1],
    ['.5', 50],
    ['1,234.56', 123456],
    ['$1,234.56', 123456],
    ['-12.00', -1200],
    ['12.00-', -1200],
    ['(12.34)', -1234],
    ['($1,000.00)', -100000],
    ['$-5.00', -500],
    ['CAD 5.00', 500],
    ['5.00 USD', 500],
    ['+3.10', 310],
    ['  7.25  ', 725],
    ['0', 0],
  ])('parses %p as %i cents', (input, cents) => {
    expect(parseMoney(input)).toBe(cents);
  });

  it('avoids float error: 0.29 is exactly 29 cents', () => {
    expect(parseMoney('0.29')).toBe(29);
    expect(parseMoney('1.15')).toBe(115);
    expect(parseMoney('4.35')).toBe(435);
  });

  it.each(['', 'abc', '12.345', '1,23.00', '12..3', '1.2.3', '--5', '$', '12a'])(
    'rejects %p',
    (input) => {
      expect(parseMoney(input)).toBeNull();
    },
  );

  it('supports comma decimals', () => {
    expect(parseMoney('1.234,56', { decimal: ',' })).toBe(123456);
    expect(parseMoney('12,5', { decimal: ',' })).toBe(1250);
    expect(parseMoney('(3,00)', { decimal: ',' })).toBe(-300);
  });

  it('rejects absurdly large amounts', () => {
    expect(parseMoney('99999999999999')).toBeNull();
  });
});

describe('formatCents', () => {
  it.each([
    [0, '$0.00'],
    [5, '$0.05'],
    [1250, '$12.50'],
    [-1250, '-$12.50'],
    [123456789, '$1,234,567.89'],
  ])('formats %i as %p', (cents, text) => {
    expect(formatCents(cents)).toBe(text);
  });

  it('uses a custom symbol and optional plus sign', () => {
    expect(formatCents(500, { symbol: '€' })).toBe('€5.00');
    expect(formatCents(500, { signed: true })).toBe('+$5.00');
    expect(formatCents(-500, { signed: true })).toBe('-$5.00');
  });

  it('refuses non-integer input', () => {
    expect(() => formatCents(1.5)).toThrow();
  });
});

describe('centsToDecimalString', () => {
  it('round-trips with parseMoney', () => {
    for (const c of [0, 1, 99, 100, -1, -1050, 123456]) {
      expect(parseMoney(centsToDecimalString(c))).toBe(c);
    }
  });
});

describe('splitCents', () => {
  it('gives leftover cents to the first parts', () => {
    expect(splitCents(1000, 3)).toEqual([334, 333, 333]);
    expect(splitCents(1001, 3)).toEqual([334, 334, 333]);
  });

  it('always sums to the total', () => {
    for (const [total, parts] of [
      [1, 7],
      [999, 4],
      [-1000, 3],
      [12345, 11],
    ] as const) {
      const out = splitCents(total, parts);
      expect(out.reduce((a, b) => a + b, 0)).toBe(total);
      expect(out).toHaveLength(parts);
    }
  });

  it('keeps the sign for negative totals', () => {
    expect(splitCents(-1000, 3)).toEqual([-334, -333, -333]);
  });

  it('rejects bad input', () => {
    expect(() => splitCents(10, 0)).toThrow();
    expect(() => splitCents(1.5, 2)).toThrow();
  });
});

describe('divideRound', () => {
  it('rounds half away from zero', () => {
    expect(divideRound(5, 2)).toBe(3);
    expect(divideRound(-5, 2)).toBe(-3);
    expect(divideRound(4, 3)).toBe(1);
    expect(() => divideRound(1, 0)).toThrow();
  });
});
