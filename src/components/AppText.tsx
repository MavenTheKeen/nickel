import { Text, type TextProps } from 'react-native';

import { font, useTheme, type Palette } from '@/theme/tokens';

export interface AppTextProps extends TextProps {
  variant?: keyof typeof font;
  tone?: keyof Pick<Palette, 'text' | 'textMuted' | 'brand' | 'warn' | 'problem' | 'income'>;
  weight?: 'regular' | 'medium' | 'bold';
}

const weights = { regular: '400', medium: '500', bold: '700' } as const;

export function AppText({
  variant = 'body',
  tone = 'text',
  weight = 'regular',
  style,
  ...rest
}: AppTextProps) {
  const theme = useTheme();
  return (
    <Text
      {...rest}
      style={[
        { color: theme[tone], fontSize: font[variant], fontWeight: weights[weight] },
        variant === 'display' && { letterSpacing: -0.5 },
        style,
      ]}
    />
  );
}
