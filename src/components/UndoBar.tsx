import { useEffect } from 'react';
import { View } from 'react-native';

import { space, useTheme } from '@/theme/tokens';

import { AppText } from './AppText';
import { TextLink } from './ui';

export const UNDO_MS = 5000;

/** Bottom bar offering undo for a few seconds after a destructive action. */
export function UndoBar({
  message,
  onUndo,
  onTimeout,
}: {
  message: string;
  onUndo: () => void;
  onTimeout: () => void;
}) {
  const theme = useTheme();
  useEffect(() => {
    const t = setTimeout(onTimeout, UNDO_MS);
    return () => clearTimeout(t);
  }, [message, onTimeout]);
  return (
    <View
      testID="undo-bar"
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        left: space.lg,
        right: space.lg,
        bottom: space.lg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderRadius: 4,
        backgroundColor: theme.text,
      }}
    >
      <AppText style={{ color: theme.background, flex: 1 }} numberOfLines={1}>
        {message}
      </AppText>
      <View style={{ marginLeft: space.md }}>
        <TextLink label="Undo" onPress={onUndo} testID="undo-button" />
      </View>
    </View>
  );
}
