import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { MonthSwitcher } from '@/components/MonthSwitcher';
import { TransactionList } from '@/components/TransactionList';
import { Loading } from '@/components/ui';
import {
  useCategories,
  useDeleteTransaction,
  useRestoreTransaction,
  useTransactions,
} from '@/hooks/queries';
import { useAppContext } from '@/hooks/AppContext';
import { useUiStore } from '@/hooks/uiStore';
import { font, radius, space, useTheme } from '@/theme/tokens';
import type { Transaction } from '@/types/domain';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function TransactionsScreen() {
  const theme = useTheme();
  const { month, setMonth, search, setSearch, categoryFilter, setCategoryFilter } = useUiStore();
  const debouncedSearch = useDebounced(search, 200);
  const list = useTransactions(month, debouncedSearch, categoryFilter);
  const categories = useCategories(true);
  const del = useDeleteTransaction();
  const restore = useRestoreTransaction();
  const { listEngine } = useAppContext();

  const catMap = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  );
  const onOpen = useCallback(
    (t: Transaction) => router.push({ pathname: '/transaction', params: { id: String(t.id) } }),
    [],
  );
  const onDelete = useCallback((t: Transaction) => del.mutateAsync(t.id), [del]);
  const onRestore = useCallback((t: Transaction) => restore.mutate(t), [restore]);

  if (!categories.data) return <Loading />;
  const active = categories.data.filter((c) => !c.archived);

  const filterButton = (id: number | null, label: string) => {
    const selected = categoryFilter === id;
    return (
      <Pressable
        key={id ?? 'all'}
        onPress={() => setCategoryFilter(id)}
        accessibilityRole="button"
        accessibilityLabel={`Filter: ${label}`}
        accessibilityState={{ selected }}
        style={{
          paddingHorizontal: space.md,
          paddingVertical: space.sm,
          borderRadius: radius,
          borderWidth: 1,
          borderColor: selected ? theme.brand : theme.rule,
          backgroundColor: selected ? theme.brand : 'transparent',
        }}
      >
        <AppText variant="small" style={{ color: selected ? theme.onBrand : theme.text }}>
          {label}
        </AppText>
      </Pressable>
    );
  };

  const header = (
    <View>
      <MonthSwitcher month={month} onChange={setMonth} />
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
        <TextInput
          testID="search-input"
          value={search}
          onChangeText={setSearch}
          placeholder="Search notes and merchants"
          placeholderTextColor={theme.textMuted}
          accessibilityLabel="Search notes and merchants"
          clearButtonMode="while-editing"
          style={{
            minHeight: 44,
            borderWidth: 1,
            borderColor: theme.rule,
            borderRadius: radius,
            paddingHorizontal: space.md,
            color: theme.text,
            fontSize: font.body,
          }}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space.sm, padding: space.lg }}
      >
        {filterButton(null, 'All')}
        {active.map((c) => filterButton(c.id, c.name))}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <TransactionList
        transactions={list.data ?? []}
        categories={catMap}
        onOpen={onOpen}
        onDelete={onDelete}
        onRestore={onRestore}
        header={header}
        engine={listEngine}
        emptyText={
          search || categoryFilter !== null ? 'Nothing matches.' : 'No transactions this month.'
        }
      />
    </View>
  );
}
