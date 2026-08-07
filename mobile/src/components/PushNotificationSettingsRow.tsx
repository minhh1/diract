import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell, BellRing } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { registerForPushNotificationsAsync } from '@/lib/pushNotifications';
import { IconBadge } from '@/components/ui/IconBadge';

export function PushNotificationSettingsRow() {
  const theme = useTheme();
  const [status, setStatus] = useState<'idle' | 'loading' | 'enabled' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const handlePress = async () => {
    setStatus('loading');
    const { token, error } = await registerForPushNotificationsAsync();
    if (token) {
      setStatus('enabled');
      setMessage(null);
    } else {
      setStatus('error');
      setMessage(error);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={status === 'loading' || status === 'enabled'}
      style={[styles.row, { backgroundColor: theme.backgroundElement }]}
    >
      <View style={styles.left}>
        <IconBadge index={3} size={38}>
          {status === 'enabled' ? <BellRing size={17} color="#fff" /> : <Bell size={17} color="#fff" />}
        </IconBadge>
        <View>
          <Text style={[styles.label, { color: theme.text }]}>Push notifications</Text>
          {message && <Text style={[styles.message, { color: theme.danger }]}>{message}</Text>}
        </View>
      </View>
      {status === 'loading' ? (
        <ActivityIndicator size="small" />
      ) : (
        <Text style={[styles.action, { color: status === 'enabled' ? theme.success : theme.accent }]}>
          {status === 'enabled' ? 'Enabled' : 'Enable'}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    paddingRight: 16,
    borderRadius: Radii.badge,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { fontSize: 14, fontWeight: '600' },
  message: { fontSize: 11, fontWeight: '500', marginTop: 2, maxWidth: 220 },
  action: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
});
