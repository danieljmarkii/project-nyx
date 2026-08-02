// The Culprit Home Screen widget — v2, the informational rebuild (Widget V2, PR 2).
// Design-locked to docs/culprit-widget-mockups.html ROUND 7; spec §2 of
// docs/nyx-widget-requirements.md v2.0.
//
// ── READ THIS BEFORE EDITING ────────────────────────────────────────────────
// This is NOT a React Native component and it does not run in the app process.
// babel-preset-expo's `'widget'` directive replaces the function below with a
// STRING of its own source at build time. The app stores that string in the App
// Group; the widget extension evaluates it in a bare JavaScriptCore context
// whose only globals are `@expo/ui/swift-ui`, its modifiers, and a React/JSX
// shim. Concretely:
//
//   • NO imports are in scope at runtime. Every value the layout uses must be a
//     global (a SwiftUI component or modifier), a parameter, or declared INSIDE
//     the function. Referencing a module-scope constant — a theme token, a
//     helper, anything imported — is a ReferenceError on device. Hence the
//     inline `T` palette and the local helpers: they are duplication on purpose,
//     and widgets/CulpritWidget.test.ts evaluates the emitted string in a
//     faithful stand-in context so a leak fails in CI, not on someone's phone.
//   • NO filesystem and NO network. v2 NEVER WRITES (V2-1): there is no capture,
//     no outbox, no button — every interactive element is a `Link` that opens the
//     app. The layout is a pure renderer over the props the publisher computed;
//     it composes no facts.
//   • A dynamic child list must be passed as ONE array expression. The native
//     child walker reads `props.children` as a flat array of nodes and silently
//     drops a NESTED array, so every list below is built in JS and interpolated
//     as a single child.
//
// Two deliberate deviations, recorded rather than left to be discovered:
//   • Custom fonts are not available to the extension (Geist is not in the
//     widget target's bundle), so the widget renders in the system face.
//   • Glyphs are SF Symbols, not the app's Lucide `EventIcon` family, for the
//     same reason (no RN/SVG in this runtime). They are matched to the app's
//     meaning and, per §2.3, to a SHAPE that survives monochrome rendering:
//     meal = filled circle, treat = small filled circle, med = rounded square,
//     symptom = diamond (a rotated square), learned window = hollow ring.

import {
  Circle,
  Divider,
  HStack,
  Image,
  Link,
  Spacer,
  Text,
  VStack,
  ZStack,
} from '@expo/ui/swift-ui';
import {
  background,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  offset,
  padding,
  shapes,
  strokeBorder,
} from '@expo/ui/swift-ui/modifiers';
import {
  type CulpritWidgetProps,
  type WidgetBand,
  type WidgetPetPanel,
  type WidgetTile,
  type WidgetUpNext,
} from '../lib/widgetProps';

/** The `petSlot` configuration parameter, as app.json declares it. */
export interface CulpritWidgetConfiguration {
  petSlot: string;
}

