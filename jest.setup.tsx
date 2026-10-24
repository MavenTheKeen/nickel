/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports, so they must use require() */
// Shared test setup. Native modules that do not run under Jest are replaced
// with small stand-ins.
import 'react-native-gesture-handler/jestSetup';

process.env.TZ = process.env.TZ ?? 'America/Toronto';

// The swipeable row is the only Reanimated user. In tests it renders the row
// and its actions side by side, so the delete action can be pressed directly.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = require('react-native');
  function Swipeable({
    children,
    renderRightActions,
  }: {
    children: React.ReactNode;
    renderRightActions?: () => React.ReactNode;
  }) {
    return (
      <View>
        {children}
        {renderRightActions?.()}
      </View>
    );
  }
  return { __esModule: true, default: Swipeable };
});

// Icon fonts load asynchronously from assets; tests only need a placeholder.
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { MaterialCommunityIcons: Icon };
});

// FlashList measures its container and items natively. These fixed sizes let it
// lay out rows under Jest. (FlashList 2.0.2's own jestSetup points FlashList at
// an export that this version does not have, so only its measuring part is kept.)
jest.mock('@shopify/flash-list/dist/recyclerview/utils/measureLayout', () => {
  const actual = jest.requireActual('@shopify/flash-list/dist/recyclerview/utils/measureLayout');
  const box = (width: number, height: number) => jest.fn(() => ({ x: 0, y: 0, width, height }));
  return {
    ...actual,
    measureParentSize: box(400, 900),
    measureFirstChildLayout: box(400, 900),
    measureItemLayout: box(100, 100),
  };
});

// Tests run as if the system's reduce-motion setting is on, so animations jump
// to their end state instead of updating after the test has finished.
jest.mock('@/platform/motion', () => ({
  ...jest.requireActual('@/platform/motion'),
  useReducedMotion: () => true,
}));
