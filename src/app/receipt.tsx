import { Stack, useLocalSearchParams } from 'expo-router';
import { Image, View } from 'react-native';

import { Empty } from '@/components/ui';
import { receiptExists, receiptUri } from '@/platform/receipts';

/** A receipt photo, full screen on a black background. */
export default function ReceiptScreen() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  const valid = !!name && /^[\w-]+\.jpg$/.test(name) && receiptExists(name);
  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <Stack.Screen options={{ title: 'Receipt' }} />
      {valid ? (
        <Image
          source={{ uri: receiptUri(name) }}
          resizeMode="contain"
          style={{ flex: 1 }}
          accessibilityLabel="Receipt photo"
        />
      ) : (
        <Empty icon="image-off-outline" text="This photo is not on this device." />
      )}
    </View>
  );
}
