export interface FlagDefinition<V extends string = string> {
  key: string;
  description: string;
  variants: readonly V[];
  /** Share of installs per variant, in the same order; must add up to 100. */
  weights: readonly number[];
  /** Used before assignment, when the flag store is unavailable. */
  defaultVariant: V;
}

export const onboardingFlag = {
  key: 'onboarding_v1',
  description:
    'A: three-step setup (categories, first budget). B: straight to Home with a prompt card.',
  variants: ['A', 'B'],
  weights: [50, 50],
  defaultVariant: 'A',
} as const satisfies FlagDefinition<'A' | 'B'>;

/**
 * Not an experiment: a switch for measuring list performance on a device.
 * Everyone gets FlashList; FlatList can be forced from the debug screen and
 * the list_first_render timings compared.
 */
export const listEngineFlag = {
  key: 'transaction_list',
  description:
    'List implementation for Transactions: FlashList (default) or FlatList, for comparison.',
  variants: ['flash', 'flat'],
  weights: [100, 0],
  defaultVariant: 'flash',
} as const satisfies FlagDefinition<'flash' | 'flat'>;

export const flagDefinitions: readonly FlagDefinition[] = [onboardingFlag, listEngineFlag];

export type ListEngine = (typeof listEngineFlag.variants)[number];

export type OnboardingVariant = (typeof onboardingFlag.variants)[number];
