import { Stack } from 'expo-router';

export default function LeadsStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Leads & Contacts' }} />
      <Stack.Screen name="[id]" options={{ title: 'Contact' }} />
    </Stack>
  );
}
