import { useEffect, useState } from 'react';
import { Keyboard, Platform, type ScrollViewProps } from 'react-native';

/**
 * Height of the on-screen keyboard on Android, 0 elsewhere. Android draws the
 * app edge to edge, so the window no longer shrinks when the keyboard opens and
 * the bottom of a scroll view stays hidden behind it.
 */
export function useAndroidKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/**
 * Props for a form's scroll view so every field and button can be scrolled
 * above the keyboard: iOS adjusts the insets itself, Android gets extra
 * bottom padding.
 */
export function useKeyboardScrollProps(basePadding: number): ScrollViewProps {
  const keyboard = useAndroidKeyboardHeight();
  return {
    keyboardShouldPersistTaps: 'handled',
    automaticallyAdjustKeyboardInsets: true,
    contentContainerStyle: { paddingBottom: basePadding + keyboard },
  };
}
