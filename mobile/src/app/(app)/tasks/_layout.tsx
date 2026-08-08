import { Stack } from 'expo-router';

import { useThemedStackScreenOptions } from '@/hooks/use-theme';

export default function TasksStackLayout() {
  const screenOptions = useThemedStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Tasks' }} />
    </Stack>
  );
}
