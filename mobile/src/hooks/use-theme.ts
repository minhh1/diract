/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors, Gradients } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  const scheme = useColorScheme();
  const theme = scheme === 'unspecified' ? 'light' : scheme;

  return Colors[theme];
}

// Separate from useTheme() (rather than merged onto it) since gradient
// stops are a `readonly [string, string]` tuple, not a plain color string
// -- keeping them apart means every existing `theme.foo` color lookup
// stays untyped-string-safe.
export function useGradients() {
  const scheme = useColorScheme();
  const theme = scheme === 'unspecified' ? 'light' : scheme;

  return Gradients[theme];
}

// expo-router's native-stack header defaults to the system's light
// chrome regardless of app theme -- every nested Stack (matters/leads/
// tasks/dashboards/more) needs this on its screenOptions or the top bar
// stays a stark white bar over an otherwise dark screen.
export function useThemedStackScreenOptions() {
  const theme = useTheme();
  return {
    headerStyle: { backgroundColor: theme.backgroundElement },
    headerTintColor: theme.text,
    headerTitleStyle: { color: theme.text },
    headerShadowVisible: false,
  } as const;
}
