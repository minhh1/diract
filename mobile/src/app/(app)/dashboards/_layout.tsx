import { Stack } from 'expo-router';

export default function DashboardsStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Dashboards' }} />
      <Stack.Screen name="[slug]" options={{ title: 'Dashboard' }} />
    </Stack>
  );
}
