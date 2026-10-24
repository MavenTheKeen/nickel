import type { IsoMonth } from '@/types/domain';

// The period review: a few cards that each say one thing about how the
// period went. Built from plain numbers, so every card is tested without a
// database. Cards that would say nothing (no budgets, no change) are left out.

export interface ReviewInput {
  month: IsoMonth;
  spentCents: number;
  incomeCents: number;
  /** Null when there is no data for the period before. */
  prevSpentCents: number | null;
  byCategory: readonly { categoryId: number; spentCents: number }[];
  prevByCategory: readonly { categoryId: number; spentCents: number }[];
  topMerchant: { merchant: string; spentCents: number; count: number } | null;
  largest: {
    id: number;
    merchant: string;
    note: string;
    categoryId: number;
    amountCents: number;
  } | null;
  budgets: readonly { categoryId: number; limitCents: number; spentCents: number }[];
  /** Spending per weekday, index 0 = Sunday. */
  byWeekday: readonly number[];
  goalContributedCents: number;
  transactionCount: number;
}

export type ReviewCard =
  | {
      kind: 'total';
      spentCents: number;
      incomeCents: number;
      /** Income minus spending. */
      netCents: number;
      /** Whole percent change from the period before, or null. */
      changePercent: number | null;
    }
  | { kind: 'change'; categoryId: number; nowCents: number; prevCents: number; deltaCents: number }
  | { kind: 'merchant'; merchant: string; spentCents: number; count: number }
  | {
      kind: 'budgets';
      kept: number;
      total: number;
      /** The category furthest over its limit, if any. */
      overCategoryId: number | null;
      overByCents: number;
    }
  | { kind: 'weekday'; weekday: number; spentCents: number; sharePercent: number }
  | {
      kind: 'largest';
      id: number;
      title: string;
      categoryId: number;
      amountCents: number;
    }
  | { kind: 'goals'; contributedCents: number };

/** Changes smaller than this are not worth a card. */
export const MIN_CHANGE_CENTS = 1000;

export function buildReview(input: ReviewInput): ReviewCard[] {
  if (input.transactionCount === 0) return [];
  const cards: ReviewCard[] = [];

  const prev = input.prevSpentCents;
  cards.push({
    kind: 'total',
    spentCents: input.spentCents,
    incomeCents: input.incomeCents,
    netCents: input.incomeCents - input.spentCents,
    changePercent: prev && prev > 0 ? Math.round(((input.spentCents - prev) * 100) / prev) : null,
  });

  if (prev !== null) {
    const before = new Map(input.prevByCategory.map((c) => [c.categoryId, c.spentCents]));
    const ids = new Set([...before.keys(), ...input.byCategory.map((c) => c.categoryId)]);
    const now = new Map(input.byCategory.map((c) => [c.categoryId, c.spentCents]));
    let best: Extract<ReviewCard, { kind: 'change' }> | null = null;
    for (const id of ids) {
      const n = now.get(id) ?? 0;
      const p = before.get(id) ?? 0;
      const delta = n - p;
      if (
        Math.abs(delta) >= MIN_CHANGE_CENTS &&
        (!best ||
          Math.abs(delta) > Math.abs(best.deltaCents) ||
          (Math.abs(delta) === Math.abs(best.deltaCents) && id < best.categoryId))
      ) {
        best = { kind: 'change', categoryId: id, nowCents: n, prevCents: p, deltaCents: delta };
      }
    }
    if (best) cards.push(best);
  }

  if (input.topMerchant && input.topMerchant.spentCents > 0) {
    cards.push({ kind: 'merchant', ...input.topMerchant });
  }

  if (input.budgets.length > 0) {
    const over = input.budgets
      .filter((b) => b.spentCents > b.limitCents)
      .sort((a, b) => b.spentCents - b.limitCents - (a.spentCents - a.limitCents));
    const worst = over[0];
    cards.push({
      kind: 'budgets',
      kept: input.budgets.length - over.length,
      total: input.budgets.length,
      overCategoryId: worst?.categoryId ?? null,
      overByCents: worst ? worst.spentCents - worst.limitCents : 0,
    });
  }

  const weekTotal = input.byWeekday.reduce((s, v) => s + v, 0);
  if (weekTotal > 0) {
    let top = 0;
    input.byWeekday.forEach((v, i) => {
      if (v > (input.byWeekday[top] ?? 0)) top = i;
    });
    const spent = input.byWeekday[top] ?? 0;
    cards.push({
      kind: 'weekday',
      weekday: top,
      spentCents: spent,
      sharePercent: Math.round((spent * 100) / weekTotal),
    });
  }

  if (input.largest) {
    cards.push({
      kind: 'largest',
      id: input.largest.id,
      title: input.largest.merchant || input.largest.note,
      categoryId: input.largest.categoryId,
      amountCents: input.largest.amountCents,
    });
  }

  if (input.goalContributedCents > 0) {
    cards.push({ kind: 'goals', contributedCents: input.goalContributedCents });
  }

  return cards;
}

/** Plain-text version of the review for the share sheet. */
export function reviewText(
  cards: readonly ReviewCard[],
  names: {
    period: string;
    money: (cents: number) => string;
    category: (id: number) => string;
    weekday: (day: number) => string;
  },
): string {
  const lines = [`Nickel review: ${names.period}`];
  for (const c of cards) {
    switch (c.kind) {
      case 'total':
        lines.push(
          `Spent ${names.money(c.spentCents)}` +
            (c.changePercent === null
              ? ''
              : `, ${Math.abs(c.changePercent)}% ${c.changePercent >= 0 ? 'more' : 'less'} than the period before`) +
            '.',
        );
        break;
      case 'change':
        lines.push(
          `${names.category(c.categoryId)}: ${names.money(Math.abs(c.deltaCents))} ${c.deltaCents > 0 ? 'more' : 'less'} than the period before.`,
        );
        break;
      case 'merchant':
        lines.push(`Top merchant: ${c.merchant}, ${names.money(c.spentCents)}.`);
        break;
      case 'budgets':
        lines.push(`Budgets kept: ${c.kept} of ${c.total}.`);
        break;
      case 'weekday':
        lines.push(`Most spending on ${names.weekday(c.weekday)}s (${c.sharePercent}%).`);
        break;
      case 'largest':
        lines.push(
          `Largest expense: ${c.title || names.category(c.categoryId)}, ${names.money(-c.amountCents)}.`,
        );
        break;
      case 'goals':
        lines.push(`Put ${names.money(c.contributedCents)} towards goals.`);
        break;
    }
  }
  return lines.join('\n');
}
