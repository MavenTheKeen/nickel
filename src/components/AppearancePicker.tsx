import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { radius, space, useTheme } from '@/theme/tokens';

import { AppText } from './AppText';
import { CATEGORY_COLORS, CATEGORY_ICONS } from './CategoryChip';

/** Colour swatches and icon grid, shared by the category and goal editors. */
export function AppearancePicker({
  color,
  icon,
  onColor,
  onIcon,
}: {
  color: string;
  icon: string;
  onColor: (c: string) => void;
  onIcon: (i: string) => void;
}) {
  const theme = useTheme();
  const setColor = onColor;
  const setIcon = onIcon;
  return (
    <View>
      <AppText
        variant="small"
        tone="textMuted"
        style={{ margin: space.lg, marginBottom: space.xs }}
      >
        Colour
      </AppText>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: space.sm,
          paddingHorizontal: space.lg,
        }}
      >
        {CATEGORY_COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => setColor(c)}
            accessibilityRole="radio"
            accessibilityLabel={`Colour ${c}`}
            accessibilityState={{ checked: c === color }}
            style={{
              width: 36,
              height: 36,
              borderRadius: radius,
              backgroundColor: c,
              borderWidth: 3,
              borderColor: c === color ? theme.text : 'transparent',
            }}
          />
        ))}
      </View>
      <AppText
        variant="small"
        tone="textMuted"
        style={{ margin: space.lg, marginBottom: space.xs }}
      >
        Icon
      </AppText>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: space.sm,
          paddingHorizontal: space.lg,
        }}
      >
        {CATEGORY_ICONS.map((name) => (
          <Pressable
            key={name}
            onPress={() => setIcon(name)}
            accessibilityRole="radio"
            accessibilityLabel={`Icon ${name.replace(/-/g, ' ')}`}
            accessibilityState={{ checked: name === icon }}
            style={{
              width: 40,
              height: 40,
              borderRadius: radius,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: name === icon ? color : 'transparent',
              borderWidth: 1,
              borderColor: theme.rule,
            }}
          >
            <MaterialCommunityIcons
              name={name}
              size={22}
              color={name === icon ? '#FFFFFF' : theme.text}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
