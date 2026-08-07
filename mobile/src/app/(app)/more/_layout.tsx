import { Stack } from 'expo-router';

export default function MoreStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'More' }} />
      <Stack.Screen name="properties/index" options={{ title: 'Properties' }} />
      <Stack.Screen name="properties/[id]" options={{ title: 'Property' }} />
      <Stack.Screen name="switch-company" options={{ title: 'Switch Company' }} />
      <Stack.Screen name="ai/index" options={{ title: 'AI Assistant' }} />
      <Stack.Screen name="ai/[id]" options={{ title: 'AI Assistant' }} />
    </Stack>
  );
}
