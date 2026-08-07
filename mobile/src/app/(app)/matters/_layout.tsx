import { Stack } from 'expo-router';

import { useThemedStackScreenOptions } from '@/hooks/use-theme';

export default function MattersStackLayout() {
  const screenOptions = useThemedStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Matters' }} />
      <Stack.Screen name="[id]" options={{ title: 'Matter' }} />
    </Stack>
  );
}
