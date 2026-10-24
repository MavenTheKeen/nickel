import { fireEvent, render, screen } from '@testing-library/react-native';

import { goalStatusText } from '@/components/GoalRow';
import { MoneyText } from '@/components/MoneyText';
import { TransactionForm } from '@/components/TransactionForm';
import { Empty, ToggleRow } from '@/components/ui';
import { goalProgress } from '@/services/goalMath';
import { fallbackCategory } from '@/services/quickAdd';
import { weekdayName } from '@/services/format';
import { tweenCents } from '@/platform/motion';
import type { Category, Goal } from '@/types/domain';

const cat = (id: number, name: string, isIncome = false, archived = false): Category => ({
  id,
  name,
  color: '#2E7D32',
  icon: 'cart',
  isIncome,
  archived,
  sortOrder: id,
  rollover: false,
});
const categories = [
  cat(1, 'Groceries'),
  cat(2, 'Eating out'),
  cat(3, 'Other'),
  cat(10, 'Salary', true),
];

describe('TransactionForm category suggestions', () => {
  const categorizer = {
    rules: [{ id: 1, pattern: 'starbucks', categoryId: 2, createdAt: 'x' }],
    counts: [{ merchant: 'Loblaws', categoryId: 1, count: 3 }],
  };

  it('picks the category from a rule as the merchant is typed', async () => {
    const onSubmit = jest.fn();
    await render(
      <TransactionForm
        categories={categories}
        today="2025-06-15"
        onSubmit={onSubmit}
        categorizer={categorizer}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText('Amount'), '4.50');
    await fireEvent.changeText(screen.getByLabelText('Merchant (optional)'), 'STARBUCKS #12');
    expect(screen.getByTestId('category-suggestion')).toHaveTextContent(
      'Chosen by a rule for this merchant.',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ categoryId: 2, merchant: 'STARBUCKS #12' });
  });

  it('stops suggesting once the user picks a category', async () => {
    const onSubmit = jest.fn();
    await render(
      <TransactionForm
        categories={categories}
        today="2025-06-15"
        onSubmit={onSubmit}
        categorizer={categorizer}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText('Amount'), '20');
    await fireEvent.press(screen.getByRole('button', { name: 'Other' }));
    await fireEvent.changeText(screen.getByLabelText('Merchant (optional)'), 'Loblaws');
    expect(screen.queryByTestId('category-suggestion')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ categoryId: 3 });
  });

  it('starts from quick add values', async () => {
    const onSubmit = jest.fn();
    await render(
      <TransactionForm
        categories={categories}
        today="2025-06-15"
        onSubmit={onSubmit}
        prefill={{
          amount: '2600',
          kind: 'income',
          categoryId: 10,
          date: '2025-06-14',
          merchant: 'Employer',
        }}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0]).toEqual({
      amountCents: 260000,
      categoryId: 10,
      date: '2025-06-14',
      merchant: 'Employer',
      note: '',
      receipt: null,
      original: null,
    });
  });

  it('offers to attach a receipt', async () => {
    await render(
      <TransactionForm categories={categories} today="2025-06-15" onSubmit={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose photo' })).toBeTruthy();
  });
});

describe('quick add fallback category', () => {
  it('uses an "Other" category of the right kind, skipping archived ones', () => {
    expect(fallbackCategory(categories, 'expense')?.id).toBe(3);
    expect(fallbackCategory(categories, 'income')?.id).toBe(10);
    expect(fallbackCategory([cat(3, 'Other', false, true), cat(4, 'Food')], 'expense')?.id).toBe(4);
  });
});

describe('goal status text', () => {
  const goal: Goal = {
    id: 1,
    name: 'Trip',
    targetCents: 120000,
    targetDate: '2025-12-31',
    color: '#000000',
    icon: 'airplane',
    createdAt: '2025-01-01T00:00:00.000Z',
    archived: false,
    savedCents: 70000,
  };
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;

  it('says what a month needs and whether the goal is on track', () => {
    const today = '2025-07-01';
    expect(goalStatusText(goal, goalProgress(goal, today), money, 'en-US', today)).toBe(
      '$83.34 a month to reach it by Dec 31 · on track',
    );
    const done = { ...goal, savedCents: 120000 };
    expect(goalStatusText(done, goalProgress(done, today), money, 'en-US', today)).toBe('Reached');
    const open = { ...goal, targetDate: null };
    expect(goalStatusText(open, goalProgress(open, today), money, 'en-US', today)).toBe(
      '$500.00 to go',
    );
  });
});

