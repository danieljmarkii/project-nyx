// Web stand-in for expo-secure-store (CUL-1895 capture path only; metroWebCapture.js
// swaps it in for platform 'web' when NYX_WEB_CAPTURE=1). The real module's web build
// is an empty object, so the auth session could never persist and every capture would
// land on sign-in. localStorage is fine here: the only session it ever holds is the
// fixture's fake one, minted by the capture script against a host that does not exist.
export const AFTER_FIRST_UNLOCK = 0;
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 1;
export const ALWAYS = 2;
export const WHEN_PASSCODE_SET_THIS_DEVICE_ONLY = 3;
export const ALWAYS_THIS_DEVICE_ONLY = 4;
export const WHEN_UNLOCKED = 5;
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 6;

const PREFIX = 'securestore:';

export async function getItemAsync(key: string): Promise<string | null> {
  return globalThis.localStorage?.getItem(PREFIX + key) ?? null;
}
export async function setItemAsync(key: string, value: string): Promise<void> {
  globalThis.localStorage?.setItem(PREFIX + key, value);
}
export async function deleteItemAsync(key: string): Promise<void> {
  globalThis.localStorage?.removeItem(PREFIX + key);
}
export function getItem(key: string): string | null {
  return globalThis.localStorage?.getItem(PREFIX + key) ?? null;
}
export function setItem(key: string, value: string): void {
  globalThis.localStorage?.setItem(PREFIX + key, value);
}
export async function isAvailableAsync(): Promise<boolean> {
  return true;
}
export function canUseBiometricAuthentication(): boolean {
  return false;
}
