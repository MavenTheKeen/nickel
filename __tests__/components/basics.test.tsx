import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { arcPath, BarChart, DonutChart } from '@/components/charts';
import { CategoryChip } from '@/components/CategoryChip';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MoneyText } from '@/components/MoneyText';
import { monthLabel, MonthSwitcher } from '@/components/MonthSwitcher';
import { TransactionRow } from '@/components/TransactionRow';
import { Button, Field, ProgressBar, Segmented } from '@/components/ui';
import { UndoBar, UNDO_MS } from '@/components/UndoBar';
import { __testing } from '@/events/track';
import { useUiStore } from '@/hooks/uiStore';
import type { Category, Transaction } from '@/types/domain';

const category: Category = {
  id: 1,
  name: 'Groceries',
  color: '#2E7D32',
  icon: 'cart',
  isIncome: false,
  archived: false,
  sortOrder: 0,
  rollover: false,
};

const txn: Transaction = {
  id: 7,
  amountCents: -4510,
  date: '2025-06-01',
  categoryId: 1,
  note: 'weekly shop',
  merchant: 'Loblaws',
  recurringId: null,
  importBatchId: null,
  receipt: null,
  original: null,
  createdAt: '',
};

beforeEach(() => useUiStore.setState({ currencySymbol: '$' }));

describe('MoneyText', () => {
  it('formats cents with the current currency symbol', async () => {
    await render(<MoneyText cents={123456} />);
    expect(screen.getByText('$1,234.56')).toBeTruthy();
  });

  it('follows the currency setting', async () => {
    useUiStore.setState({ currencySymbol: '€' });
    await render(<MoneyText cents={-500} />);
    expect(screen.getByText('-€5.00')).toBeTruthy();
  });

  it('shows a plus for signed income', async () => {
    await render(<MoneyText cents={2500} signed />);
    expect(screen.getByText('+$25.00')).toBeTruthy();
  });
});

describe('TransactionRow', () => {
  it('shows merchant, details and amount with a spoken label', async () => {
    const onPress = jest.fn();
    await render(<TransactionRow transaction={txn} category={category} onPress={onPress} />);
    expect(screen.getByText('Loblaws')).toBeTruthy();
    expect(screen.getByText('Jun 1, 2025 · Groceries · weekly shop')).toBeTruthy();
    expect(screen.getByText('-$45.10')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Loblaws, expense, 45.10, 2025-06-01'));
    expect(onPress).toHaveBeenCalledWith(txn);
  });

  it('falls back to the note, then the category name', async () => {
    await render(
      <TransactionRow transaction={{ ...txn, merchant: '', note: '' }} category={category} />,
    );
    expect(screen.getByText('Groceries')).toBeTruthy();
  });
});

describe('CategoryChip', () => {
  it('is a labelled, selectable button', async () => {
    const onPress = jest.fn();
    await render(<CategoryChip category={category} selected onPress={onPress} />);
    const chip = screen.getByRole('button', { name: 'Groceries' });
    expect(chip.props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(chip);
    expect(onPress).toHaveBeenCalled();
  });
});

describe('controls', () => {
  it('Button calls back and is blocked when disabled', async () => {
    const onPress = jest.fn();
    const { rerender } = await render(<Button label="Save" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    await rerender(<Button label="Save" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('Field shows its error message', async () => {
    await render(<Field label="Amount" value="" error="Enter an amount" />);
    expect(screen.getByLabelText('Amount')).toBeTruthy();
    expect(screen.getByText('Enter an amount')).toBeTruthy();
  });

  it('Segmented reports the chosen option', async () => {
    const onChange = jest.fn();
    await render(
      <Segmented
        accessibilityLabel="Kind"
        value="expense"
        onChange={onChange}
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Expense' }).props.accessibilityState).toEqual({
      checked: true,
    });
    await fireEvent.press(screen.getByRole('radio', { name: 'Income' }));
    expect(onChange).toHaveBeenCalledWith('income');
  });

  it('ProgressBar clamps and exposes its value', async () => {
    await render(<ProgressBar percent={150} level="over" />);
    expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 100,
    });
  });

  it('MonthSwitcher moves between months', async () => {
    const onChange = jest.fn();
    await render(<MonthSwitcher month="2025-01" onChange={onChange} />);
    expect(screen.getByText('January 2025')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Previous period'));
    expect(onChange).toHaveBeenCalledWith('2024-12');
    await fireEvent.press(screen.getByLabelText('Next period'));
    expect(onChange).toHaveBeenCalledWith('2025-02');
    expect(monthLabel('2025-12')).toBe('December 2025');
  });
});

describe('UndoBar', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('offers undo and times out', async () => {
    const onUndo = jest.fn();
    const onTimeout = jest.fn();
    await render(<UndoBar message="Deleted Loblaws" onUndo={onUndo} onTimeout={onTimeout} />);
    await fireEvent.press(screen.getByLabelText('Undo'));
    expect(onUndo).toHaveBeenCalled();
    jest.advanceTimersByTime(UNDO_MS);
    expect(onTimeout).toHaveBeenCalled();
  });
});

describe('charts', () => {
  it('draws arcs clockwise from 12 o’clock', async () => {
    expect(arcPath(50, 50, 40, 0, Math.PI / 2)).toBe('M 50.00 10.00 A 40 40 0 0 1 90.00 50.00');
    expect(arcPath(50, 50, 40, 0, Math.PI * 1.5)).toContain(' 0 1 1 ');
  });

  it('describes chart data to screen readers', async () => {
    await render(
      <>
        <DonutChart
          label="Spending: Groceries $45.10"
          slices={[{ key: '1', value: 4510, color: '#000', label: 'Groceries' }]}
        />
        <BarChart label="12 months" bars={[{ key: '2025-06', label: 'J', value: 100 }]} />
      </>,
    );
    expect(screen.getByLabelText('Spending: Groceries $45.10')).toBeTruthy();
    expect(screen.getByLabelText('12 months')).toBeTruthy();
  });
});

describe('ErrorBoundary', () => {
  function Boom(): never {
    throw new Error('kaboom');
  }

  it('shows a retry screen and logs an error event', async () => {
    __testing.reset();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await render(
      <ErrorBoundary screen="home">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('kaboom')).toBeTruthy();
    expect(__testing.buffered()).toBe(1);
    spy.mockRestore();
  });

  it('renders children when nothing fails', async () => {
    await render(
      <ErrorBoundary screen="home">
        <Text>fine</Text>
      </ErrorBoundary>,
    );
    expect(screen.getByText('fine')).toBeTruthy();
  });
});
