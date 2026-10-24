import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { haptics } from '@/platform/haptics';
import { font, useTheme } from '@/theme/tokens';

// Two small charts drawn with plain SVG: no chart library to load, so the
// Insights screen stays fast and the drawing code is easy to test. Both can
// be tapped; the screen decides what a selection shows.

export interface Slice {
  key: string;
  value: number;
  color: string;
  label: string;
}

/** Arc path for a donut slice; angles in radians, 0 at 12 o'clock, clockwise. */
export function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const sweep = Math.min(end - start, Math.PI * 2 - 1e-6);
  const x0 = cx + r * Math.sin(start);
  const y0 = cy - r * Math.cos(start);
  const x1 = cx + r * Math.sin(start + sweep);
  const y1 = cy - r * Math.cos(start + sweep);
  const large = sweep > Math.PI ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function DonutChart({
  slices,
  size = 180,
  label,
  selectedKey,
  onSelect,
}: {
  slices: readonly Slice[];
  size?: number;
  label: string;
  /** The highlighted slice; the others are dimmed. */
  selectedKey?: string | null;
  /** Called with the tapped slice, or null when the selected slice is tapped again. */
  onSelect?: (key: string | null) => void;
}) {
  const theme = useTheme();
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  const stroke = size * 0.16;
  const r = (size - stroke) / 2;
  const c = size / 2;
  let angle = 0;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ alignItems: 'center' }}
    >
      <Svg width={size} height={size}>
        <Circle cx={c} cy={c} r={r} stroke={theme.track} strokeWidth={stroke} fill="none" />
        {total > 0 &&
          slices.map((s) => {
            const sweep = (Math.max(0, s.value) / total) * Math.PI * 2;
            const d = arcPath(c, c, r, angle, angle + sweep);
            angle += sweep;
            const selected = s.key === selectedKey;
            const dimmed = selectedKey != null && !selected;
            return (
              <Path
                key={s.key}
                d={d}
                stroke={s.color}
                strokeWidth={selected ? stroke * 1.15 : stroke}
                opacity={dimmed ? 0.3 : 1}
                fill="none"
                onPress={
                  onSelect
                    ? () => {
                        haptics.select();
                        onSelect(selected ? null : s.key);
                      }
                    : undefined
                }
              />
            );
          })}
      </Svg>
    </View>
  );
}

export interface Bar {
  key: string;
  label: string;
  value: number;
}

export function BarChart({
  bars,
  height = 160,
  width = 340,
  highlightKey,
  label,
  onSelect,
  valueLabel,
}: {
  bars: readonly Bar[];
  height?: number;
  width?: number;
  highlightKey?: string;
  label: string;
  onSelect?: (key: string) => void;
  /** Text shown above the highlighted bar, such as its amount. */
  valueLabel?: (bar: Bar) => string;
}) {
  const theme = useTheme();
  const max = Math.max(1, ...bars.map((b) => b.value));
  const labelSpace = 18;
  const valueSpace = valueLabel ? 16 : 0;
  const chartH = height - labelSpace;
  const slot = width / Math.max(1, bars.length);
  const barW = Math.max(4, slot * 0.6);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ alignItems: 'center' }}
    >
      <Svg width={width} height={height}>
        <Line x1={0} x2={width} y1={chartH} y2={chartH} stroke={theme.rule} strokeWidth={1} />
        {bars.map((b, i) => {
          const h = (Math.max(0, b.value) / max) * (chartH - 4 - valueSpace);
          const x = i * slot + (slot - barW) / 2;
          const highlighted = b.key === highlightKey;
          return (
            <G key={b.key}>
              <Rect
                x={x}
                y={chartH - h}
                width={barW}
                height={h}
                rx={2}
                fill={highlighted ? theme.brand : theme.textMuted}
                opacity={highlighted ? 1 : 0.45}
              />
              {highlighted && valueLabel && (
                <SvgText
                  x={Math.min(width - 4, Math.max(4, x + barW / 2))}
                  y={chartH - h - 4}
                  fontSize={font.small - 1}
                  fontWeight="600"
                  fill={theme.text}
                  textAnchor={i === 0 ? 'start' : i === bars.length - 1 ? 'end' : 'middle'}
                >
                  {valueLabel(b)}
                </SvgText>
              )}
              <SvgText
                x={x + barW / 2}
                y={height - 4}
                fontSize={font.small - 2}
                fill={highlighted ? theme.text : theme.textMuted}
                textAnchor="middle"
              >
                {b.label}
              </SvgText>
              {onSelect && (
                // A full-height invisible target, so short bars are as easy to tap as tall ones.
                <Rect
                  x={i * slot}
                  y={0}
                  width={slot}
                  height={height}
                  fill="transparent"
                  onPress={() => {
                    haptics.select();
                    onSelect(b.key);
                  }}
                />
              )}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}
