import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';

import { haptics } from '@/platform/haptics';
import { radius, space, useTheme } from '@/theme/tokens';
import type { Category } from '@/types/domain';

import { AppText } from './AppText';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export const CATEGORY_ICONS: readonly IconName[] = [
  'cart',
  'home',
  'bus',
  'car',
  'food',
  'coffee',
  'flash',
  'water',
  'wifi',
  'cellphone',
  'shopping',
  'tshirt-crew',
  'heart-pulse',
  'pill',
  'star',
  'gamepad-variant',
  'airplane',
  'school',
  'gift',
  'paw',
  'dumbbell',
  'cash',
  'cash-plus',
  'bank',
  'piggy-bank',
  'beach',
  'laptop',
  'flag-checkered',
  'dots-horizontal',
];

export const CATEGORY_COLORS = [
  '#2E7D32',
  '#5D4037',
  '#1565C0',
  '#E65100',
  '#6A1B9A',
  '#AD1457',
  '#00838F',
  '#F9A825',
  '#616161',
  '#1B5E20',
  '#283593',
  '#C62828',
] as const;

function iconName(icon: string): IconName {
  return (CATEGORY_ICONS as readonly string[]).includes(icon)
    ? (icon as IconName)
    : 'dots-horizontal';
}

export function CategoryIcon({
  category,
  size = 32,
}: {
  category: Pick<Category, 'icon' | 'color'>;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: category.color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <MaterialCommunityIcons name={iconName(category.icon)} size={size * 0.6} color="#FFFFFF" />
    </View>
  );
}

export interface CategoryChipProps {
  category: Category;
  selected?: boolean;
  onPress?: () => void;
}

/** A category as a selectable square tile with its name underneath. */
export function CategoryChip({ category, selected = false, onPress }: CategoryChipProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={
        onPress
          ? () => {
              haptics.select();
              onPress();
            }
          : undefined
      }
      accessibilityRole="button"
      accessibilityLabel={category.name}
      accessibilityState={{ selected }}
      style={{
        width: 76,
        alignItems: 'center',
        paddingVertical: space.sm,
        borderRadius: radius,
        borderWidth: 2,
        borderColor: selected ? theme.brand : 'transparent',
      }}
    >
      <CategoryIcon category={category} size={36} />
      <AppText variant="small" numberOfLines={1} style={{ marginTop: space.xs, maxWidth: 70 }}>
        {category.name}
      </AppText>
    </Pressable>
  );
}
