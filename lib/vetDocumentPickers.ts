// Vet Files — the native picker I/O (B-478 VF-3).
// Spec: docs/nyx-vet-files-requirements.md §4.2 / §4.4.
//
// The device-facing half of capture: launching the camera, the Photos multi-select,
// and the Files/PDF picker, and normalising whatever the OS hands back into
// PickedVetFile[] (the shape lib/vetDocumentCapture.ts turns into rows). Extracted
// from app/vet-files.tsx (VF-6, B-549) so the detail screen's "Add another page"
// can reuse the exact same camera path — one permission prompt, one asset mapping,
// one place a picker's behaviour is defined — rather than growing a second copy.
//
// Everything here returns [] for every "nothing happened" outcome (cancelled,
// denied) so the caller has one quiet path and no thrown control flow.

import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  pickedFilesFromDocumentAssets,
  pickedFilesFromImageAssets,
  type PickedVetFile,
} from './vetDocumentCapture';

export async function pickVetImages(
  source: 'camera' | 'photo_library',
): Promise<PickedVetFile[]> {
  if (source === 'camera') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Camera access needed',
        'Allow camera access in Settings to photograph a document, or choose one from Photos instead.',
      );
      return [];
    }
  } else {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photo access needed', 'Allow photo access in Settings to add a document from Photos.');
      return [];
    }
  }

  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    // No cropping: this is a record, and a crop is an edit to a clinical document.
    allowsEditing: false,
    quality: 0.9,
    // Needed for document_date — the date ON the paper is usually the date the
    // photo was taken (§4.2). GPS never travels: compressForUpload re-encodes
    // before upload and prepareVetDocumentUpload has no original-fallback (§6.2).
    exif: true,
    // Multi-select is the Photos row's whole promise (§4.4): an email thread is N
    // screenshots that are ONE document. The camera returns a single shot per
    // launch, so its multi-page path is the "Add another page" affordance (on the
    // saved moment for a fresh capture, on the detail ⋯ menu afterwards — B-549).
    ...(source === 'photo_library' ? { allowsMultipleSelection: true } : {}),
  };

  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(opts)
    : await ImagePicker.launchImageLibraryAsync(opts);
  if (result.canceled) return [];
  return pickedFilesFromImageAssets(result.assets ?? []);
}

// `expo-document-picker` is required LAZILY, and that is not a style choice.
//
// Its entry point calls `requireNativeModule('ExpoDocumentPicker')` at IMPORT
// time, which THROWS on any binary built before this dependency landed — and
// Expo Go is retired for SDK 57, so the PM's current dev client and the installed
// TestFlight build are both exactly that binary. A static import would therefore
// take down the whole Vet Files ROUTE on the app people are testing with, not just
// this one row. Requiring it here contains the blast radius to the Files path: the
// camera and Photos rows keep working (expo-image-picker is already in every
// binary), and this one says so plainly until a fresh build exists.
//
// B-548 additionally probes this at mount (isDocumentPickerAvailable) so the row
// renders disabled BEFORE the tap; this try/catch stays as the backstop for a
// binary where the module imports but the picker still fails.
export async function pickVetPdfs(): Promise<PickedVetFile[]> {
  let DocumentPicker: typeof import('expo-document-picker');
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    DocumentPicker = require('expo-document-picker');
  } catch {
    Alert.alert(
      'PDFs need an app update',
      'Picking a PDF from Files needs a newer version of the app. Photos and the camera work now.',
    );
    return [];
  }
  const result = await DocumentPicker.getDocumentAsync({
    // PDFs only, which is exactly what the row promises ("PDFs from email or a
    // clinic portal"). Images from Files would land as one document per file and
    // quietly break the page-grouping promise the two photo rows make — a photo
    // in Files belongs in the Photos path. A provider that ignores the filter is
    // caught by screenPickedFiles, not by trust.
    type: 'application/pdf',
    multiple: true,
    // Gives us a readable file:// copy on both platforms. Without it Android
    // hands back a content:// URI that persistCapture skips and
    // `new File(uri).bytes()` cannot read at upload time.
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  return pickedFilesFromDocumentAssets(result.assets ?? []);
}
