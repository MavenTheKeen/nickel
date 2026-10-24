import { Pressable, ScrollView } from 'react-native';

import { haptics } from '@/platform/haptics';
import { CURRENCIES } from '@/services/fx';
import { radius, space, useTheme } from '@/theme/tokens';

import { AppText } from './AppText';

/** A row of currency codes; `first` (usually the home currency) is listed first. */
export function CurrencyPicker({
  value,
  onChange,
  first,
  label,
}: {
  value: string;
  onChange: (code: string) => void;
  first?: string;
  label: string;
}) {
  const theme = useTheme();
  const codes = [
    ...(first ? [first] : []),
    ...CURRENCIES.map((c) => c.code).filter((c) => c !== first),
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}
    >
      {codes.map((code) => {
        const selected = code === value;
        return (
          <Pressable
            key={code}
            testID={`currency-${code}`}
            onPress={() => {
              if (!selected) haptics.select();
              onChange(code);
            }}
            accessibilityRole="radio"
            accessibilityLabel={code}
            accessibilityState={{ checked: selected }}
            style={{
              minHeight: 40,
              minWidth: 56,
              paddingHorizontal: space.md,
              borderRadius: radius,
              borderWidth: 1,
              borderColor: selected ? theme.brand : theme.rule,
              backgroundColor: selected ? theme.brand : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppText weight="medium" style={{ color: selected ? theme.onBrand : theme.text }}>
              {code}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
