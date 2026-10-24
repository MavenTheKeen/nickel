import { useState } from 'react';
import { Alert, View } from 'react-native';

import { CategoryEditor } from '@/components/CategoryEditor';
import { CategoryIcon } from '@/components/CategoryChip';
import { Button, Loading, Row, Rule, Screen, Section, TextLink } from '@/components/ui';
import { CategoryInUseError } from '@/db/repositories/categories';
import { useCategories, useCategoryMutations } from '@/hooks/queries';
import { space } from '@/theme/tokens';
import type { Category } from '@/types/domain';

function errorText(e: unknown): string {
  if (e instanceof Error && /UNIQUE/.test(e.message))
    return 'A category with this name already exists';
  return e instanceof Error ? e.message : String(e);
}

export default function CategoriesScreen() {
  const categories = useCategories(true);
  const { create, update, archive, remove } = useCategoryMutations();
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!categories.data) return <Loading />;
  const active = categories.data.filter((c) => !c.archived);
  const archived = categories.data.filter((c) => c.archived);

  const close = () => {
    setEditing(null);
    setError(null);
  };

  const confirmDelete = (c: Category) =>
    Alert.alert(`Delete ${c.name}?`, 'Only categories with no transactions can be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          remove.mutate(c.id, {
            onSuccess: close,
            onError: (e) =>
              Alert.alert(
                'Category in use',
                e instanceof CategoryInUseError
                  ? `${c.name} has ${e.transactionCount} transactions. Archive it instead to hide it while keeping history.`
                  : errorText(e),
              ),
          }),
      },
    ]);

  const renderRow = (c: Category, i: number) => (
    <View key={c.id}>
      {i > 0 && <Rule />}
      <Row
        left={<CategoryIcon category={c} />}
        title={c.name}
        subtitle={c.isIncome ? 'Income' : 'Spending'}
        onPress={() => setEditing(editing === c.id ? null : c.id)}
        accessibilityHint="Edit this category"
        right={
          c.archived ? (
            <TextLink
              label="Restore"
              onPress={() => archive.mutate({ id: c.id, archived: false })}
            />
          ) : undefined
        }
      />
      {editing === c.id && (
        <>
          <CategoryEditor
            initial={c}
            saving={update.isPending}
            serverError={error}
            onCancel={close}
            onSave={(input) =>
              update.mutate(
                { id: c.id, input },
                { onSuccess: close, onError: (e) => setError(errorText(e)) },
              )
            }
          />
          <View style={{ flexDirection: 'row', gap: space.sm, padding: space.lg }}>
            {!c.archived && (
              <Button
                label="Archive"
                variant="secondary"
                onPress={() => archive.mutate({ id: c.id, archived: true }, { onSuccess: close })}
                style={{ flex: 1 }}
                accessibilityHint="Hides the category but keeps its transactions"
              />
            )}
            <Button
              label="Delete"
              variant="danger"
              onPress={() => confirmDelete(c)}
              style={{ flex: 1 }}
            />
          </View>
        </>
      )}
    </View>
  );

  return (
    <Screen testID="categories-screen">
      <View style={{ padding: space.lg }}>
        <Button label="Add category" onPress={() => setEditing('new')} />
      </View>
      {editing === 'new' && (
        <CategoryEditor
          saving={create.isPending}
          serverError={error}
          onCancel={close}
          onSave={(input) =>
            create.mutate(input, { onSuccess: close, onError: (e) => setError(errorText(e)) })
          }
        />
      )}
      <Section title="Active">{active.map(renderRow)}</Section>
      {archived.length > 0 && <Section title="Archived">{archived.map(renderRow)}</Section>}
    </Screen>
  );
}
