import { Stack } from 'expo-router';

import { useThemedStackScreenOptions } from '@/hooks/use-theme';

export default function MoreStackLayout() {
  const screenOptions = useThemedStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'More' }} />
      <Stack.Screen name="properties/index" options={{ title: 'Properties' }} />
      <Stack.Screen name="properties/[id]" options={{ title: 'Property' }} />
      <Stack.Screen name="switch-company" options={{ title: 'Switch Company' }} />
      <Stack.Screen name="ai/index" options={{ title: 'AI Assistant' }} />
      <Stack.Screen name="ai/[id]" options={{ title: 'AI Assistant' }} />
      <Stack.Screen name="public/index" options={{ title: 'Shared Pages' }} />
      <Stack.Screen name="public/tasks/[pageId]" options={{ title: 'Task Page' }} />
      <Stack.Screen name="public/documents/[pageId]" options={{ title: 'Document Page' }} />
      <Stack.Screen name="public/updates/[slug]" options={{ title: 'Client Update' }} />
      <Stack.Screen name="public/pages/[id]" options={{ title: 'Page' }} />
    </Stack>
  );
}
