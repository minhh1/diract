import { Stack } from 'expo-router';

import { useThemedStackScreenOptions } from '@/hooks/use-theme';

export default function LeadsStackLayout() {
  const screenOptions = useThemedStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Leads & Contacts' }} />
      <Stack.Screen name="[id]" options={{ title: 'Contact' }} />
    </Stack>
  );
}
