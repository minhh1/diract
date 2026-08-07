import { Text, type StyleProp, type TextStyle } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';

import { useGradients } from '@/hooks/use-theme';

// Gradient-filled text (the "What will you design today?"-style hero
// headline) -- MaskedView + LinearGradient is the standard RN pattern
// since Text has no native gradient-fill support. @react-native-masked-view
// is already in the dependency tree (pulled in transitively by a nav
// package, see ios/Podfile.lock) so this needed no new native install.
export function GradientText({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  const gradients = useGradients();

  return (
    <MaskedView maskElement={<Text style={style}>{children}</Text>}>
      <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <Text style={[style, { opacity: 0 }]}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  );
}
