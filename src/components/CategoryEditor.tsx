import { useState } from 'react';
import { View } from 'react-native';

import type { CategoryInput } from '@/db/repositories/categories';
import { space, useTheme } from '@/theme/tokens';
import { categorySchema } from '@/types/schemas';

import { AppearancePicker } from './AppearancePicker';
import { CATEGORY_COLORS } from './CategoryChip';
import { Button, Field, Segmented } from './ui';

export interface CategoryEditorProps {
  initial?: CategoryInput;
  saving?: boolean;
  serverError?: string | null;
  onSave: (input: CategoryInput) => void;
  onCancel: () => void;
}

export function CategoryEditor({
  initial,
  saving,
  serverError,
  onSave,
  onCancel,
}: CategoryEditorProps) {
  const theme = useTheme();
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState<string>(initial?.color ?? CATEGORY_COLORS[0]);
  const [icon, setIcon] = useState<string>(initial?.icon ?? 'dots-horizontal');
  const [isIncome, setIsIncome] = useState(initial?.isIncome ?? false);
  const [error, setError] = useState<string>();

  const save = () => {
    const parsed = categorySchema.safeParse({ name, color, icon, isIncome });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    onSave(parsed.data);
  };

  return (
    <View style={{ paddingBottom: space.lg, borderBottomWidth: 1, borderBottomColor: theme.rule }}>
      <Field
        testID="category-name"
        label="Name"
        value={name}
        onChangeText={setName}
        error={error ?? serverError ?? undefined}
      />
      <View style={{ marginTop: space.md }}>
        <Segmented
          accessibilityLabel="Type"
          value={isIncome ? 'income' : 'expense'}
          onChange={(v) => setIsIncome(v === 'income')}
          options={[
            { value: 'expense', label: 'Spending' },
            { value: 'income', label: 'Income' },
          ]}
        />
      </View>
      <AppearancePicker color={color} icon={icon} onColor={setColor} onIcon={setIcon} />
      <View
        style={{
          flexDirection: 'row',
          gap: space.sm,
          paddingHorizontal: space.lg,
          marginTop: space.lg,
        }}
      >
        <Button
          testID="category-save"
          label="Save"
          onPress={save}
          busy={saving}
          style={{ flex: 1 }}
        />
        <Button label="Cancel" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
