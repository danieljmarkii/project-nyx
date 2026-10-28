# web-capture: layout screenshots of the app through Expo web (CUL-1895, CUL-2150)

The React Native test renderer computes no layout, so nothing in CI sees what a screen
looks like. This path photographs the real app, in Chromium, at phone widths and at iOS
text sizes, signed in to the device-pass fixture account (CUL-1222). Layout only:
motion stays with the filmed sitting per TestFlight cut (CUL-1895 D2).

```bash
deno run --allow-read --allow-env --allow-write scripts/web-capture/signals.deno.ts /tmp/signals.json
scripts/web-capture/build.sh /tmp/nyx-web          # ~4 min, NYX_WEB_CAPTURE=1 web export
CAPTURE_SIGNALS=/tmp/signals.json \
  node --experimental-strip-types scripts/web-capture/capture.mjs /tmp/nyx-web /tmp/shots
node scripts/web-capture/sheet.mjs /tmp/shots /tmp/sheet.png   # one contact sheet
```

**In CI** (`.github/workflows/layout-captures.yml`): every PR touching `app/`,
`components/` or this path runs the four steps above and links the contact sheet and the
full captures from its check's summary. Reported, never gating: red means the harness or
a shot broke (a screen it could not reach, a Signal lead that moved), and it holds no merge.

Knobs (env): `CAPTURE_SIZES` (`320@1,375x667@1,390@1,466x678@1,626x890@1,890x626@1,390@3.571,320@3.571`;
`W[xH]@text multiplier`, height 844 when omitted, the multiplier from RN's iOS table: 1.353 is the largest Settings size, 3.571 is AX5), `CAPTURE_ONLY`
(shot names), `CAPTURE_NOW` (the frozen clock), `CAPTURE_SETTLE_MS`, `CAPTURE_FLAGS` and
`CAPTURE_STORAGE` (app_config rows and device-local state, for building an older commit),
`CAPTURE_DEBUG` (log every request), `CAPTURE_SIGNALS` (signals.deno.ts's output; capture
refuses one computed at another instant or under other flags).

**The incident screen's read states (CUL-1912).** The fixture writes no read and no photo, so
`capture.mjs` adds four capture-only vomits 400 days back on Juniper, each with a drawn photo
and a read: `incident-call-juniper` (a Worth a call), `incident-watch-juniper` (Keep an eye out
with its findings), `incident-off-juniper` (a photo not read under a no) and `incident-unread-juniper` (a read
that never landed). The read rows and
the consent answer are served only to those shots, and the four records sit outside every
window the other shots read.

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

- **The Signal's phrasing.** `signals.deno.ts` runs the shipped `runSignalPipeline` over the
  served rows and writes each card's template sentence, the shell's no-model fallback. A
  phone with model phrasing on can word a card differently; the card, its rank and its
  chart are the engine's. The script fails when a pet's lead differs from the one
  `scripts/fixture/fixtureStory.ts` declares. `generate-signal` itself is still not
  answered: the seeded rows are fresh at the frozen clock, so nothing asks.
- **The engine flags.** With `CAPTURE_FLAGS` unset every Engines v3 key is off, for the app
  and the engine alike. Each pet's lead holds under every key (the fixture's detection
  test), but a key's decorations (care state, weight lane, context lines) appear only when
  `CAPTURE_FLAGS` turns it on.
- **The device chrome.** No notch, status bar or home indicator: safe-area insets are 0.
- **Text shaping.** Chromium shapes Geist and Newsreader, not CoreText. Same font
  files and the same point sizes, so a wrap can still land a word apart.
- **Native-only surfaces** (date picker, camera, haptics, notifications) render their
  web fallbacks or nothing.
