import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
  type ScrollViewProps,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { haptics } from '@/platform/haptics';
import { useKeyboardScroll } from '@/platform/keyboard';
import { useReducedMotion } from '@/platform/motion';
import { font, radius, space, useTheme } from '@/theme/tokens';

import { AppText } from './AppText';

// Small building blocks shared by every screen. Rows are separated by rules,
// not floating cards; corners are 4px; there is one accent colour.

export function Screen({ children, ...rest }: ScrollViewProps & { children: ReactNode }) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const keyboard = useKeyboardScroll(scrollRef, space.xxl);
  return (
    <ScrollView
      ref={scrollRef}
      {...keyboard.props}
      {...rest}
      onScroll={(e) => {
        keyboard.onScroll(e);
        rest.onScroll?.(e);
      }}
      style={[{ flex: 1, backgroundColor: theme.background }, rest.style]}
      contentContainerStyle={[keyboard.props.contentContainerStyle, rest.contentContainerStyle]}
    >
      {children}
    </ScrollView>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={{ marginTop: space.xl }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: space.lg,
          marginBottom: space.sm,
        }}
      >
        <AppText variant="title" weight="bold" accessibilityRole="header">
          {title}
        </AppText>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Rule({ inset = space.lg }: { inset?: number }) {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.rule, marginLeft: inset }} />;
}

export interface RowProps {
  left?: ReactNode;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

export function Row({
  left,
  title,
  subtitle,
  right,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: RowProps) {
  const theme = useTheme();
  const content = (pressed: boolean) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        minHeight: 56,
        backgroundColor: pressed ? theme.surface : theme.background,
      }}
    >
      {left ? <View style={{ marginRight: space.md }}>{left}</View> : null}
      <View style={{ flex: 1 }}>
        <AppText numberOfLines={1}>{title}</AppText>
        {subtitle ? (
          <AppText variant="small" tone="textMuted" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ? <View style={{ marginLeft: space.md, alignItems: 'flex-end' }}>{right}</View> : null}
    </View>
  );
  if (!onPress && !onLongPress) return <View testID={testID}>{content(false)}</View>;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
    >
      {({ pressed }) => content(pressed)}
    </Pressable>
  );
}

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
  testID?: string;
  accessibilityHint?: string;
  /** Spoken label when the visible label is a symbol. */
  accessibilityLabel?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  style,
  testID,
  accessibilityHint,
  accessibilityLabel,
}: ButtonProps) {
  const theme = useTheme();
  const bg = variant === 'primary' ? theme.brand : 'transparent';
  const fg =
    variant === 'primary' ? theme.onBrand : variant === 'danger' ? theme.problem : theme.brand;
  const inactive = disabled || busy;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      style={({ pressed }) => [
        {
          minHeight: 48,
          paddingHorizontal: space.lg,
          borderRadius: radius,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          borderWidth: variant === 'primary' ? 0 : 1,
          borderColor: variant === 'danger' ? theme.problem : theme.rule,
          opacity: inactive ? 0.5 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <AppText weight="medium" style={{ color: fg }}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

export function TextLink({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      testID={testID}
    >
      <AppText tone="brand" weight="medium">
        {label}
      </AppText>
    </Pressable>
  );
}

export interface FieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export function Field({ label, error, style, ...rest }: FieldProps) {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: space.lg, marginTop: space.md }}>
      <AppText variant="small" tone="textMuted" style={{ marginBottom: space.xs }}>
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.textMuted}
        {...rest}
        style={[
          {
            minHeight: 48,
            borderWidth: 1,
            borderColor: error ? theme.problem : theme.rule,
            borderRadius: radius,
            paddingHorizontal: space.md,
            color: theme.text,
            fontSize: font.body,
            backgroundColor: theme.background,
          },
          style,
        ]}
      />
      {error ? (
        <AppText
          variant="small"
          tone="problem"
          style={{ marginTop: space.xs }}
          accessibilityLiveRegion="polite"
        >
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

export interface SegmentedProps<T extends string> {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  accessibilityLabel: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  accessibilityLabel,
}: SegmentedProps<T>) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: 'row',
        marginHorizontal: space.lg,
        borderWidth: 1,
        borderColor: theme.rule,
        borderRadius: radius,
        overflow: 'hidden',
      }}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              if (o.value !== value) haptics.select();
              onChange(o.value);
            }}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: selected }}
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? theme.brand : 'transparent',
              borderLeftWidth: i === 0 ? 0 : 1,
              borderLeftColor: theme.rule,
            }}
          >
            <AppText weight="medium" style={{ color: selected ? theme.onBrand : theme.text }}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({
  percent,
  level,
}: {
  percent: number;
  level: 'ok' | 'warn' | 'over';
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const color = level === 'over' ? theme.problem : level === 'warn' ? theme.warn : theme.brand;
  const width = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 100));
  // Starts at the current value so a screen opens without movement; later
  // changes (a new expense) slide to the new width.
  const [anim] = useState(() => new Animated.Value(width));
  useEffect(() => {
    if (reduced) {
      anim.setValue(width);
      return;
    }
    const a = Animated.timing(anim, { toValue: width, duration: 400, useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [anim, width, reduced]);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.min(100, width) }}
      style={{ height: 6, backgroundColor: theme.track, borderRadius: 2, overflow: 'hidden' }}
    >
      <Animated.View
        style={{
          width: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
          height: '100%',
          backgroundColor: color,
        }}
      />
    </View>
  );
}

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * What a list shows when it has nothing in it: what will appear here and,
 * where there is one, the action that fills it.
 */
