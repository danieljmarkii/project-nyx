# The Change time picker after dark: every picker pinned light, and the app told iOS it is light only

**Date:** 2026-10-28
**One thing (re-ask):** S2 L2 — Code changes what is written next; an UPDATE changes what is already written · check: pending
**One thing:** S1 L1 — Code vs build vs OTA: one fix in two layers, one that rides an update tonight and one that waits for the next build · check: pending

Shipped via #1342. Finishes CUL-2228 and CUL-2229.

## What broke

The PM's screenshot (2026-10-27, 8:13 PM, a device on Automatic appearance): the Change time sheet's calendar with no month, no days and a blank time pill, only the selected day's blue disc, the arrows and the grey future days left. "Changing times fubars the picker", after a long fight with it.

## Why

The app has no dark mode, but `app.json` said `userInterfaceStyle: "automatic"`, the Expo scaffold's default from the first commit (1557e2e), never a ruling. iOS hands every native control the phone's appearance, Automatic turns the phone dark at sunset, and `UIDatePicker` drew its night palette (white labels, pale grey secondaries, a translucent pill) on `theme.colorSurface`, #FFFFFF. It read as "changing the time breaks it" because Change time is the only door to that sheet, and it failed only after sunset, so it never reproduced on demand. That is why the fight was long.

`SimpleEventConfirm` and `TimeConfidenceField`'s inline picker had pinned `themeVariant="light"` since B-010 (#48). `TimeEditSheet`, CUL-606's extraction and the one Change time sheet, never did, nor did 15 other pickers. The colour fills sweep (#1334) re-pointed the `accentColor` props that existed, so it could not see the sites with none: a sweep over a prop finds where the prop is wrong, never where it is missing.

## What shipped

1. **The pickers.** All 21 `DateTimePicker`s pass `themeVariant="light"` and `accentColor={colorRoles.action.onLight}`. `guards/datePickerTheme.test.ts` reads every `.tsx` under `app/` and `components/` with the TypeScript parser, reds a picker without both props, and reds a file that imports the picker but renders no tag it can read. Proven red on the pre-fix tree (16 sites named) and on `TimeEditSheet` alone. Before trusting it, the native side was read: the Fabric component applies `themeVariant` when it differs from the codegen default `unspecified`, so `light` lands on mount, and the JS layer forwards both props on iOS.
2. **The app.** `app.json` says `"light"`. `npx expo config --type introspect` shows `UIUserInterfaceStyle = Light` in the generated Info.plist; Expo's fallback plugin writes it with no `expo-system-ui`. `guards/nativeConfig.test.ts` pins it, the `ios` key that would win over it, and `expo-splash-screen`'s dark splash, which writes Automatic back at prebuild. Four mutations, four reds.

CI was green on both pushes, the full suite and the non-UTC timezones job included.

## Decisions

- **Two layers, the PM's call on 2026-10-28.** Asked to rule on the `app.json` switch (CUL-2229, filed as a decision brief), the PM answered "It needs to work... my device is on auto I believe... let's ensure that it works", read as the recommended option. Layer 1 reaches installed builds over the air; layer 2 removes the class from the next build on, including the root layout's `StatusBar style="auto"`, which resolved to white icons over the light screens at night on iPhone. Reversible in one line.
- **Every picker takes the action accent**, the colour fills ruling applied to the sites its sweep could not see (a team call inside a ratified ruling).

## Found along the way

- **Android ignores the setting** until `expo-system-ui` is installed: Expo warns and writes nothing. Filed as CUL-2235, parked until Android ships.
- **No placeholder fades at night:** every raw `TextInput` with a placeholder already sets `placeholderTextColor`. Checked, nothing to do.

## Residuals

- **Layer 2 is seen on a device only after a native build.** Its four checks are on CUL-556's comment trail for the binary sitting, and the plist line is on CUL-1850's artifact checklist, since `expo-splash-screen` can still overwrite it at prebuild.
- **The night pass on layer 1:** the PM typed `/wrap and merge`, which this session had asked for only on a clean night pass.
- **A session trap:** `pkill -f "jest --silent"` matched its own shell, whose command line held the same words, and killed both test runs. Kill by PID, or a pattern the killing command does not contain.
