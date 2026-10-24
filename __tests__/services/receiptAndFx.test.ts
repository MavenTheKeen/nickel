import {
  centsToMinor,
  convertToHomeCents,
  fetchRate,
  formatMinor,
  formatRate,
  parseRate,
  parseRateResponse,
  rateToMicros,
  rateUrl,
  RateUnavailableError,
} from '@/services/fx';
import { amountsIn, parseReceipt } from '@/services/receiptParse';

const TODAY = '2025-06-20';

describe('receipt amounts', () => {
  it('reads two-decimal amounts in either decimal style', () => {
    expect(amountsIn('TOTAL 1,234.56')).toEqual([123456]);
    expect(amountsIn('Summe 1.234,56 EUR')).toEqual([123456]);
    expect(amountsIn('2 x 3.99   7.98')).toEqual([399, 798]);
    expect(amountsIn('Tel 416 555 0199')).toEqual([]);
    expect(amountsIn('Card ****1234')).toEqual([]);
  });
});

describe('parseReceipt', () => {
  it('reads a grocery receipt', () => {
    const lines = [
      'LOBLAWS',
      '60 Carlton St, Toronto ON',
      'Tel (416) 555-0199',
      '06/14/2025 18:42',
      'BANANAS            1.29',
      'MILK 2L            5.49',
      'SUBTOTAL           6.78',
      'HST                0.00',
      'TOTAL              6.78',
      'VISA ****4421      6.78',
      'THANK YOU FOR SHOPPING',
    ];
    expect(parseReceipt(lines, { today: TODAY })).toEqual({
      totalCents: 678,
      date: '2025-06-14',
      merchant: 'Loblaws',
    });
  });

  it('prefers the amount due over a plain total and skips subtotal and tax', () => {
    const lines = [
      'Blue Bottle Coffee',
      'Jun 12, 2025',
      'Subtotal 9.50',
      'Tax 1.24',
      'Total 10.74',
      'Tip 2.00',
      'Amount due',
      '12.74',
    ];
    expect(parseReceipt(lines, { today: TODAY })).toEqual({
      totalCents: 1274,
      date: '2025-06-12',
      merchant: 'Blue Bottle Coffee',
    });
  });

  it('uses the day-first setting only when a date is ambiguous', () => {
    expect(parseReceipt(['Shop', '03/04/2025'], { today: TODAY }).date).toBe('2025-03-04');
    expect(parseReceipt(['Shop', '03/04/2025'], { today: TODAY, dayFirst: true }).date).toBe(
      '2025-04-03',
    );
    expect(parseReceipt(['Shop', '14/06/2025'], { today: TODAY }).date).toBe('2025-06-14');
    expect(parseReceipt(['Shop', '14 Jun 2025'], { today: TODAY }).date).toBe('2025-06-14');
    expect(parseReceipt(['Shop', '2025-06-01'], { today: TODAY }).date).toBe('2025-06-01');
  });

  it('ignores dates in the future or more than a year old', () => {
    expect(
      parseReceipt(['Shop', 'Expires 12/31/2027', 'Sold 06/01/2025'], { today: TODAY }).date,
    ).toBe('2025-06-01');
    expect(parseReceipt(['Shop', 'Member since 2019-03-01'], { today: TODAY }).date).toBeNull();
  });

  it('returns nulls when nothing is readable', () => {
    expect(parseReceipt(['', '***', '12'], { today: TODAY })).toEqual({
      totalCents: null,
      date: null,
      merchant: null,
    });
  });

  it('reads a German receipt', () => {
    const lines = ['Bäckerei Müller', 'Datum 13.06.2025', 'Brötchen 1,20', 'Summe 4,80'];
    expect(parseReceipt(lines, { today: TODAY, dayFirst: true })).toEqual({
      totalCents: 480,
      date: '2025-06-13',
      merchant: 'Bäckerei Müller',
    });
  });
});

describe('currency conversion', () => {
  it('stores rates as integer millionths and prints them back', () => {
    expect(rateToMicros(1.571)).toBe(1_571_000);
    expect(rateToMicros(0.006361)).toBe(6361);
    expect(formatRate(1_571_000)).toBe('1.571');
    expect(formatRate(2_000_000)).toBe('2');
    expect(() => rateToMicros(0)).toThrow();
    expect(parseRate('1.5710')).toBe(1_571_000);
    expect(parseRate('1,571')).toBe(1_571_000);
    expect(parseRate('abc')).toBeNull();
    expect(parseRate('0')).toBeNull();
  });

  it('converts with integer arithmetic and rounds half away from zero', () => {
    // EUR 24.00 at 1.571 = CAD 37.704 -> 37.70
    expect(convertToHomeCents(2400, 1_571_000, 2)).toBe(3770);
    expect(convertToHomeCents(-2400, 1_571_000, 2)).toBe(-3770);
    // 0.5 cent rounds up: 1.00 at 1.005
    expect(convertToHomeCents(100, 1_005_000, 2)).toBe(101);
    // JPY has no decimals: 2,400 yen at 0.008712 CAD = 20.9088 -> 20.91
    expect(convertToHomeCents(2400, 8712, 0)).toBe(2091);
    // Large amounts do not lose precision.
    expect(convertToHomeCents(99_999_999_99, 1_234_567, 2)).toBe(12_345_669_999);
  });

  it('converts typed hundredths to the currency minor units', () => {
    expect(centsToMinor(1250, 2)).toBe(1250);
    expect(centsToMinor(240000, 0)).toBe(2400);
    expect(centsToMinor(240050, 0)).toBeNull();
  });

  it('formats amounts in their own currency', () => {
    expect(formatMinor(2400, 'EUR', 'en-US')).toBe('€24.00');
    expect(formatMinor(-2400, 'JPY', 'en-US')).toBe('-¥2,400');
  });
});

describe('rate service', () => {
  it('asks for a dated rate in the past and the latest rate otherwise', () => {
    expect(rateUrl('EUR', 'CAD', '2025-06-14', TODAY)).toBe(
      'https://api.frankfurter.dev/v2/rate/eur/cad?date=2025-06-14',
    );
    expect(rateUrl('EUR', 'CAD', TODAY, TODAY)).toBe('https://api.frankfurter.dev/v2/rate/eur/cad');
  });

  it('validates the reply', () => {
    expect(
      parseRateResponse(
        { date: '2025-06-14', base: 'EUR', quote: 'CAD', rate: 1.571 },
        'EUR',
        'CAD',
      ),
    ).toEqual({ rateMicros: 1_571_000, rateDate: '2025-06-14' });
    expect(() => parseRateResponse({ rate: 'x' }, 'EUR', 'CAD')).toThrow(RateUnavailableError);
    expect(() =>
      parseRateResponse({ date: '2025-06-14', base: 'EUR', quote: 'USD', rate: 1.1 }, 'EUR', 'CAD'),
    ).toThrow(/another currency/);
  });

  it('turns network failures and error statuses into a readable error', async () => {
    const offline = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(fetchRate('EUR', 'CAD', '2025-06-14', TODAY, offline)).rejects.toThrow(
      'Could not reach the exchange rate service',
    );
    const notFound = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    await expect(fetchRate('EUR', 'CAD', '2025-06-14', TODAY, notFound)).rejects.toThrow(/404/);
  });
});
