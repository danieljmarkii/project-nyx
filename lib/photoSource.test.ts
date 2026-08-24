// CUL-577 — the source chooser and the per-source permission ask.
//
// The regression these pin is not "an alert has the wrong words": it is that the
// LIBRARY grant used to gate the CAMERA path, so a library-denied owner could not
// photograph a vomit at all — and that photo is what the per-incident AI read runs
// on. Every assertion below is about which permission is asked for, and which is
// not.

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
}));

import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { pickPhotoSource, ensurePhotoPermission } from './photoSource';

const askCamera = ImagePicker.requestCameraPermissionsAsync as jest.Mock;
const askLibrary = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;

/** Answer the pending Alert by pressing one of its buttons. */
function pressAlert(label: string) {
  const spy = Alert.alert as unknown as jest.Mock;
  const buttons = spy.mock.calls[spy.mock.calls.length - 1][2] as { text: string; onPress?: () => void }[];
  const btn = buttons.find((b) => b.text === label);
  if (!btn) throw new Error(`no "${label}" button on the alert`);
  btn.onPress?.();
}

/** Dismiss it the way an Android back-gesture does — no button pressed. */
function dismissAlert() {
  const spy = Alert.alert as unknown as jest.Mock;
  const opts = spy.mock.calls[spy.mock.calls.length - 1][3] as { onDismiss?: () => void } | undefined;
  opts?.onDismiss?.();
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  askCamera.mockResolvedValue({ status: 'granted' });
  askLibrary.mockResolvedValue({ status: 'granted' });
});
afterEach(() => { (Alert.alert as unknown as jest.Mock).mockRestore?.(); });

describe('pickPhotoSource — the chooser comes first', () => {
  it('a library denial does not block the camera — the defect, stated as a test', async () => {
    askLibrary.mockResolvedValue({ status: 'denied' });
    const p = pickPhotoSource('Add a photo');
    pressAlert('Take photo');
    await expect(p).resolves.toBe('camera');
    expect(askCamera).toHaveBeenCalled();
    // The load-bearing half: the library is never consulted for a camera photo.
    expect(askLibrary).not.toHaveBeenCalled();
  });

  it('a camera denial does not block the library', async () => {
    askCamera.mockResolvedValue({ status: 'denied' });
    const p = pickPhotoSource('Add a photo');
    pressAlert('Choose from library');
    await expect(p).resolves.toBe('library');
    expect(askLibrary).toHaveBeenCalled();
    expect(askCamera).not.toHaveBeenCalled();
  });

  it('asks for nothing at all when the owner cancels', async () => {
    const p = pickPhotoSource('Add a photo');
    pressAlert('Cancel');
    await expect(p).resolves.toBeNull();
    expect(askCamera).not.toHaveBeenCalled();
    expect(askLibrary).not.toHaveBeenCalled();
  });

  it('resolves on a back-gesture dismiss — a pending promise would deaden the row', async () => {
    // Without onDismiss the attach affordance stays stuck until the screen is torn
    // down, which reads to the owner as "the photo button is broken".
    const p = pickPhotoSource('Add a photo');
    dismissAlert();
    await expect(p).resolves.toBeNull();
  });

  it('resolves null on a denial, having already explained it', async () => {
    askCamera.mockResolvedValue({ status: 'denied' });
    const p = pickPhotoSource('Add a photo');
    pressAlert('Take photo');
    await expect(p).resolves.toBeNull();
    expect(Alert.alert).toHaveBeenCalledWith('Camera access needed', expect.any(String));
  });

  it('carries the caller’s title so each surface keeps its own wording', async () => {
    const p = pickPhotoSource('Attach photo');
    pressAlert('Cancel');
    await p;
    expect(Alert.alert).toHaveBeenCalledWith('Attach photo', 'Choose a source', expect.any(Array), expect.any(Object));
  });
});

describe('ensurePhotoPermission — the denial points somewhere useful', () => {
  it('camera denial offers the library', async () => {
    askCamera.mockResolvedValue({ status: 'denied' });
    await expect(ensurePhotoPermission('camera')).resolves.toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Camera access needed',
      'Allow camera access in Settings, or choose a photo from your library instead.',
    );
  });

  it('library denial offers the camera', async () => {
    askLibrary.mockResolvedValue({ status: 'denied' });
    await expect(ensurePhotoPermission('library')).resolves.toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Photo access needed',
      'Allow photo access in Settings, or take a photo instead.',
    );
  });

  it('says nothing when the grant is there', async () => {
    await expect(ensurePhotoPermission('camera')).resolves.toBe(true);
    await expect(ensurePhotoPermission('library')).resolves.toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
