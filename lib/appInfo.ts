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

// ── The JS bundle (CUL-690) ──────────────────────────────────────────────────
//
// Everything above describes the installed BINARY, and neither value moves on an
// `eas update`. So two devices on different JS bundles report the same
// "v1.0.0 (build 35)" — which made "is every device on the audited build?"
// unanswerable, and meant an OTA-delivered bug was reported against a string that
// cannot distinguish it from the build before it.
//
// Read defensively, and deliberately so: a diagnostic must never be able to break
// the screen it is diagnosing. This module is imported at the top of Settings and of
// the feedback composer, so a module-scope throw here is a BLANK SCREEN, not a
// missing line. The values above are read bare because expo-constants and
// expo-application are always present; this one is not.
//
// The REQUIRE is inside the try, and that placement is the whole guard — a static
// `import * as Updates from 'expo-updates'` would not be protected by anything
// below it. `expo-updates/build/ExpoUpdates.js` calls `requireNativeModule(...)` at
// its own module scope, and `requireNativeModule` THROWS `Cannot find native module
// 'ExpoUpdates'` when the native side is absent (Expo Go, a bare dev client, a
// development build predating this dependency). That throw happens while the import
// is being evaluated, before any `try` in this file is entered, and an ES import
// cannot be wrapped in one. The first draft of this function had exactly that shape,
// under this same comment — the comment was writing a cheque the code did not cash,
// in the one scenario it named. `lib/vetDocumentPickers.ts` (B-548) is the shipped
// precedent for the fix.
function readUpdates(): { updateId: string | null; channel: string | null; embedded: boolean } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Updates: typeof import('expo-updates') = require('expo-updates');
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
    // Both failure modes land here now: a missing native module (the require) and a
    // property that throws on read. Either way the formatter reports UNKNOWN, never
    // "embedded" — a device we could not read is not a device on the embedded
    // bundle, and this readout exists because a string that could not tell two
    // things apart cost a day of triage.
    return { updateId: null, channel: null, embedded: false };
  }
}

const UPDATES = readUpdates();

export const JS_UPDATE_ID = UPDATES.updateId;
export const JS_CHANNEL = UPDATES.channel;
export const JS_IS_EMBEDDED = UPDATES.embedded;
