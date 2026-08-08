import { Stack } from 'expo-router';

import { useThemedStackScreenOptions } from '@/hooks/use-theme';

export default function MessagesStackLayout() {
  const screenOptions = useThemedStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Messages' }} />
      <Stack.Screen name="[id]" options={{ title: 'Chat' }} />
    </Stack>
  );
}
