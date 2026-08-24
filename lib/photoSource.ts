// Choosing a photo source for an event log, and asking for that source's
// permission — only that one (CUL-577).
//
// The defect this exists to make unrepeatable: both log photo paths asked for the
// MEDIA LIBRARY grant up front and bailed before the source chooser ever appeared,
// so an owner who had denied Photos could never take a camera photo. On a vomit or
// stool log that photo is not a nicety — it is the payload the per-incident AI read
// runs on (lib/simpleEvent), so a library denial silently cost the clinical half of
// the log. Seven other call sites in the app already asked per-source; the two log
// surfaces were the outliers, and they were the two that mattered most.
//
// It lives in lib/ rather than in either screen because the rule was duplicated
// across both of them, and the one that is NOT behind a beta flag (app/log.tsx —
// log_picker_v2 is seeded dark) is the one with no test file. Sharing the rule is
// what puts the live path under the same coverage as the dark one. Same reasoning,
// and the same denial-names-the-other-source copy, as lib/vetDocumentPickers.ts.

import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export type PhotoSource = 'camera' | 'library';

// Each denial names the OTHER source, because after this change there always is
// one: a denial on one path is no longer a denial on both. `false` means the
// owner has already been told; the caller's job is just to stop quietly.
export async function ensurePhotoPermission(source: PhotoSource): Promise<boolean> {
  if (source === 'camera') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Camera access needed',
        'Allow camera access in Settings, or choose a photo from your library instead.',
      );
      return false;
    }
    return true;
  }
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Photo access needed',
      'Allow photo access in Settings, or take a photo instead.',
    );
    return false;
  }
  return true;
}

// The chooser first, the permission second — that order IS the fix. Resolves to
// the chosen source once it is usable, or null for every "nothing happened"
// outcome (cancelled, dismissed, denied), so the caller has one quiet path.
//
// `onDismiss` + `cancelable` are load-bearing, not ceremony: without them an
// Android back-gesture on this alert leaves the promise pending forever and the
// attach row dead until the screen is torn down (the food-capture shape).
export async function pickPhotoSource(title: string): Promise<PhotoSource | null> {
  const chosen = await new Promise<PhotoSource | null>((resolve) => {
    Alert.alert(
      title,
      'Choose a source',
      [
        { text: 'Take photo', onPress: () => resolve('camera') },
        { text: 'Choose from library', onPress: () => resolve('library') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
  if (!chosen) return null;
  return (await ensurePhotoPermission(chosen)) ? chosen : null;
}
