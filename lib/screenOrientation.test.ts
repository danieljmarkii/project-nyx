import { renderHook } from '@testing-library/react-native';
import { loadOrientation, lockPortrait, unlockRotation, useRotationUnlocked } from './screenOrientation';

const mockLock = jest.fn(async () => undefined);
const mockUnlock = jest.fn(async () => undefined);
jest.mock('expo-screen-orientation', () => ({
  lockAsync: (...a: unknown[]) => mockLock(...(a as [])),
  unlockAsync: () => mockUnlock(),
  OrientationLock: { PORTRAIT_UP: 'PORTRAIT_UP' },
}));

beforeEach(() => jest.clearAllMocks());

describe('the app stays portrait; one route may turn', () => {
  it('a binary without the module makes every call a quiet no-op, never a throw', async () => {
    const none = loadOrientation(() => {
      throw new Error("Cannot find native module 'ExpoScreenOrientation'");
    });
    expect(none).toBeNull();
    await expect(lockPortrait(none)).resolves.toBeUndefined();
    await expect(unlockRotation(none)).resolves.toBeUndefined();
  });

  it('locks to portrait up', async () => {
    await lockPortrait();
    expect(mockLock).toHaveBeenCalledWith('PORTRAIT_UP');
  });

  it('a failing native call never throws to the screen', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockLock.mockRejectedValueOnce(new Error('denied'));
    await expect(lockPortrait()).resolves.toBeUndefined();
  });

  it('the route unlocks while open and relocks portrait when it leaves', () => {
    const { unmount } = renderHook(() => useRotationUnlocked(true));
    expect(mockUnlock).toHaveBeenCalledTimes(1);
    expect(mockLock).not.toHaveBeenCalled();
    unmount();
    expect(mockLock).toHaveBeenCalledWith('PORTRAIT_UP');
  });

  it('inactive, it touches nothing', () => {
    const { unmount } = renderHook(() => useRotationUnlocked(false));
    unmount();
    expect(mockUnlock).not.toHaveBeenCalled();
    expect(mockLock).not.toHaveBeenCalled();
  });
});
