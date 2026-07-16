// The live app version / native build / platform, read once at the UI boundary
// (B-231) and shared by every support-path surface — the "You" screen's version
// foot + Contact-support mailto (§D6) and the Share-feedback mailto (§D8). One
// source of truth so the two composers can't drift on what "version" means, and
// so the pure lib/support.ts helpers stay free of expo-constants / Platform (the
// caller reads these and passes them in). Module-scope: immutable for the app's
// lifetime, so there's no reason to re-read per render.
//
// Version comes from the manifest (`Constants.expoConfig.version` = app.json
// "1.0.0") — correct in Expo Go AND standalone (in Expo Go the *native* value
// would be Expo Go's own version, not ours). The BUILD number comes from the
// runtime native binary via expo-application: with eas.json's remote
// appVersionSource + autoIncrement, the build number is assigned server-side and
// is NOT written back into the embedded manifest, so `Constants.expoConfig.ios.
// buildNumber` is unreliable — `Application.nativeBuildVersion` reads the actual
// CFBundleVersion / Android versionCode baked into the build. A missing build
// degrades to "Culprit v1.0.0" via formatAppVersion, never blank (§4.5).
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { Platform } from 'react-native';

export const APP_VERSION =
  Constants.expoConfig?.version ?? Application.nativeApplicationVersion ?? null;

export const APP_BUILD =
  Application.nativeBuildVersion ??
  Constants.expoConfig?.ios?.buildNumber ??
  Constants.expoConfig?.android?.versionCode ??
  null;

// Diagnostic platform string for the support/feedback mailto (§D6/§D8) so triage
// never starts with "what device / OS?". e.g. "ios 17.2" / "android 34".
export const PLATFORM = `${Platform.OS} ${Platform.Version}`;
