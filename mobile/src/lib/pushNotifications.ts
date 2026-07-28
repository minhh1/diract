import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PushRegistrationResult = { token: string | null; error: string | null };

// Registers this device for push and upserts the Expo push token against
// the signed-in user, so supabase/functions/notify-task-assigned (and any
// future notify-* function) can look it up by user_id. Requires
// `eas init` to have set `extra.eas.projectId` in app.json/app.config --
// until then this no-ops with a clear reason instead of throwing, since a
// dev build without that set is otherwise a normal, working app.
export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult> {
  if (!Device.isDevice) {
    return { token: null, error: 'Push notifications require a physical device.' };
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return { token: null, error: 'Notification permission was not granted.' };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    return { token: null, error: 'Push is not configured yet (run `eas init` to set extra.eas.projectId).' };
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { token: null, error: 'Not signed in.' };

  const { data: pushToken } = await Notifications.getExpoPushTokenAsync({ projectId });

  const { error } = await supabase.from('device_push_tokens').upsert(
    {
      user_id: userData.user.id,
      expo_push_token: pushToken,
      platform: Platform.OS,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'expo_push_token' },
  );

  return { token: pushToken, error: error?.message ?? null };
}
