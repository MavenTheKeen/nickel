import { useColorScheme } from 'react-native';

// Colours are defined once here and nowhere else. One brand colour; problems
// (over budget, errors) use a separate red so a warning never reads as
// branding. Contrast pairs were checked at 4.5:1 or better for text.

export interface Palette {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  rule: string;
  brand: string;
  onBrand: string;
  /** Spending approaching a limit (80%). */
  warn: string;
  /** Over a limit, errors, destructive actions. */
  problem: string;
  income: string;
  track: string;
}

const light: Palette = {
  background: '#FFFFFF',
  surface: '#F4F5F4',
  text: '#111412',
  textMuted: '#5B635E',
  rule: '#DADFDB',
  brand: '#1B6B47',
  onBrand: '#FFFFFF',
  warn: '#8A5300',
  problem: '#B3261E',
  income: '#1B6B47',
  track: '#E6E9E7',
};

const dark: Palette = {
  background: '#000000',
  surface: '#121513',
  text: '#F1F3F2',
  textMuted: '#A3ACA6',
  rule: '#2A302C',
  brand: '#4CC38A',
  onBrand: '#00170C',
  warn: '#F0B44C',
  problem: '#FF6B61',
  income: '#4CC38A',
  track: '#222724',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = 4;
export const font = {
  small: 13,
  body: 16,
  title: 20,
  display: 34,
} as const;

export function paletteFor(scheme: string | null | undefined): Palette {
  return scheme === 'dark' ? dark : light;
}

export function useTheme(): Palette {
  return paletteFor(useColorScheme());
}
