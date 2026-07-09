# Culprit Icon — production master kit (Moon & Signal)

Design-delivered master set for the **Moon & Signal** identity (B-275). This is the
*source of truth* the app assets are derived from — keep it here so the master is never
lost and so ongoing brand work (wordmark, the Whorl motif, marketing) has the real files.

Direction + rationale: [`../../culprit-icon-brand-direction.md`](../../culprit-icon-brand-direction.md).
Generation brief: [`../culprit-icon-design-brief.md`](../culprit-icon-design-brief.md).

## Palette (locked)
| Role | Hex |
|---|---|
| Night ground (`colorBrandNight`) | `#13112E` |
| Moonlight crescent | `#F2EEE4` |
| Signal teal (`colorAccent`, the one accent) | `#00C2A8` |
| Light ground | `#F7F6F2` |

## `png/` exports
| File | What |
|---|---|
| `appstore-1024-night.png` | 1024 night master (App-Store face). Indigo ground, moonlight crescent, teal dot. |
| `icon-1024-teal.png` | Teal-badge ground variant (indigo dot). |
| `icon-1024-light.png` | Light-ground variant (indigo crescent, teal dot). |
| `ios18-dark-1024.png` | iOS-18 dark variant — transparent field, moonlight + teal (system supplies the dark tile). |
| `ios18-tinted-1024.png` | iOS-18 tinted variant — greyscale shapes on transparent (see note below). |
| `android-adaptive-foreground-1024.png` | Android adaptive foreground, mark inset in the safe zone, transparent. |
| `mark-transparent-1024.png` | Full transparent mark (splash / hero). |
| `grayscale-proof-1024.png` | Greyscale/contrast proof — mark reads with colour removed. |
| `favicon-64.png` | Web favicon. |
| `night-{120,60,40,29}.png` | Size ladder — 29 px is the iOS tray legibility check. |

## `svg/` sources
`culprit-mark.svg` (icon mark), `culprit-icon-{night,teal,light}.svg` (three grounds),
`culprit-wordmark.svg` + `culprit-lockup.svg` (Newsreader wordmark with the dotless "ı"
+ teal-dot tittle), `culprit-whorl.svg` (the fingerprint marketing motif — **not** the app icon).

## How these map into `/assets` (what actually ships in the app)
Set by PR B (B-275). App assets are derived, not copied verbatim:

| `/assets` file | Source | Transform |
|---|---|---|
| `icon.png` | `appstore-1024-night.png` | flattened to RGB (**no alpha**) — App-Store master requirement |
| `adaptive-icon.png` | `android-adaptive-foreground-1024.png` | as-is (transparent foreground; `adaptiveIcon.backgroundColor` = `#13112E`) |
| `splash-icon.png` | `mark-transparent-1024.png` | as-is (transparent mark on `splash.backgroundColor` = `#13112E`) |
| `favicon.png` | `favicon-64.png` | as-is |
| `icon-dark.png` | `ios18-dark-1024.png` | as-is (transparency preserved — Expo keeps alpha for the `dark` variant) |
| `icon-tinted.png` | `ios18-tinted-1024.png` | composited onto **opaque black** → greyscale luminance map |

### Why `icon-tinted.png` is composited onto black (not shipped transparent)
Expo generates the iOS `tinted` slot with `removeTransparency: true` and a **white**
background fill (`@expo/prebuild-config` `withIosIcons`). A transparent tinted asset would
have its field flattened to white — the brightest luminance — so iOS would tint the whole
tile and the crescent would disappear (inverted). Compositing the delivered greyscale shapes
onto opaque **black** makes the asset survive Expo's pipeline unchanged and produces the
correct luminance map: dark field → no tint (system dark tile shows), light crescent → full
tint, dot → mid tint.

> **On-device verification still required.** The iOS `dark`/`tinted` renders can only be
> confirmed on a physical iOS-18 device (dark + tinted home-screen modes) when the next
> native build is cut — they are not verifiable in the cloud build session. If tinted still
> reads wrong on device, the fix is a hand-tuned dark-ground tinted master here.