export function CulpritWidgetLayout(
  props: CulpritWidgetProps,
  environment: { date: Date; configuration?: CulpritWidgetConfiguration },
) {
  'widget';

  // Tokens, verbatim from constants/theme.ts (see the header on why they are
  // inlined). The widget is light-ground only, matching the design-locked mock;
  // it sets its own container background so a dark system material can never
  // render this palette unreadable.
  const T = {
    accent: '#00C2A8', // colorEventMeal / accent — meal + treat glyphs, the today dot
    accentInk: '#0B7B6C', // a covered trial dot, a logged pip tick
    med: '#5B7A9E', // colorEventMedication — the med glyph
    symptom: '#F43F5E', // colorEventSymptom — the symptom glyph + rose pip
    symptomLight: '#FFE4E6', // colorEventSymptomLight — the symptom tile ground
    symptomInk: '#9F1239', // the symptom tile's small-caps label
    surface: '#FFFFFF',
    surfaceSubtle: '#F5F5F5',
    border: '#EAEAEA',
    tickIdle: '#C9C9C9', // an un-logged pip tick / a trial gap dot
    textPrimary: '#0A0A0A',
    textSecondary: '#525252',
    textTertiary: '#737373',
    crescent: '#211E4E',
  };

  // Inlined, NOT imported: the layout runs as a bare string with no module graph,
  // so `WIDGET_PROPS_SCHEMA_VERSION` would be a ReferenceError on device. Kept in
  // lockstep with lib/widgetProps.WIDGET_PROPS_SCHEMA_VERSION — the JSC eval test
  // renders a mismatched schema and asserts the door, so a drift here fails CI.
  const EXPECTED_SCHEMA_VERSION = 2;

  const slotKey = (environment.configuration && environment.configuration.petSlot) || 'slot1';
  const pets = props.pets || {};
  const panel: WidgetPetPanel | undefined = pets[slotKey];

  // ── Local helpers ─────────────────────────────────────────────────────────

  function localDayKey(d: Date): string {
    const m = String(d.getMonth() + 1);
    const day = String(d.getDate());
    return (
      d.getFullYear() +
      '-' +
      (m.length < 2 ? '0' + m : m) +
      '-' +
      (day.length < 2 ? '0' + day : day)
    );
  }

  // 'nyx:///<path>' carrying the widget's own pet and a `src=widget` marker (§5
  // success measure: every widget-sourced open is labelled from day one). The pet
  // makes the app open on the RIGHT pet regardless of the in-app active pet (D5).
  function petLink(path: string): string {
    const sep = path.indexOf('?') >= 0 ? '&' : '?';
    const petQuery = panel ? 'pet=' + panel.petId + '&' : '';
    return 'nyx:///' + path + sep + petQuery + 'src=widget';
  }

  // The day-view link. Two things v1 got wrong and this keeps:
  //   • it carries the `ts` nonce every History doorway sends — the screen
  //     ignores a `date` without one (the tab persists across navigation);
  //   • it points at the day being RENDERED, not the day the snapshot describes —
  //     on a stale render the widget already shows the empty day, so a link to
  //     yesterday would contradict what the owner is looking at.
  function dayLink(dayKey: string): string {
    return petLink('history?date=' + dayKey + '&ts=' + Date.now());
  }

  // CulpritMark at 16pt — the real geometry (a disc carved by an overlapping disc
  // in the ground colour, plus the teal Signal dot), scaled from the 100-unit
  // viewBox of components/brand/CulpritMark.tsx. Static: the mark never pulses on
  // the widget (§2.2).
  function mark() {
    const s = 0.16;
    return (
      <ZStack alignment="topLeading" modifiers={[frame({ width: 16, height: 16 })]}>
        {[
          <Circle
            key="disc"
            modifiers={[
              frame({ width: 66 * s, height: 66 * s }),
              foregroundStyle(T.crescent),
              offset({ x: 12 * s, y: 17 * s }),
            ]}
          />,
          <Circle
            key="carve"
            modifiers={[
              frame({ width: 58 * s, height: 58 * s }),
              foregroundStyle(T.surface),
              offset({ x: 32 * s, y: 14 * s }),
            ]}
          />,
          <Circle
            key="dot"
            modifiers={[
              frame({ width: 21 * s, height: 21 * s }),
              foregroundStyle(T.accent),
              offset({ x: 55.5 * s, y: 42.5 * s }),
            ]}
          />,
        ]}
      </ZStack>
    );
  }

  // The header (§2.2): mark · pet name · right-aligned context line. A Link to
  // Home (Job 2 — the fastest door back in). Fixed 16pt tall.
  function header(title: string, trailing: string) {
    return (
      <Link key="header" destination={petLink('')}>
        <HStack spacing={6} modifiers={[frame({ maxWidth: Infinity, height: 16 })]}>
          {[
            mark(),
            <Text
              key="title"
              modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(T.textPrimary)]}>
              {title}
            </Text>,
            <Spacer key="spacer" />,
            <Text key="trailing" modifiers={[font({ size: 10.5 }), foregroundStyle(T.textTertiary)]}>
              {trailing}
            </Text>,
          ]}
        </HStack>
      </Link>
    );
  }

  // A whole-widget message state (signed out, unbound slot, tombstoned pet,
  // schema mismatch). Always a Link: every dead end on this surface opens the app.
  function door(title: string, detail: string) {
    return (
      <Link destination="nyx:///?src=widget">
        <VStack
          spacing={6}
          alignment="leading"
          modifiers={[
            frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
            containerBackground(T.surface, 'widget'),
          ]}>
          {[
            mark(),
            <Text
              key="title"
              modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(T.textPrimary)]}>
              {title}
            </Text>,
            <Text
              key="detail"
              modifiers={[font({ size: 12 }), foregroundStyle(T.textSecondary)]}>
              {detail}
            </Text>,
          ]}
        </VStack>
      </Link>
    );
  }

  // The glyph for a tile kind (§2.3 vocabulary — shape first, colour second).
  function tileGlyph(kind: string) {
    if (kind === 'meal') return <Image key="g" systemName="circle.fill" size={8} color={T.accent} />;
    if (kind === 'treat') return <Image key="g" systemName="circle.fill" size={6} color={T.accent} />;
    if (kind === 'med') return <Image key="g" systemName="app.fill" size={9} color={T.med} />;
    if (kind === 'symptom') return <Image key="g" systemName="diamond.fill" size={8} color={T.symptom} />;
    if (kind === 'upNext') return <Image key="g" systemName="circle" size={8} color={T.accent} />;
    return null; // trialRecord — label only, no glyph
  }

  // One fact tile: label line (glyph + small-caps label), value line (bold value +
  // lighter unit), and a name sub-line. Every line clips with one line limit —
  // nothing wraps (§2.1). `sub` may be '' (a two-line tile).
  function factTile(tile: WidgetTile, dest: string, key: string) {
    const isSymptom = tile.kind === 'symptom';
    const glyph = tileGlyph(tile.kind);
    const labelChildren = glyph
      ? [
          glyph,
          <Text
            key="label"
            modifiers={[
              lineLimit(1),
              font({ size: 9, weight: 'semibold' }),
              foregroundStyle(isSymptom ? T.symptomInk : T.textTertiary),
            ]}>
            {tile.label.toUpperCase()}
          </Text>,
        ]
      : [
          <Text
            key="label"
            modifiers={[
              lineLimit(1),font({ size: 9, weight: 'semibold' }), foregroundStyle(T.textTertiary)]}>
            {tile.label.toUpperCase()}
          </Text>,
        ];

    const valueChildren = [
      <Text
        key="value"
        modifiers={[
          lineLimit(1),font({ size: 15, weight: 'bold' }), foregroundStyle(T.textPrimary)]}>
        {tile.value}
      </Text>,
    ];
    if (tile.unit) {
      valueChildren.push(
        <Text key="unit" modifiers={[lineLimit(1), font({ size: 11 }), foregroundStyle(T.textSecondary)]}>
          {tile.unit}
        </Text>,
      );
    }

    const rows: React.JSX.Element[] = [
      <HStack key="k" spacing={5} modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}>
        {labelChildren}
      </HStack>,
      <HStack key="v" spacing={4} modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}>
        {valueChildren.concat([<Spacer key="fill" />])}
      </HStack>,
    ];
    if (tile.sub) {
      rows.push(
        <Text
          key="s"
          modifiers={[
            lineLimit(1),font({ size: 9.5 }), foregroundStyle(T.textTertiary)]}>
          {tile.sub}
        </Text>,
      );
    }

    return (
      <Link key={key} destination={dest}>
        <VStack
          spacing={1}
          alignment="leading"
          modifiers={[
            frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'leading' }),
            padding({ horizontal: 10, vertical: 6 }),
            background(
              isSymptom ? T.symptomLight : T.surfaceSubtle,
              shapes.roundedRectangle({ cornerRadius: 12 }),
            ),
          ]}>
          {rows}
        </VStack>
      </Link>
    );
  }

  // The Up-next tile (§2.4): outlined (unfilled = not yet happened), the slot name
  // + the learned window. `restingSuffix` adds "· not logged yet" in the resting
  // grid; the empty-day headline already says it, so that state passes ''.
  function upNextTile(up: WidgetUpNext, restingSuffix: string, key: string) {
    const sub = 'usually ' + up.approxTime + restingSuffix;
    return (
      <Link key={key} destination={petLink('log?type=meal')}>
        <VStack
          spacing={1}
          alignment="leading"
          modifiers={[
            frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'leading' }),
            padding({ horizontal: 10, vertical: 6 }),
            strokeBorder({
              color: T.border,
              style: { lineWidth: 1 },
              shape: 'roundedRectangle',
              cornerRadius: 12,
            }),
          ]}>
          {[
            <HStack key="k" spacing={5} modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}>
              {[
                <Image key="g" systemName="circle" size={8} color={T.accent} />,
                <Text
                  key="label"
                  modifiers={[
                    lineLimit(1),font({ size: 9, weight: 'semibold' }), foregroundStyle(T.textTertiary)]}>
                  UP NEXT
                </Text>,
              ]}
            </HStack>,
            <Text
              key="v"
              modifiers={[
                lineLimit(1),font({ size: 12, weight: 'semibold' }), foregroundStyle(T.textPrimary)]}>
              {up.label}
            </Text>,
            <Text key="s" modifiers={[lineLimit(1), font({ size: 9.5 }), foregroundStyle(T.textTertiary)]}>
              {sub}
            </Text>,
          ]}
        </VStack>
      </Link>
    );
  }

  // The door tile (§2.3 ⑦): a dashed placeholder that opens quick-log. Fills a free
  // grid slot only; the band's Log › chip is the door's permanent home.
  function doorTile(key: string) {
    return (
      <Link key={key} destination={petLink('log?type=meal')}>
        <VStack
          spacing={1}
          alignment="leading"
          modifiers={[
            frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'leading' }),
            padding({ horizontal: 10, vertical: 6 }),
            strokeBorder({
              color: T.border,
              style: { lineWidth: 1, dash: [4, 3] },
              shape: 'roundedRectangle',
              cornerRadius: 12,
            }),
          ]}>
          {[
            <Text
              key="k"
              modifiers={[
                lineLimit(1),font({ size: 9, weight: 'semibold' }), foregroundStyle(T.textTertiary)]}>
              LOG
            </Text>,
            <Text
              key="v"
              modifiers={[
                lineLimit(1),font({ size: 11.5, weight: 'medium' }), foregroundStyle(T.textSecondary)]}>
              opens Culprit ›
            </Text>,
          ]}
        </VStack>
      </Link>
    );
  }

  // An empty grid cell — holds a column's width so an odd tile count still lays
  // out 2×2 rather than stretching one tile across the row.
  function emptyCell(key: string) {
    return <Spacer key={key} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]} />;
  }

  // The 2×2 grid from up to four tiles, padded to a fixed shape. The middle band
  // FLEXES (maxHeight Infinity) while the header and ground band are fixed — so the
  // ground band can never be squeezed off the bottom (round 6's failure), and the
  // grid never competes with it.
  function grid(cells: React.JSX.Element[]) {
    const c = cells.slice(0, 4);
    while (c.length < 4) c.push(emptyCell('empty' + c.length));
    return (
      <VStack key="grid" spacing={6} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]}>
        {[
          <HStack key="row0" spacing={6} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]}>
            {[c[0], c[1]]}
          </HStack>,
          <HStack key="row1" spacing={6} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]}>
            {[c[2], c[3]]}
          </HStack>,
        ]}
      </VStack>
    );
  }

  // The single-row grid the empty-day state uses — up-next (if a window is ahead)
  // + the door tile. Flexes, same as the full grid.
  function singleRowGrid(cells: React.JSX.Element[]) {
    const c = cells.slice(0, 2);
    while (c.length < 2) c.push(emptyCell('empty' + c.length));
    return (
      <VStack key="grid" spacing={6} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]}>
        {[
          <HStack key="row0" spacing={6} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]}>
            {[c[0], c[1]]}
          </HStack>,
        ]}
      </VStack>
    );
  }

  // ── The ground band (§2.5) ────────────────────────────────────────────────

  // A trial-day dot. Covered → filled ink; a gap → hollow idle; today →
  // accent-filled if covered, accent-ring if not yet (the same filled/hollow
  // grammar as the tile glyphs).
  function trialDot(logged: boolean, isToday: boolean, key: string) {
    if (isToday) {
      return (
        <Image key={key} systemName={logged ? 'circle.fill' : 'circle'} size={6} color={T.accent} />
      );
    }
    return (
      <Image
        key={key}
        systemName={logged ? 'circle.fill' : 'circle'}
        size={5}
        color={logged ? T.accentInk : T.tickIdle}
      />
    );
  }

  // One 7-day pip: a rose symptom dot over a coverage tick, today accented. The
  // rose dot is present-or-absent (never a "no symptom" claim); the tick is the
  // day's logging coverage (never wellness).
  function pip(day: { logged: boolean; symptomLogged: boolean }, isToday: boolean, key: string) {
    const tickColor = day.logged ? (isToday ? T.accent : T.accentInk) : T.tickIdle;
    return (
      <VStack key={key} spacing={2} modifiers={[frame({ width: 10 })]}>
        {[
          day.symptomLogged ? (
            <Circle
              key="sym"
              modifiers={[frame({ width: 4, height: 4 }), foregroundStyle(T.symptom)]}
            />
          ) : (
            <Spacer key="sym" modifiers={[frame({ width: 4, height: 4 })]} />
          ),
          <HStack
            key="tick"
            modifiers={[
              frame({ width: 8, height: 3 }),
              background(tickColor, shapes.roundedRectangle({ cornerRadius: 1.5 })),
            ]}>
            {[]}
          </HStack>,
        ]}
      </VStack>
    );
  }

  // The dashed Log › chip — the door's permanent home (§2.5). A Link, right-aligned.
  function logChip() {
    return (
      <Link key="logchip" destination={petLink('log?type=meal')}>
        <HStack
          modifiers={[
            padding({ horizontal: 9, vertical: 3 }),
            strokeBorder({
              color: T.border,
              style: { lineWidth: 1, dash: [4, 3] },
              shape: 'roundedRectangle',
              cornerRadius: 9,
            }),
          ]}>
          {[
            <Text key="t" modifiers={[font({ size: 10.5, weight: 'medium' }), foregroundStyle(T.textSecondary)]}>
              Log ›
            </Text>,
          ]}
        </HStack>
      </Link>
    );
  }

  // The ground band, present in EVERY state (§2.5). A hairline, then the coverage
  // content (trial strip / pips / nothing) + caption on the left and the Log chip
  // on the right. Fixed height so it never competes with the flexing grid.
  function band(bandData: WidgetBand) {
    const left: React.JSX.Element[] = [];
    if (bandData && bandData.type === 'trial') {
      const dots = bandData.dots.map((d, i) =>
        trialDot(d.logged, i === bandData.todayDotIndex, 'dot' + i),
      );
      left.push(
        <Link key="strip" destination={petLink('profile')}>
          <HStack spacing={3}>{dots}</HStack>
        </Link>,
      );
      left.push(
        <Text key="cap" modifiers={[lineLimit(1), font({ size: 9.5 }), foregroundStyle(T.textTertiary)]}>
          {bandData.caption}
        </Text>,
      );
    } else if (bandData && bandData.type === 'pips') {
      const pips = bandData.days.map((d, i) => pip(d, i === bandData.days.length - 1, 'pip' + i));
      left.push(
        <Link key="pips" destination={dayLink(panel ? panel.dayKey : '')}>
          <HStack spacing={5}>{pips}</HStack>
        </Link>,
      );
      left.push(
        <Text key="cap" modifiers={[lineLimit(1), font({ size: 9.5 }), foregroundStyle(T.textTertiary)]}>
          {bandData.caption}
        </Text>,
      );
    }

    return (
      <VStack key="band" spacing={6} modifiers={[frame({ maxWidth: Infinity, height: 34 })]}>
        {[
          <Divider key="rule" />,
          <HStack key="row" spacing={8} modifiers={[frame({ maxWidth: Infinity })]}>
            {left.concat([<Spacer key="sp" />, logChip()])}
          </HStack>,
        ]}
      </VStack>
    );
  }

  function shell(children: React.JSX.Element[]) {
    return (
      <VStack
        spacing={6}
        alignment="leading"
        modifiers={[
          frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
          padding({ horizontal: 14, top: 12, bottom: 11 }),
          containerBackground(T.surface, 'widget'),
        ]}>
        {children}
      </VStack>
    );
  }

  // ── States ────────────────────────────────────────────────────────────────

  // A props payload from a newer or older app writes a schema it does not
  // understand; the honest fallback is the sign-in door, never garbage (§3).
  if (props.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    return door('Open Culprit to catch up', 'Update the app to see this pet’s widget.');
  }
  if (!props.signedIn) {
    return door('Sign in to start logging', 'Culprit keeps your pet’s record on your account.');
  }
  if (!panel) {
    return door('No pet in this slot yet', 'Touch and hold the widget to pick a pet.');
  }
  if (!panel.active) {
    return door(
      panel.petName + ' isn’t in Culprit anymore',
      'Touch and hold the widget to pick another pet.',
    );
  }

  const renderedDay = localDayKey(environment.date);
  const stale = panel.dayKey !== renderedDay;

  // Staleness (§2.6.5): a render on a later local day than the snapshot describes
  // carries NO tick, count, tile or context line across the rollover. It shows the
  // empty day, and the band drops to the Log chip alone — yesterday's coverage is
  // not today's.
  if (stale) {
    return shell([
      header(panel.petName, ''),
      <Text
        key="empty"
        modifiers={[font({ size: 12 }), foregroundStyle(T.textSecondary), frame({ maxWidth: Infinity, alignment: 'leading' })]}>
        Nothing logged yet today
      </Text>,
      singleRowGrid([doorTile('door')]),
      band(null),
    ]);
  }

  // Empty day (§2.6.2): nothing logged in any class today. A designed state — the
  // honest line, the day's next window (if one is ahead), the record still in the
  // band. Never a nag, never "all quiet".
  if (!panel.hasTodayEvents) {
    const cells: React.JSX.Element[] = [];
    if (panel.upNext) cells.push(upNextTile(panel.upNext, '', 'upnext'));
    cells.push(doorTile('door'));
    return shell([
      header(panel.petName, panel.contextLine),
      <Text
        key="empty"
        modifiers={[font({ size: 12 }), foregroundStyle(T.textSecondary), frame({ maxWidth: Infinity, alignment: 'leading' })]}>
        Nothing logged yet today
      </Text>,
      singleRowGrid(cells),
      band(panel.band),
    ]);
  }

  // Resting (§2.6.1): the content-gated tile grid + the band. Candidates in
  // priority order (§2.3) — the class tiles, then the up-next tile, then the
  // trial-record tile; the first four render. If fewer than four, the door tile
  // fills one free slot (its permanent home is still the band's Log chip).
  const candidates: React.JSX.Element[] = [];
  for (let i = 0; i < panel.classTiles.length; i++) {
    const t = panel.classTiles[i];
    // Every class tile opens that day's record; the symptom tile lands on the same
    // day view (§4). The `· not logged yet` suffix never applies to a logged fact.
    candidates.push(factTile(t, dayLink(renderedDay), 'tile' + i));
  }
  if (candidates.length < 4 && panel.upNext) {
    candidates.push(upNextTile(panel.upNext, ' · not logged yet', 'upnext'));
  }
  if (candidates.length < 4 && panel.trialRecord) {
    candidates.push(factTile(panel.trialRecord, petLink('profile'), 'trialrec'));
  }
  if (candidates.length < 4) {
    candidates.push(doorTile('door'));
  }

  return shell([header(panel.petName, panel.contextLine), grid(candidates), band(panel.band)]);
}
