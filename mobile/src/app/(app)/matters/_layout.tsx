import { Stack } from 'expo-router';

export default function MattersStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Matters' }} />
      <Stack.Screen name="[id]" options={{ title: 'Matter' }} />
    </Stack>
  );
}
