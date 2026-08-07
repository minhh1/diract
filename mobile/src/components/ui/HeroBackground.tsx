import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme, useGradients } from '@/hooks/use-theme';

// A soft gradient wash across the top portion of a screen, fading into the
// theme's flat background underneath -- Canva's home/sign-in screens use
// exactly this (a colorful gradient corner that fades to near-black), not
// a gradient across the whole screen. `height` is how much of the screen
// the wash covers before the fade finishes.
export function HeroBackground({ height = 360, children }: { height?: number; children: ReactNode }) {
  const theme = useTheme();
  const gradients = useGradients();

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <LinearGradient
        colors={[...gradients.hero, theme.background] as unknown as [string, string, string]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.wash, { height }]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  wash: { position: 'absolute', top: 0, left: 0, right: 0 },
});
