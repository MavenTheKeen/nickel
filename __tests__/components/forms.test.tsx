import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { CategoryEditor } from '@/components/CategoryEditor';
import { TransactionForm } from '@/components/TransactionForm';
import { TransactionList } from '@/components/TransactionList';
import type { Category, Transaction } from '@/types/domain';

const cat = (id: number, name: string, isIncome = false): Category => ({
  id,
  name,
  color: '#2E7D32',
  icon: 'cart',
  isIncome,
  archived: false,
  sortOrder: id,
  rollover: false,
});
const categories = [cat(1, 'Groceries'), cat(2, 'Fun'), cat(10, 'Salary', true)];

describe('TransactionForm', () => {
  const setup = async (initial?: Transaction) => {
    const onSubmit = jest.fn();
    await render(
      <TransactionForm
        categories={categories}
        today="2025-06-15"
        onSubmit={onSubmit}
        initial={initial}
      />,
    );
    return onSubmit;
  };

  it('saves an expense as negative cents with the default category and today', async () => {
    const onSubmit = await setup();
    await fireEvent.changeText(screen.getByLabelText('Amount'), '12.50');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({
      amountCents: -1250,
      categoryId: 1,
      date: '2025-06-15',
      note: '',
      merchant: '',
      receipt: null,
      original: null,
    });
  });

  it('shows clear messages and does not save invalid input', async () => {
    const onSubmit = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter an amount')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Amount'), '0');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Amount cannot be zero')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Amount'), 'abc');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter an amount like 12.50')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('switches to income categories and a positive amount', async () => {
    const onSubmit = await setup();
    expect(screen.queryByRole('button', { name: 'Salary' })).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Income' }));
    expect(screen.getByRole('button', { name: 'Salary' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Groceries' })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Amount'), '2000');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ amountCents: 200000, categoryId: 10 });
  });

  it('picks a category and the yesterday shortcut', async () => {
    const onSubmit = await setup();
    await fireEvent.changeText(screen.getByLabelText('Amount'), '5');
    await fireEvent.press(screen.getByRole('button', { name: 'Fun' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Yesterday' }));
    await fireEvent.changeText(screen.getByLabelText('Merchant (optional)'), '  Cinema ');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0]).toEqual({
      amountCents: -500,
      categoryId: 2,
      date: '2025-06-14',
      note: '',
      merchant: 'Cinema',
      receipt: null,
      original: null,
    });
  });

  it('pre-fills an existing transaction for editing', async () => {
    const onSubmit = await setup({
      id: 3,
      amountCents: 4200,
      date: '2025-06-01',
      categoryId: 10,
      note: 'bonus',
      merchant: '',
      recurringId: null,
      importBatchId: null,
      receipt: null,
      original: null,
      createdAt: '',
    });
    expect(screen.getByDisplayValue('42.00')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Income' }).props.accessibilityState).toEqual({
      checked: true,
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      amountCents: 4200,
      note: 'bonus',
      date: '2025-06-01',
    });
  });
});

describe('TransactionList', () => {
  const txns: Transaction[] = [1, 2, 3].map((id) => ({
    id,
    amountCents: -100 * id,
    date: `2025-06-0${id}`,
    categoryId: 1,
    note: '',
    merchant: `Shop ${id}`,
    recurringId: null,
    importBatchId: null,
    receipt: null,
    original: null,
    createdAt: '',
  }));
  const map = new Map(categories.map((c) => [c.id, c]));

  it('renders rows and opens one on press', async () => {
    const onOpen = jest.fn();
    await render(
      <TransactionList
        transactions={txns}
        categories={map}
        onOpen={onOpen}
        onDelete={jest.fn()}
        onRestore={jest.fn()}
      />,
    );
    expect(screen.getByText('Shop 1')).toBeTruthy();
    await fireEvent.press(screen.getByText('Shop 2'));
    expect(onOpen).toHaveBeenCalledWith(txns[1]);
  });

  it('deletes with undo', async () => {
    jest.useFakeTimers();
    const onDelete = jest.fn(async (t: Transaction) => t);
    const onRestore = jest.fn();
    await render(
      <TransactionList
        transactions={txns}
        categories={map}
        onOpen={jest.fn()}
        onDelete={onDelete}
        onRestore={onRestore}
      />,
    );
    await fireEvent.press(screen.getAllByRole('button', { name: 'Delete' })[0]!);
    expect(onDelete).toHaveBeenCalledWith(txns[0]);
    expect(await screen.findByText('Deleted Shop 1')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Undo'));
    expect(onRestore).toHaveBeenCalledWith(txns[0]);
    expect(screen.queryByTestId('undo-bar')).toBeNull();
    jest.useRealTimers();
  });

  it('hides the undo bar after the timeout', async () => {
    jest.useFakeTimers();
    await render(
      <TransactionList
        transactions={txns}
        categories={map}
        onOpen={jest.fn()}
        onDelete={async (t) => t}
        onRestore={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getAllByRole('button', { name: 'Delete' })[0]!);
    expect(await screen.findByTestId('undo-bar')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(6000);
    });
    expect(screen.queryByTestId('undo-bar')).toBeNull();
    jest.useRealTimers();
  });

  it('shows the empty message', async () => {
    await render(
      <TransactionList
        transactions={[]}
        categories={map}
        onOpen={jest.fn()}
        onDelete={jest.fn()}
        onRestore={jest.fn()}
        emptyText="Nothing matches."
      />,
    );
    expect(screen.getByText('Nothing matches.')).toBeTruthy();
  });
});

describe('CategoryEditor', () => {
  it('validates the name and saves a trimmed category', async () => {
    const onSave = jest.fn();
    await render(<CategoryEditor onSave={onSave} onCancel={jest.fn()} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter a name')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Name'), '  Pets ');
    await fireEvent.press(screen.getByRole('radio', { name: 'Icon paw' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({
      name: 'Pets',
      color: '#2E7D32',
      icon: 'paw',
      isIncome: false,
    });
  });

  it('shows a save error from the database', async () => {
    await render(
      <CategoryEditor
        onSave={jest.fn()}
        onCancel={jest.fn()}
        serverError="A category with this name already exists"
      />,
    );
    expect(screen.getByText('A category with this name already exists')).toBeTruthy();
  });
});

describe('TransactionList with FlashList', () => {
  it('renders rows and supports delete with undo', async () => {
    const txns: Transaction[] = [1, 2].map((id) => ({
      id,
      amountCents: -100 * id,
      date: `2025-06-0${id}`,
      categoryId: 1,
      note: '',
      merchant: `Flash ${id}`,
      recurringId: null,
      importBatchId: null,
      receipt: null,
      original: null,
      createdAt: '',
    }));
    const map = new Map(categories.map((c) => [c.id, c]));
    const onRestore = jest.fn();
    await render(
      <TransactionList
        engine="flash"
        transactions={txns}
        categories={map}
        onOpen={jest.fn()}
        onDelete={async (t) => t}
        onRestore={onRestore}
      />,
    );
    expect(await screen.findByText('Flash 1')).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Delete' })[0]!);
    await fireEvent.press(await screen.findByLabelText('Undo'));
    expect(onRestore).toHaveBeenCalledWith(txns[0]);
  });
});
