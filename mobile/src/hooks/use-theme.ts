/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors, Gradients } from '@/constants/theme';
import { useThemeMode } from '@/lib/themeMode';

export function useTheme() {
  const { resolvedScheme } = useThemeMode();
  return Colors[resolvedScheme];
}

// Separate from useTheme() (rather than merged onto it) since gradient
// stops are a `readonly [string, string]` tuple, not a plain color string
// -- keeping them apart means every existing `theme.foo` color lookup
// stays untyped-string-safe.
export function useGradients() {
  const { resolvedScheme } = useThemeMode();
  return Gradients[resolvedScheme];
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
    // Default back button label is the previous screen's title (e.g.
    // "‹ Dashboards"), which reads as noisy clutter next to this screen's
    // own title -- the arrow alone is enough, the user already knows what
    // screen they came from.
    headerBackButtonDisplayMode: 'minimal',
  } as const;
}
