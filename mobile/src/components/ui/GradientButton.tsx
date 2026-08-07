import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Radii } from '@/constants/theme';
import { useGradients } from '@/hooks/use-theme';

// Primary-action pill button with the app's signature accent gradient --
// used anywhere a screen previously had a flat, single-color "submit"
// button (sign-in, forms). Text color is always white/near-white since
// the gradient is always dark/vivid enough to need it, on both themes.
export function GradientButton({
  onPress,
  disabled,
  loading,
  children,
  style,
}: {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const gradients = useGradients();

  return (
    <Pressable onPress={onPress} disabled={disabled || loading} style={style}>
      <LinearGradient
        colors={gradients.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.button, (disabled || loading) && styles.disabled]}
      >
        {loading ? <ActivityIndicator color="#fff" /> : typeof children === 'string' ? <Text style={styles.label}>{children}</Text> : children}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingVertical: 16, borderRadius: Radii.pill, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.55 },
  label: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.2 },
});
