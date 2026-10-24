import { fireEvent, render, screen } from '@testing-library/react-native';

import { TransactionForm } from '@/components/TransactionForm';
import type { Category } from '@/types/domain';

// The photo picker and file checks are native; in this test a pick returns a
// file name straight away.
jest.mock('@/platform/receipts', () => ({
  pickReceipt: jest.fn(async () => 'abc-123.jpg'),
  receiptExists: () => true,
  receiptUri: (name: string) => `file:///receipts/${name}`,
}));

const categories: Category[] = [
  {
    id: 1,
    name: 'Groceries',
    color: '#2E7D32',
    icon: 'cart',
    isIncome: false,
    archived: false,
    sortOrder: 1,
    rollover: false,
  },
];

describe('reading a receipt in the form', () => {
  it('offers what it read and fills the form only when asked', async () => {
    const onSubmit = jest.fn();
    const readReceipt = jest.fn(async () => ({
      totalCents: 678,
      date: '2025-06-14',
      merchant: 'Loblaws',
    }));
    await render(
      <TransactionForm
        categories={categories}
        today="2025-06-15"
        onSubmit={onSubmit}
        readReceipt={readReceipt}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Take photo' }));
    expect(readReceipt).toHaveBeenCalledWith('abc-123.jpg');
    expect(await screen.findByTestId('receipt-reading')).toHaveTextContent(/Total 6\.78/);
    expect(screen.getByLabelText('Amount').props.value).toBe('');

    await fireEvent.press(screen.getByTestId('use-reading'));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      amountCents: -678,
      date: '2025-06-14',
      merchant: 'Loblaws',
      receipt: 'abc-123.jpg',
    });
  });

  it('shows nothing when the photo had no readable text', async () => {
    await render(
      <TransactionForm
        categories={categories}
        today="2025-06-15"
        onSubmit={jest.fn()}
        readReceipt={async () => ({ totalCents: null, date: null, merchant: null })}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Take photo' }));
    expect(screen.queryByTestId('receipt-reading')).toBeNull();
    expect(screen.getByTestId('receipt-thumbnail')).toBeTruthy();
  });
});
