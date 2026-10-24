import { FlashList } from '@shopify/flash-list';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { now, trackTiming } from '@/events/track';
import { space, useTheme } from '@/theme/tokens';
import type { Category, Transaction } from '@/types/domain';

import { AppText } from './AppText';
import { TransactionRow, transactionTitle } from './TransactionRow';
import { Empty, Rule } from './ui';
import { UndoBar } from './UndoBar';

export interface TransactionListProps {
  transactions: readonly Transaction[];
  categories: ReadonlyMap<number, Category>;
  onOpen: (t: Transaction) => void;
  onDelete: (t: Transaction) => Promise<Transaction | null>;
  onRestore: (t: Transaction) => void;
  header?: React.ReactElement;
  emptyText?: string;
  /** Which list implementation to use; compared on device through the transaction_list flag. */
  engine?: 'flash' | 'flat';
}

function Separator() {
  return <Rule inset={space.lg + 44} />;
}

const ROW_HEIGHT = 65; // 64px row + 1px rule, fixed so the list can skip measuring

/**
 * Virtualized list with swipe-to-delete and a short undo window. Rows have
 * a fixed height, so scrolling stays smooth with thousands of imported rows.
 * The time to the first rendered rows is logged as `list_first_render` for
 * each engine.
 */
export function TransactionList({
  transactions,
  categories,
  onOpen,
  onDelete,
  onRestore,
  header,
  emptyText = 'No transactions this month.',
  engine = 'flat',
}: TransactionListProps) {
  const theme = useTheme();
  const [lastDeleted, setLastDeleted] = useState<Transaction | null>(null);
  const mountedAt = useRef(now());
  const reported = useRef(false);
  const reportFirstRender = (ms: number) => {
    if (reported.current) return;
    reported.current = true;
    trackTiming('list_first_render', ms, { engine, rows: transactions.length });
  };

  const remove = useCallback(
    async (t: Transaction) => {
      const deleted = await onDelete(t);
      if (deleted) setLastDeleted(deleted);
    },
    [onDelete],
  );

  const renderItem = useCallback(
    ({ item }: { item: Transaction }) => (
      <ReanimatedSwipeable
        friction={2}
        rightThreshold={60}
        overshootRight={false}
        onSwipeableOpen={() => void remove(item)}
        renderRightActions={() => (
          <Pressable
            onPress={() => void remove(item)}
            accessibilityRole="button"
            accessibilityLabel="Delete"
            style={{
              width: 96,
              backgroundColor: theme.problem,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppText style={{ color: '#FFFFFF' }} weight="medium">
              Delete
            </AppText>
          </Pressable>
        )}
      >
        <View
          style={{
            height: ROW_HEIGHT - 1,
            justifyContent: 'center',
            backgroundColor: theme.background,
          }}
        >
          <TransactionRow
            transaction={item}
            category={categories.get(item.categoryId)}
            onPress={onOpen}
          />
        </View>
      </ReanimatedSwipeable>
    ),
    [categories, onOpen, remove, theme],
  );

  return (
    <View style={{ flex: 1 }}>
      {engine === 'flash' ? (
        <FlashList
          testID="transaction-list"
          data={transactions}
          keyExtractor={(t) => String(t.id)}
          renderItem={renderItem}
          ItemSeparatorComponent={Separator}
          ListHeaderComponent={header}
          ListEmptyComponent={<Empty text={emptyText} />}
          contentContainerStyle={{ paddingBottom: 96 }}
          keyboardShouldPersistTaps="handled"
          onLoad={({ elapsedTimeInMs }) => reportFirstRender(elapsedTimeInMs)}
        />
      ) : (
        <FlatList
          testID="transaction-list"
          data={transactions}
          keyExtractor={(t) => String(t.id)}
          renderItem={renderItem}
          ItemSeparatorComponent={Separator}
          getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
          initialNumToRender={15}
          maxToRenderPerBatch={20}
          windowSize={11}
          removeClippedSubviews
          ListHeaderComponent={header}
          ListEmptyComponent={<Empty text={emptyText} />}
          contentContainerStyle={{ paddingBottom: 96 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => reportFirstRender(now() - mountedAt.current)}
        />
      )}
      {lastDeleted && (
        <UndoBar
          message={`Deleted ${transactionTitle(lastDeleted, categories.get(lastDeleted.categoryId))}`}
          onUndo={() => {
            onRestore(lastDeleted);
            setLastDeleted(null);
          }}
          onTimeout={() => setLastDeleted(null)}
        />
      )}
    </View>
  );
}
