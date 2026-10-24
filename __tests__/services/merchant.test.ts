import { keyContains, matchRule, merchantKey, suggestCategory } from '@/services/merchant';

describe('merchantKey', () => {
  it.each([
    ['STARBUCKS #1234 TORONTO ON', 'starbucks toronto on'],
    ['SQ *Blue Bottle', 'blue bottle'],
    ['Tim Hortons 0042', 'tim hortons'],
    ['  Café   Crème  ', 'cafe creme'],
    ['POS PURCHASE UBER *EATS', 'uber eats'],
    ['12345', ''],
    ['', ''],
  ])('%s -> %s', (input, expected) => {
    expect(merchantKey(input)).toBe(expected);
  });
});

describe('keyContains', () => {
  it('matches whole words in order', () => {
    expect(keyContains('uber eats toronto', 'uber eats')).toBe(true);
    expect(keyContains('uber eats toronto', 'uber')).toBe(true);
    expect(keyContains('superstore', 'store')).toBe(false);
    expect(keyContains('eats uber', 'uber eats')).toBe(false);
    expect(keyContains('anything', '')).toBe(false);
  });
});

describe('matchRule', () => {
  const rules = [
    { id: 1, pattern: 'uber', categoryId: 10 },
    { id: 2, pattern: 'uber eats', categoryId: 20 },
    { id: 3, pattern: 'starbucks', categoryId: 30 },
  ];

  it('prefers the longest matching pattern', () => {
    expect(matchRule('UBER *EATS PENDING', rules)?.categoryId).toBe(20);
    expect(matchRule('Uber Trip 8812', rules)?.categoryId).toBe(10);
  });

  it('returns null when nothing matches or the merchant is empty', () => {
    expect(matchRule('Loblaws', rules)).toBeNull();
    expect(matchRule('#123', rules)).toBeNull();
  });

  it('breaks ties between equal patterns by the newest rule', () => {
    const tied = [
      { id: 4, pattern: 'shell', categoryId: 1 },
      { id: 9, pattern: 'shell', categoryId: 2 },
    ];
    expect(matchRule('SHELL 0042', tied)?.categoryId).toBe(2);
  });
});

describe('suggestCategory', () => {
  const counts = [
    { merchant: 'Loblaws', categoryId: 1, count: 3 },
    { merchant: 'LOBLAWS #12', categoryId: 2, count: 1 },
    { merchant: 'Cafe', categoryId: 5, count: 1 },
    { merchant: 'Metro', categoryId: 1, count: 2 },
    { merchant: 'Metro 33', categoryId: 3, count: 2 },
  ];

  it('uses a rule before history', () => {
    const rules = [{ id: 1, pattern: 'loblaws', categoryId: 9 }];
    expect(suggestCategory('Loblaws', rules, counts)).toEqual({ categoryId: 9, source: 'rule' });
  });

  it('falls back to the category used most often across spellings', () => {
    expect(suggestCategory('loblaws', [], counts)).toEqual({ categoryId: 1, source: 'history' });
  });

  it('needs at least two past uses and a clear winner', () => {
    expect(suggestCategory('Cafe', [], counts)).toBeNull();
    expect(suggestCategory('Metro', [], counts)).toBeNull();
    expect(suggestCategory('Unknown shop', [], counts)).toBeNull();
  });
});
