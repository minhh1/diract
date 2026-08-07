import { Stack } from 'expo-router';

import { useThemedStackScreenOptions } from '@/hooks/use-theme';

export default function DashboardsStackLayout() {
  const screenOptions = useThemedStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Dashboards' }} />
      <Stack.Screen name="[slug]" options={{ title: 'Dashboard' }} />
    </Stack>
  );
}
