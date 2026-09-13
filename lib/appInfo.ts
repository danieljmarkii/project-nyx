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
import * as Updates from 'expo-updates';
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

// ── The JS bundle (CUL-690) ──────────────────────────────────────────────────
//
// Everything above describes the installed BINARY, and neither value moves on an
// `eas update`. So two devices on different JS bundles report the same
// "v1.0.0 (build 35)" — which made "is every device on the audited build?"
// unanswerable, and meant an OTA-delivered bug was reported against a string that
// cannot distinguish it from the build before it.
//
// Read defensively, and deliberately so: a diagnostic must never be able to break
// the screen it is diagnosing. `expo-updates` module properties can throw where the
// native module is absent (Expo Go, a bare dev client), and this module is imported
// at the top of Settings — a module-scope throw there is a blank screen instead of a
// missing line. The values above are read bare because expo-constants and
// expo-application are always present; this one is not.
function readUpdates(): { updateId: string | null; channel: string | null; embedded: boolean } {
  try {
    return {
      updateId: Updates.updateId ?? null,
      channel: Updates.channel ?? null,
      // `false` on a throw-free read that simply does not know is fine: the
      // formatter treats "not embedded and no id" as UNKNOWN rather than as
      // embedded. Claiming "embedded" on a device we cannot read would be the same
      // class of error the rest of this readout exists to remove.
      embedded: Updates.isEmbeddedLaunch === true,
    };
  } catch {
    return { updateId: null, channel: null, embedded: false };
  }
}

const UPDATES = readUpdates();

export const JS_UPDATE_ID = UPDATES.updateId;
export const JS_CHANNEL = UPDATES.channel;
export const JS_IS_EMBEDDED = UPDATES.embedded;
