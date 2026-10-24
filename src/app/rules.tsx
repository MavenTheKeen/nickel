import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { CategoryChip, CategoryIcon } from '@/components/CategoryChip';
import { Button, Empty, Field, Loading, Row, Rule, Screen, ToggleRow } from '@/components/ui';
import { EmptyPatternError } from '@/db/repositories/categoryRules';
import { useCategories, useCategoryRuleMutations, useCategoryRules } from '@/hooks/queries';
import { merchantKey, titleCase } from '@/services/merchant';
import { space, useTheme } from '@/theme/tokens';
import type { CategoryRule } from '@/types/domain';

function RuleEditor({ rule, onDone }: { rule: CategoryRule | null; onDone: () => void }) {
  const theme = useTheme();
  const categories = useCategories();
  const { save, update, remove } = useCategoryRuleMutations();
  const [pattern, setPattern] = useState(rule ? titleCase(rule.pattern) : '');
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? 0);
  const [applyToHistory, setApplyToHistory] = useState(true);
  const [error, setError] = useState<string>();

  if (!categories.data) return null;
  const key = merchantKey(pattern);

  const submit = () => {
    if (key === '') return setError('Enter part of a merchant name, such as Starbucks');
    if (!categoryId) return setError('Choose a category');
    const onError = (e: Error) =>
      setError(e instanceof EmptyPatternError ? e.message : 'Could not save the rule');
    if (rule) {
      update.mutate({ id: rule.id, pattern, categoryId }, { onSuccess: onDone, onError });
    } else {
      save.mutate(
        { pattern, categoryId, applyToHistory },
        {
          onSuccess: (moved) => {
            if (moved > 0)
              Alert.alert(`Moved ${moved} past ${moved === 1 ? 'transaction' : 'transactions'}`);
            onDone();
          },
          onError,
        },
      );
    }
  };

  return (
    <View style={{ paddingBottom: space.lg, borderBottomWidth: 1, borderBottomColor: theme.rule }}>
      <Field
        testID="rule-pattern"
        label="Merchant contains"
        value={pattern}
        onChangeText={(t) => {
          setPattern(t);
          setError(undefined);
        }}
        placeholder="Starbucks"
        autoCapitalize="words"
        error={error}
      />
      {key !== '' && (
        <AppText
          variant="small"
          tone="textMuted"
          style={{ marginHorizontal: space.lg, marginTop: space.xs }}
        >
          Matches merchants containing the words &quot;{key}&quot;. Capitals, numbers and
          punctuation are ignored.
        </AppText>
      )}
      <AppText
        variant="small"
        tone="textMuted"
        style={{ margin: space.lg, marginBottom: space.xs }}
      >
        File under
      </AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.sm }}
      >
        {categories.data.map((c) => (
          <CategoryChip
            key={c.id}
            category={c}
            selected={c.id === categoryId}
            onPress={() => setCategoryId(c.id)}
          />
        ))}
      </ScrollView>
      {!rule && (
        <ToggleRow
          label="Also move past transactions"
          hint="Refiles earlier transactions from this merchant"
          value={applyToHistory}
          onChange={setApplyToHistory}
        />
      )}
      <View
        style={{
          flexDirection: 'row',
          gap: space.sm,
          paddingHorizontal: space.lg,
          marginTop: space.md,
        }}
      >
        <Button
          testID="rule-save"
          label="Save"
          onPress={submit}
          busy={save.isPending || update.isPending}
          style={{ flex: 1 }}
        />
        {rule && (
          <Button
            label="Delete"
            variant="danger"
            onPress={() => remove.mutate(rule.id, { onSuccess: onDone })}
            style={{ flex: 1 }}
          />
        )}
        <Button label="Cancel" variant="secondary" onPress={onDone} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

export default function RulesScreen() {
  const rules = useCategoryRules();
  const categories = useCategories(true);
  const [editing, setEditing] = useState<number | 'new' | null>(null);

  if (!rules.data || !categories.data) return <Loading />;
  const catById = new Map(categories.data.map((c) => [c.id, c]));

  return (
    <Screen testID="rules-screen">
      <View style={{ padding: space.lg, gap: space.sm }}>
        <AppText tone="textMuted">
          Rules file transactions by merchant: when you add one, import a CSV or use quick add. The
          longest matching rule wins, so &quot;Uber Eats&quot; can go to Eating out while
          &quot;Uber&quot; goes to Transport.
        </AppText>
        {editing !== 'new' && (
          <Button testID="add-rule" label="Add a rule" onPress={() => setEditing('new')} />
        )}
      </View>
      {editing === 'new' && <RuleEditor rule={null} onDone={() => setEditing(null)} />}
      <Rule inset={0} />
      {rules.data.length === 0 && editing !== 'new' ? (
        <Empty
          icon="call-split"
          title="No rules yet"
          text="When you change the category of a transaction, Nickel offers to make a rule so the same merchant is filed that way next time."
        />
      ) : (
        rules.data.map((r, i) => {
          const cat = catById.get(r.categoryId);
          return (
            <View key={r.id}>
              {i > 0 && <Rule inset={space.lg + 44} />}
              {editing === r.id ? (
                <RuleEditor rule={r} onDone={() => setEditing(null)} />
              ) : (
                <Row
                  testID={`rule-${r.id}`}
                  left={cat ? <CategoryIcon category={cat} /> : undefined}
                  title={titleCase(r.pattern)}
                  subtitle={`Filed under ${cat?.name ?? 'a removed category'}`}
                  onPress={() => setEditing(r.id)}
                  accessibilityHint="Edit this rule"
                />
              )}
            </View>
          );
        })
      )}
    </Screen>
  );
}
