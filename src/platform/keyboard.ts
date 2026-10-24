import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  Keyboard,
  Platform,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  type ScrollViewProps,
} from 'react-native';

const MARGIN = 24;

/**
 * Keeps a scroll view's fields usable above the keyboard. iOS adjusts the
 * insets itself. Android draws the app edge to edge, so the window no longer
 * shrinks for the keyboard: the content gets bottom padding equal to the
 * keyboard's height, and a focused field the keyboard would cover is scrolled
 * up into view.
 */
export function useKeyboardScroll(ref: RefObject<ScrollView | null>, basePadding: number) {
  const offset = useRef(0);
  const [keyboard, setKeyboard] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const keyboardTop = e.endCoordinates.screenY;
      setKeyboard(e.endCoordinates.height);
      const input = TextInput.State.currentlyFocusedInput();
      if (!input) return;
      // Wait a frame so the added padding exists before scrolling into it.
      requestAnimationFrame(() => {
        input.measureInWindow((_x, y, _w, h) => {
          const overlap = y + h + MARGIN - keyboardTop;
          if (overlap > 0) ref.current?.scrollTo({ y: offset.current + overlap });
        });
      });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [ref]);

  const props: ScrollViewProps = {
    keyboardShouldPersistTaps: 'handled',
    automaticallyAdjustKeyboardInsets: true,
    contentContainerStyle: { paddingBottom: basePadding + keyboard },
    scrollEventThrottle: 32,
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
  };
  return { props, onScroll };
}
