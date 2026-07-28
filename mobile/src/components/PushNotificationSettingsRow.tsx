import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell, BellRing } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { registerForPushNotificationsAsync } from '@/lib/pushNotifications';

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
      style={[styles.row, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
    >
      <View style={styles.left}>
        {status === 'enabled' ? <BellRing size={18} color={theme.success} /> : <Bell size={18} color={theme.textSecondary} />}
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
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontSize: 14, fontWeight: '600' },
  message: { fontSize: 11, fontWeight: '500', marginTop: 2, maxWidth: 220 },
  action: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
});