describe('polish helpers', () => {
  it('eases amounts towards the target in whole cents', () => {
    expect(tweenCents(0, 1000, 0)).toBe(0);
    expect(tweenCents(0, 1000, 0.5)).toBe(875);
    expect(tweenCents(0, 1000, 1)).toBe(1000);
    expect(tweenCents(500, 100, 2)).toBe(100);
  });

  it('shows the final amount straight away when motion is reduced', async () => {
    const { rerender } = await render(<MoneyText cents={1000} animate />);
    expect(screen.getByText('$10.00')).toBeTruthy();
    await rerender(<MoneyText cents={2500} animate />);
    expect(screen.getByText('$25.00')).toBeTruthy();
    expect(screen.getByLabelText('$25.00')).toBeTruthy();
  });

  it('names weekdays in the locale', () => {
    expect(weekdayName(6, 'en-US')).toBe('Saturday');
    expect(weekdayName(0, 'de-DE')).toBe('Sonntag');
  });

  it('renders empty states with a title, text and action', async () => {
    await render(<Empty title="No goals yet" text="Add one." icon="piggy-bank-outline" />);
    expect(screen.getByText('No goals yet')).toBeTruthy();
    expect(screen.getByText('Add one.')).toBeTruthy();
  });

  it('toggles a switch row', async () => {
    const onChange = jest.fn();
    await render(<ToggleRow label="Roll over" value={false} onChange={onChange} />);
    await fireEvent(screen.getByLabelText('Roll over'), 'valueChange', true);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('TransactionForm foreign currency', () => {
  const ready = {
    status: 'ready' as const,
    rate: { rateMicros: 1_571_000, rateDate: '2025-06-13', source: 'network' as const },
  };

  it('converts at the given rate and keeps the amount as paid', async () => {
    const onSubmit = jest.fn();
    const onCurrencyContext = jest.fn();
    await render(
      <TransactionForm
        categories={categories}
        today="2025-06-15"
        onSubmit={onSubmit}
        homeCurrency="CAD"
        rate={ready}
        onCurrencyContext={onCurrencyContext}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText('Amount'), '24');
    await fireEvent.press(screen.getByTestId('other-currency'));
    await fireEvent.press(screen.getByRole('radio', { name: 'EUR' }));
    expect(onCurrencyContext).toHaveBeenLastCalledWith('EUR', '2025-06-15');
    expect(screen.getByTestId('fx-summary')).toHaveTextContent(/-\$37\.70/);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      amountCents: -3770,
      original: { minor: -2400, currency: 'EUR', rateMicros: 1_571_000 },
    });
  });

  it('asks for a rate when none could be downloaded, and uses the one typed', async () => {
    const onSubmit = jest.fn();
    await render(
      <TransactionForm
        categories={categories}
        today="2025-06-15"
        onSubmit={onSubmit}
        homeCurrency="CAD"
        prefill={{ amount: '2400', currency: 'JPY' }}
        rate={{ status: 'error', message: 'Could not reach the exchange rate service' }}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter the exchange rate to save')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('fx-rate'), '0.008712');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      amountCents: -2091,
      original: { minor: -2400, currency: 'JPY', rateMicros: 8712 },
    });
  });

  it('refuses decimals for a currency without them', async () => {
    const onSubmit = jest.fn();
    await render(
      <TransactionForm
        categories={categories}
        today="2025-06-15"
        onSubmit={onSubmit}
        homeCurrency="CAD"
        prefill={{ amount: '2400.50', currency: 'JPY' }}
        rate={{
          status: 'ready',
          rate: { rateMicros: 8712, rateDate: '2025-06-13', source: 'cache' },
        }}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('JPY amounts have no decimals')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('saves home-currency amounts with no foreign data', async () => {
    const onSubmit = jest.fn();
    await render(
      <TransactionForm
        categories={categories}
        today="2025-06-15"
        onSubmit={onSubmit}
        homeCurrency="CAD"
      />,
    );
    await fireEvent.changeText(screen.getByLabelText('Amount'), '5');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ amountCents: -500, original: null });
  });
});
