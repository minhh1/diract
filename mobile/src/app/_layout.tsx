import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { queryClient } from '@/lib/queryClient';
import { SessionProvider, useSession } from '@/lib/session';
import { ThemeModeProvider, useThemeMode } from '@/lib/themeMode';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session, loading } = useSession();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

// StatusBar's own "auto" tracks the OS appearance, not our resolved
// scheme -- with an explicit light/dark override active, "auto" would
// pick the wrong icon color (e.g. dark status bar icons over our dark
// background when the OS itself is still in light mode).
function ThemedStatusBar() {
  const { resolvedScheme } = useThemeMode();
  return <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeModeProvider>
        <SessionProvider>
          <ThemedStatusBar />
          <RootNavigator />
        </SessionProvider>
      </ThemeModeProvider>
    </QueryClientProvider>
  );
}
