# web-capture: layout screenshots of the app through Expo web (CUL-1895 spike)

The React Native test renderer computes no layout, so nothing in CI sees what a screen
looks like. This path photographs the real app, in Chromium, at phone widths and at iOS
text sizes, signed in to the device-pass fixture account (CUL-1222). Layout only:
motion stays with the filmed sitting per TestFlight cut (CUL-1895 D2).

```bash
scripts/web-capture/build.sh /tmp/nyx-web          # ~4 min, NYX_WEB_CAPTURE=1 web export
node --experimental-strip-types scripts/web-capture/capture.mjs /tmp/nyx-web /tmp/shots
```

Knobs (env): `CAPTURE_SIZES` (`320@1,390@1,390@3.571,320@3.571`; width@text multiplier,
from RN's iOS table: 1.353 is the largest Settings size, 3.571 is AX5), `CAPTURE_ONLY`
(shot names), `CAPTURE_NOW` (the frozen clock), `CAPTURE_SETTLE_MS`, `CAPTURE_FLAGS` and
`CAPTURE_STORAGE` (app_config rows and device-local state, for building an older commit),
`CAPTURE_DEBUG` (log every request).

## What it changes, and what it never touches

`metro.config.js` loads `metroWebCapture.js` only when `NYX_WEB_CAPTURE=1`, and every
swap applies to platform `web` only. A phone bundle resolves exactly as before. The stubs
under `stubs/` each say why they exist:

| Stub | Stands in for | Why |
|---|---|---|
| `entry.ts`, `fontScale.tsx` | `expo-router/entry` | iOS Dynamic Type: scales every Text by the multiplier, honouring `maxFontSizeMultiplier`, and reports `fontScale` |
| `sqlite.ts` | `expo-sqlite` | the real wa-sqlite engine, opened async (a sync open on web times out) |
| `secureStore.ts` | `expo-secure-store` | its web build is empty, so no session could persist |
| `nativeViewsInert.ts` | `@expo/ui/swift-ui` | the widget's SwiftUI layout throws at import on web |
| `findNodeHandle.ts` | react-native-web's | throws on web; null is lib/a11yFocus.ts's own off-device answer |

The Supabase URL is `https://fixture.nyx-capture.invalid` (a name that cannot resolve) and
`capture.mjs` answers every request to it from `fixtureRest.ts`, which renders the
fixture story as PostgREST rows; the app's own hydrate fills its own SQLite. No real
account, project or row is reachable from this path.

## Known gaps

- **The Signal lead.** `generate-signal` is not answered, so Home shows the Signal's
  building state, not each fixture pet's declared lead. Seeding `ai_signals` from the
  engine (the fixture's Deno detection test already computes the leads) closes it.
- **The device chrome.** No notch, status bar or home indicator: safe-area insets are 0.
- **Text shaping.** Chromium shapes Geist and Newsreader, not CoreText. Same font
  files and the same point sizes, so a wrap can still land a word apart.
- **Native-only surfaces** (date picker, camera, haptics, notifications) render their
  web fallbacks or nothing.