export function Empty({
  text,
  title,
  icon,
  action,
  testID,
}: {
  text: string;
  title?: string;
  icon?: IconName;
  action?: ReactNode;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={{
        paddingHorizontal: space.lg,
        paddingVertical: space.xl,
        gap: space.md,
        flexDirection: 'row',
        alignItems: 'flex-start',
      }}
    >
      {icon ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 40,
            height: 40,
            borderRadius: radius,
            backgroundColor: theme.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialCommunityIcons name={icon} size={22} color={theme.textMuted} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: space.xs }}>
        {title ? <AppText weight="medium">{title}</AppText> : null}
        <AppText tone="textMuted">{text}</AppText>
        {action ? (
          <View style={{ marginTop: space.sm, alignItems: 'flex-start' }}>{action}</View>
        ) : null}
      </View>
    </View>
  );
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
  testID,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        gap: space.md,
      }}
    >
      <View style={{ flex: 1 }}>
        <AppText>{label}</AppText>
        {hint ? (
          <AppText variant="small" tone="textMuted">
            {hint}
          </AppText>
        ) : null}
      </View>
      <Switch
        testID={testID}
        value={value}
        onValueChange={(v) => {
          haptics.select();
          onChange(v);
        }}
        accessibilityLabel={label}
        trackColor={{ true: theme.brand, false: theme.track }}
      />
    </View>
  );
}

export function Loading({ rows = 6 }: { rows?: number }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [pulse] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);
  const block = (width: number | `${number}%`, height: number) => (
    <View style={{ width, height, borderRadius: radius, backgroundColor: theme.surface }} />
  );
  return (
    <View
      accessible
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      style={{ flex: 1, backgroundColor: theme.background, paddingTop: space.lg }}
    >
      <Animated.View style={{ opacity: pulse }}>
        <View style={{ paddingHorizontal: space.lg, gap: space.sm, marginBottom: space.xl }}>
          {block('40%', 14)}
          {block('60%', 34)}
        </View>
        {Array.from({ length: rows }, (_, i) => (
          <View
            key={i}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: space.lg,
              paddingVertical: space.md,
              gap: space.md,
            }}
          >
            {block(32, 32)}
            <View style={{ flex: 1, gap: space.xs }}>
              {block('55%', 14)}
              {block('35%', 11)}
            </View>
            {block(56, 14)}
          </View>
        ))}
      </Animated.View>
    </View>
  );
}
