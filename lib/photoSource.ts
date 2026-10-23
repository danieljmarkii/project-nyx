// Choosing a photo source for an event log, and asking for that source's
// permission — only that one (CUL-577). The library asks for nothing at all
// (CUL-1840): the system photo picker runs out of process and hands back only the
// photo the owner chose, so a whole-library grant is data we would never use, and
// App Review 5.1.1(iii) treats asking for it as collecting more than we need.
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
// across both of them (app/log.tsx and the log sheet's confirm), and when it was
// extracted the full-screen path — then the only one every account could reach —
// was the one with no test file. Sharing the rule puts both paths under one
// coverage. Same reasoning, and the same denial-names-the-other-source copy, as
// lib/vetDocumentPickers.ts.

import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export type PhotoSource = 'camera' | 'library';

// Only the camera has a grant to ask for. A camera denial names the library,
// which needs no grant and so always works. `false` means the owner has already
// been told; the caller's job is just to stop quietly.
export async function ensurePhotoPermission(source: PhotoSource): Promise<boolean> {
  if (source === 'library') return true;
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
