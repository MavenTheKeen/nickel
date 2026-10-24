import { FlexWidget, TextWidget } from 'react-native-android-widget';

import type { WidgetSummary } from './summary';

// Android home screen widget. Widgets are drawn natively from this tree, so
// only the library's primitives can be used, and colours are fixed per
// theme: the handler picks the palette from the system setting.

const palettes = {
  light: {
    bg: '#FFFFFF',
    text: '#111412',
    muted: '#5B635E',
    brand: '#1B6B47',
    onBrand: '#FFFFFF',
    problem: '#B3261E',
  },
  dark: {
    bg: '#000000',
    text: '#F1F3F2',
    muted: '#A3ACA6',
    brand: '#4CC38A',
    onBrand: '#00170C',
    problem: '#FF6B61',
  },
} as const;

export function SafeToSpendWidget({ summary, dark }: { summary: WidgetSummary; dark: boolean }) {
  const c = dark ? palettes.dark : palettes.light;
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel={`${summary.label}: ${summary.value}`}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: c.bg,
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
        <TextWidget text={summary.label} style={{ fontSize: 13, color: c.muted }} />
        <TextWidget
          text={summary.value}
          style={{ fontSize: 28, fontWeight: '700', color: summary.problem ? c.problem : c.text }}
          maxLines={1}
          truncate="END"
        />
        <TextWidget
          text={summary.detail}
          style={{ fontSize: 12, color: c.muted }}
          maxLines={1}
          truncate="END"
        />
      </FlexWidget>
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'nickel://transaction' }}
        accessibilityLabel="Add expense"
        style={{
          backgroundColor: c.brand,
          borderRadius: 4,
          paddingHorizontal: 14,
          paddingVertical: 10,
          marginLeft: 12,
        }}
      >
        <TextWidget text="Add" style={{ fontSize: 15, fontWeight: '500', color: c.onBrand }} />
      </FlexWidget>
    </FlexWidget>
  );
}
