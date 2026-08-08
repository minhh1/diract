import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

// iPhone stays portrait-only; iPad gets landscape too, for the sidebar +
// master-detail layout to make full use of a rotated screen. app.json's
// top-level `orientation` key only sets the native project's static
// capability (see app.json's own comment) -- this runtime call is what
// actually constrains iPhone vs iPad once both orientations are permitted
// at the native level.
export function useOrientationLock() {
  useEffect(() => {
    if (Platform.OS === 'ios' && Platform.isPad) {
      ScreenOrientation.unlockAsync();
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }
  }, []);
}
