// The Culprit Home Screen widget — round-3 states 1–4 (widget PR W5).
// Design-locked to docs/culprit-widget-mockups.html; spec §2 of
// docs/nyx-widget-requirements.md.
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
//     and widgets/CulpritWidget.test.tsx evaluates the emitted string in a
//     faithful stand-in context so a leak fails in CI, not on someone's phone.
//   • NO filesystem and NO network. A button press cannot call W4's App Intents
//     (they need expo-file-system + fetch). It returns a PROPS PATCH instead;
//     WidgetKit's interaction intent merges it into the persisted timeline entry
//     and reloads the widget — which is also why the picker flip is entirely
//     extension-local and needs no running app (§4.1 Q2).
//   • Captures therefore land in `props.pending` — the outbox — and the app
//     drains them through the shipped W4 intents (lib/widgetBridge.ts). The row
//     ids are generated HERE, at tap time, so the chain keeps W3's id-keyed
//     idempotency end to end.
//   • A dynamic child list must be passed as ONE array expression. The native
//     child walker reads `props.children` as a flat array of nodes and silently
//     drops a NESTED array, so `{header}{rows}` loses `rows` — every list below
//     is therefore built in JS and interpolated as a single child.
//
// Two deliberate v1 deviations, recorded rather than left to be discovered:
//   • Custom fonts are not available to the extension (Geist is not in the
//     widget target's bundle), so the widget renders in the system face — the
//     standard widget look.
//   • Glyphs are SF Symbols, not the app's Lucide `EventIcon` family, for the
//     same reason (no RN/SVG in this runtime). They are matched to the app's
//     meaning (`fork.knife` ↔ UtensilsCrossed, `pawprint` ↔ PawPrint), so the
//     two surfaces read as the same concepts in different families. Closing
//     that gap needs the glyphs shipped into the extension's asset catalog —
//     spec §10's icon pass, not a v1 blocker.

import {
  Button,
  Circle,
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
  offset,
  padding,
  shapes,
  strokeBorder,
} from '@expo/ui/swift-ui/modifiers';
import type { CulpritWidgetProps, WidgetPetPanel, WidgetSlotUi } from '../lib/widgetProps';

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
  // inlined). The widget is light-ground only in v1, matching the design-locked
  // mock; it sets its own container background so a dark system material can
  // never render this palette unreadable.
  const T = {
    accent: '#00C2A8',
    accentLight: '#E0FBF7',
    accentInk: '#0B7B6C', // theme.colorAccentInk — the ✓ mark on the tinted row
    surface: '#FFFFFF',
    surfaceSubtle: '#F5F5F5',
    border: '#EAEAEA',
    textPrimary: '#0A0A0A',
    textSecondary: '#525252',
    textTertiary: '#737373',
    crescent: '#211E4E',
  };

  const slotKey = (environment.configuration && environment.configuration.petSlot) || 'slot1';
  const pets = props.pets || {};
  const panel: WidgetPetPanel | undefined = pets[slotKey];
  const uiState: Record<string, WidgetSlotUi> = props.ui || {};
  const ui: WidgetSlotUi = uiState[slotKey] || { view: 'resting', logged: null };

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

  // v4-shaped id, generated at tap time. It becomes the canonical events/meals
  // row id, so it must satisfy the inbox's UUID guard (lib/captureInbox's
  // UUID_RE) exactly. Math.random is the only entropy JavaScriptCore offers
  // here; a collision across a household's taps is negligible, and the write is
  // id-keyed and idempotent either way.
  function uuid4(): string {
    const hex = '0123456789abcdef';
    let out = '';
    for (let i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) {
        out += '-';
      } else if (i === 14) {
        out += '4';
      } else {
        let r = Math.floor(Math.random() * 16);
        if (i === 19) r = (r & 0x3) | 0x8;
        out += hex[r];
      }
    }
    return out;
  }

  // '7:42a' — the same compact clock lib/widgetProps.formatClock renders for
  // the status rows, so the undo strip and the row it will become agree.
  function clock(d: Date): string {
    const h24 = d.getHours();
    const mm = d.getMinutes();
    const h12 = ((h24 + 11) % 12) + 1;
    const suffix = h24 < 12 ? 'a' : 'p';
    return mm === 0 ? h12 + suffix : h12 + ':' + (mm < 10 ? '0' + mm : String(mm)) + suffix;
  }

  function withUi(next: WidgetSlotUi) {
    const merged: Record<string, WidgetSlotUi> = {};
    for (const key in uiState) merged[key] = uiState[key];
    merged[slotKey] = next;
    return merged;
  }

  function petLink(path: string): string {
    const petQuery = panel ? (path.indexOf('?') >= 0 ? '&' : '?') + 'pet=' + panel.petId : '';
    return 'nyx:///' + path + petQuery;
  }

  // The day view link. Two things the first cut got wrong:
  //   • it must carry the `ts` nonce every other History doorway sends — the
  //     screen ignores a `date` without one (app/(tabs)/history.tsx), and the
  //     tab persists across navigation, so without it a widget tap on an
  //     already-visited History opens whatever filter was last used;
  //   • it must point at the day being RENDERED, not the day the snapshot
  //     describes — on a stale render the rows already show today's gaps, so a
  //     link to yesterday would contradict what the owner is looking at.
  // The nonce is the evaluation clock, which advances on every widget refresh.
  function dayLink(dayKey: string): string {
    return petLink('history?date=' + dayKey + '&ts=' + Date.now());
  }

  // A press that captures: append to the outbox, drop back to resting, and
  // offer the undo. Nothing here writes a row — the app does, from `pending`.
  function capturePatch(
    kind: 'meal' | 'treat' | 'bowl_topup',
    foodItemId: string | null,
    label: string,
  ) {
    const now = new Date();
    const record = {
      id: uuid4(),
      mealId: kind === 'bowl_topup' ? null : uuid4(),
      kind,
      petId: panel ? panel.petId : '',
      foodItemId,
      occurredAt: now.toISOString(),
      label,
    };
    return {
      pending: (props.pending || []).concat([record]),
      ui: withUi({ view: 'resting', logged: { id: record.id, label, at: clock(now) } }),
    };
  }

  // Undo. One path, honest at any timing (the W3 §4.1 Q5 recommendation): the
  // capture leaves the outbox AND its id is recorded as revoked, so a tap the
  // app already drained is soft-deleted on the next drain rather than quietly
  // standing. `revoked` is bounded; the app clears it on every publish.
  // NOTE: `revoked` is one flat pool shared by every pet slot on the device
  // (there is one timeline per widget KIND, not per instance). 20 is far above
  // any realistic un-drained backlog — the app clears it on every publish — but
  // the pool is shared, so a hypothetical multi-widget household churning
  // captures faster than the app ever runs could evict an old revoke.
  function undoPatch(captureId: string) {
    const carried = (props.revoked || []).filter((id) => id !== captureId).slice(-19);
    return {
      pending: (props.pending || []).filter((p) => p.id !== captureId),
      revoked: carried.concat([captureId]),
      ui: withUi({ view: 'resting', logged: null }),
    };
  }

  // ── Pieces ────────────────────────────────────────────────────────────────

  // CulpritMark at 16pt — the real geometry (a disc carved by an overlapping
  // disc in the ground colour, plus the teal Signal dot), scaled from the
  // 100-unit viewBox of components/brand/CulpritMark.tsx. Static: the mark
  // never pulses on the widget (§2.1).
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

  function header(title: string, trailing: string) {
    return (
      <HStack key="header" spacing={6} modifiers={[frame({ maxWidth: Infinity })]}>
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
    );
  }

  // A whole-widget message state (signed out, unbound slot, tombstoned pet).
  // Always a Link: every dead end on this surface opens the app (Job 2).
  function door(title: string, detail: string) {
    return (
      <Link destination="nyx:///">
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

  // One status row. `stale` drops the tick AND its clock time together: a
  // widget rendering on a later day than the snapshot describes shows the slot
  // as an open gap, never yesterday's ✓ carried forward (B-156 G1 generalized).
  function statusRow(
    row: { label: string; done: boolean; when: string; expected: string; ambient: boolean },
    stale: boolean,
    key: string,
  ) {
    const done = row.done && !stale;
    // An ambient row (the free-fed bowl) never wears the task vocabulary: an
    // un-topped bowl is not an unmet obligation, and a top-up is an arrangement
    // re-attest, never a fed-✓. It gets a quiet dotted mark in either state, so
    // the only thing that changes is the fact in the trailing text.
    const glyph = row.ambient ? 'circle.dotted' : done ? 'checkmark.circle.fill' : 'circle';
    const glyphColor = row.ambient ? T.textTertiary : done ? T.accentInk : T.accent;
    return (
      <HStack
        key={key}
        spacing={7}
        modifiers={[
          padding({ horizontal: 8, vertical: 5 }),
          background(T.surfaceSubtle, shapes.roundedRectangle({ cornerRadius: 11 })),
          frame({ maxWidth: Infinity }),
        ]}>
        {[
          <Image key="tick" systemName={glyph} size={13} color={glyphColor} />,
          <Text
            key="label"
            modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle(T.textPrimary)]}>
            {row.label}
          </Text>,
          <Spacer key="spacer" />,
          <Text key="when" modifiers={[font({ size: 10.5 }), foregroundStyle(T.textTertiary)]}>
            {done ? row.when : row.expected}
          </Text>,
        ]}
      </HStack>
    );
  }

  // The just-logged confirmation row — the mock's "✓ just now · tap to undo on
  // the affected row". It sits ABOVE the status rows rather than replacing the
  // column, so the widget keeps answering its ambient "did I log it?" question
  // (Job 1) through a capture. It carries the minute, not "just now": the
  // widget has no guaranteed re-render, so a relative claim would quietly go
  // stale on the Home Screen.
  //
  // Undo is state-based, not timer-based, for the same reason — a "tap to undo"
  // that silently stopped working would be worse than one that stays until the
  // app takes the capture off our hands.
  function loggedRow(logged: { id: string; label: string; at: string }) {
    return (
      <HStack
        key="confirm"
        spacing={7}
        modifiers={[
          padding({ horizontal: 8, vertical: 5 }),
          background(T.accentLight, shapes.roundedRectangle({ cornerRadius: 11 })),
          frame({ maxWidth: Infinity }),
        ]}>
        {[
          <Image key="tick" systemName="checkmark.circle.fill" size={13} color={T.accentInk} />,
          <Text
            key="label"
            modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle(T.textPrimary)]}>
            {logged.label}
          </Text>,
          <Spacer key="spacer" />,
          <Text key="when" modifiers={[font({ size: 10.5 }), foregroundStyle(T.textTertiary)]}>
            {logged.at}
          </Text>,
        ]}
      </HStack>
    );
  }

  function undoRow(logged: { id: string; label: string; at: string }) {
    return (
      <Button key="undo" target="undo" onPress={() => undoPatch(logged.id)}>
        <HStack spacing={5} modifiers={[padding({ horizontal: 8 }), frame({ maxWidth: Infinity })]}>
          {[
            <Text
              key="label"
              modifiers={[font({ size: 11, weight: 'medium' }), foregroundStyle(T.textSecondary)]}>
              Undo
            </Text>,
            <Spacer key="spacer" />,
          ]}
        </HStack>
      </Button>
    );
  }

  // One capture tile. The whole tile is the target (D3).
  function tile(
    target: string,
    label: string,
    systemName: Parameters<typeof Image>[0]['systemName'],
    accent: boolean,
    onPress: () => object,
  ) {
    return (
      <Button
        key={target}
        target={target}
        onPress={onPress}
        modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]}>
        <VStack
          spacing={4}
          modifiers={[
            frame({ maxWidth: Infinity, maxHeight: Infinity }),
            background(
              accent ? T.accent : T.surfaceSubtle,
              shapes.roundedRectangle({ cornerRadius: 16 }),
            ),
          ]}>
          {[
            <Image
              key="glyph"
              systemName={systemName}
              size={21}
              color={accent ? T.textPrimary : T.textSecondary}
            />,
            <Text
              key="label"
              modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(T.textPrimary)]}>
              {label}
            </Text>,
            <Text
              key="hint"
              modifiers={[
                font({ size: 9.5 }),
                foregroundStyle(accent ? T.textSecondary : T.textTertiary),
              ]}>
              tap to pick
            </Text>,
          ]}
        </VStack>
      </Button>
    );
  }

  // One one-tap picker row. `accent` marks the lead option.
  function pickerRow(
    target: string,
    label: string,
    hint: string,
    accent: boolean,
    onPress: () => object,
  ) {
    return (
      <Button key={target} target={target} onPress={onPress}>
        <HStack
          spacing={8}
          modifiers={[
            padding({ horizontal: 14, vertical: 9 }),
            background(
              accent ? T.accent : T.surfaceSubtle,
              shapes.roundedRectangle({ cornerRadius: 13 }),
            ),
            frame({ maxWidth: Infinity }),
          ]}>
          {[
            <Text
              key="label"
              modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(T.textPrimary)]}>
              {label}
            </Text>,
            <Spacer key="spacer" />,
            <Text key="hint" modifiers={[font({ size: 10.5 }), foregroundStyle(T.textSecondary)]}>
              {hint}
            </Text>,
          ]}
        </HStack>
      </Button>
    );
  }

  // The app door — always last in every picker, always honest about what it
  // does (Job 2). A Link, not a Button: it opens Culprit rather than writing.
  // Dashed, per the mock's ghost row.
  function appDoorRow() {
    return (
      <Link key="door" destination={petLink('log?type=meal')}>
        <HStack
          spacing={8}
          modifiers={[
            padding({ horizontal: 14, vertical: 9 }),
            strokeBorder({
              color: T.border,
              style: { lineWidth: 1, dash: [4, 3] },
              shape: 'roundedRectangle',
              cornerRadius: 13,
            }),
            frame({ maxWidth: Infinity }),
          ]}>
          {[
            <Text key="label" modifiers={[font({ size: 13 }), foregroundStyle(T.textSecondary)]}>
              Something else…
            </Text>,
            <Spacer key="spacer" />,
            <Text key="hint" modifiers={[font({ size: 10.5 }), foregroundStyle(T.textTertiary)]}>
              opens Culprit
            </Text>,
          ]}
        </HStack>
      </Link>
    );
  }

  function pickerHeader(title: string) {
    return (
      <HStack key="picker-header" spacing={6} modifiers={[frame({ maxWidth: Infinity })]}>
        {[
          mark(),
          <Text
            key="title"
            modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(T.textTertiary)]}>
            {title}
          </Text>,
          <Spacer key="spacer" />,
          <Button
            key="back"
            target="back"
            onPress={() => ({ ui: withUi({ view: 'resting', logged: null }) })}>
            <Text modifiers={[font({ size: 11 }), foregroundStyle(T.textSecondary)]}>‹ back</Text>
          </Button>,
        ]}
      </HStack>
    );
  }

  function shell(children: React.JSX.Element[]) {
    return (
      <VStack
        spacing={7}
        alignment="leading"
        modifiers={[
          frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
          containerBackground(T.surface, 'widget'),
        ]}>
        {children}
      </VStack>
    );
  }

  // ── States ────────────────────────────────────────────────────────────────

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

  // Spec §2.2's "auto-reverts to resting after a short idle", as closely as this
  // platform allows: there is no timer, but every system refresh re-evaluates
  // this function, so an abandoned picker falls back on the next one instead of
  // leaving the Home Screen showing a menu where a status board should be.
  const PICKER_IDLE_MS = 5 * 60 * 1000;
  const abandoned =
    ui.view !== 'resting' &&
    typeof ui.openedAt === 'number' &&
    Date.now() - ui.openedAt > PICKER_IDLE_MS;
  const view = abandoned ? 'resting' : ui.view;

  // A choice already captured this pass must not be offered again: props do not
  // refresh until the app drains, so without this the picker keeps inviting the
  // same dinner and two people on one counter log it twice.
  function pendingCapture(foodItemId: string | null, kind: string) {
    for (const p of props.pending || []) {
      if (p.petId === panel!.petId && p.kind === kind && p.foodItemId === foodItemId) return p;
    }
    return null;
  }

  function alreadyLoggedRow(key: string, label: string, capture: { occurredAt: string }) {
    return (
      <HStack
        key={key}
        spacing={8}
        modifiers={[
          padding({ horizontal: 14, vertical: 9 }),
          background(T.accentLight, shapes.roundedRectangle({ cornerRadius: 13 })),
          frame({ maxWidth: Infinity }),
        ]}>
        {[
          <Text key="label" modifiers={[font({ size: 13 }), foregroundStyle(T.textSecondary)]}>
            {label}
          </Text>,
          <Spacer key="spacer" />,
          <Text key="hint" modifiers={[font({ size: 10.5 }), foregroundStyle(T.textTertiary)]}>
            {'logged ' + clock(new Date(capture.occurredAt))}
          </Text>,
        ]}
      </HStack>
    );
  }

  function pickerEmptyLine(text: string) {
    return (
      <Text key="picker-empty" modifiers={[font({ size: 11.5 }), foregroundStyle(T.textTertiary)]}>
        {text}
      </Text>
    );
  }

  // State 2 — the meal picker. During a trial the lead row's food IS the trial
  // diet (resolved app-side, spec §2.2). A slot with no stable named food never
  // becomes a row here: the no-garbage rule leaves only the app door.
  if (view === 'meal') {
    const rows: React.JSX.Element[] = [pickerHeader('Which meal?')];
    const choices = panel.mealChoices.slice(0, 2);
    for (let i = 0; i < choices.length; i++) {
      const choice = choices[i];
      const already = pendingCapture(choice.foodItemId, 'meal');
      rows.push(
        already
          ? alreadyLoggedRow('done:meal:' + i, choice.label, already)
          : pickerRow(
              'pick:meal:' + i,
              choice.label,
              i === 0 ? 'one tap · logs now' : 'one tap',
              i === 0,
              () => capturePatch('meal', choice.foodItemId, choice.label),
            ),
      );
    }
    // D6: a free-fed component gets its top-up here. The hint is load-bearing —
    // a top-up re-attests the arrangement and is never an intake claim.
    if (panel.bowl) {
      const already = pendingCapture(null, 'bowl_topup');
      rows.push(
        already
          ? alreadyLoggedRow('done:bowl', 'Top up bowl', already)
          : pickerRow('pick:bowl', 'Top up bowl', 'not a meal', false, () =>
              capturePatch('bowl_topup', null, 'Bowl topped up'),
            ),
      );
    }
    // Principle 5: a picker with nothing nameable is still a designed state.
    if (choices.length === 0 && !panel.bowl) {
      rows.push(
        pickerEmptyLine(
          'No usual meal to offer yet — Culprit is still learning ' + panel.petName + '’s routine.',
        ),
      );
    }
    rows.push(appDoorRow());
    rows.push(<Spacer key="fill" />);
    return shell(rows);
  }

  // State 3 — the treat picker. Identical interaction, 2 most-logged treats.
  if (view === 'treat') {
    const rows: React.JSX.Element[] = [pickerHeader('Which treat?')];
    const choices = panel.treatChoices.slice(0, 2);
    for (let i = 0; i < choices.length; i++) {
      const choice = choices[i];
      const already = pendingCapture(choice.foodItemId, 'treat');
      rows.push(
        already
          ? alreadyLoggedRow('done:treat:' + i, choice.label, already)
          : pickerRow('pick:treat:' + i, choice.label, 'one tap', false, () =>
              capturePatch('treat', choice.foodItemId, choice.label),
            ),
      );
    }
    if (choices.length === 0) {
      rows.push(
        pickerEmptyLine('No usual treat yet — log a couple in Culprit and they show up here.'),
      );
    }
    rows.push(appDoorRow());
    rows.push(<Spacer key="fill" />);
    return shell(rows);
  }

  // States 1 + 4 — resting. Status column left, two capture tiles right.
  //
  // The just-logged confirmation sits ABOVE the status rows rather than
  // replacing them, so the ambient half of the widget's job survives a capture.
  // Rows are capped at 3 slots' worth of height either way.
  const rows: React.JSX.Element[] = [];
  if (ui.logged) rows.push(loggedRow(ui.logged));
  const visible = panel.rows.slice(0, ui.logged ? 1 : 3);
  for (let i = 0; i < visible.length; i++) rows.push(statusRow(visible[i], stale, 'row' + i));
  if (panel.rows.length === 0 && !ui.logged) {
    rows.push(
      // Principle 5 / nyx-voice Pattern 1+3: a designed empty state that names
      // the pet and points forward. "About a week" is the honest wait — a slot
      // needs 4 distinct days of a recurring time before it can exist
      // (lib/widgetResolution.ts SLOT_MIN_DAYS).
      <Text key="empty" modifiers={[font({ size: 11.5 }), foregroundStyle(T.textTertiary)]}>
        {'Log meals for about a week and ' + panel.petName + '’s usual times show up here.'}
      </Text>,
    );
  }
  if (ui.logged) rows.push(undoRow(ui.logged));
  rows.push(<Spacer key="fill" />);

  // The status column is glance-only (D3): one Link into that day, never a
  // second hidden way to log. While an undo is on offer the column can't be a
  // Link (the Undo button would sit inside it), so it renders unlinked — the
  // tiles and the day view are both one tap away again as soon as it clears.
  const statusColumn = ui.logged ? (
    <VStack
      key="status"
      spacing={5}
      alignment="leading"
      modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' })]}>
      {rows}
    </VStack>
  ) : (
    <Link key="status" destination={dayLink(renderedDay)}>
      <VStack
        spacing={5}
        alignment="leading"
        modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' })]}>
        {rows}
      </VStack>
    </Link>
  );

  return shell([
    header(panel.petName, stale ? '' : panel.contextLine),
    <HStack key="body" spacing={10} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]}>
      {[
        statusColumn,
        <HStack
          key="tiles"
          spacing={8}
          modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]}>
          {[
            tile('tile:meal', 'Meal', 'fork.knife', true, () => ({
              ui: withUi({ view: 'meal', logged: null, openedAt: Date.now() }),
            })),
            tile('tile:treat', 'Treat', 'pawprint', false, () => ({
              ui: withUi({ view: 'treat', logged: null, openedAt: Date.now() }),
            })),
          ]}
        </HStack>,
      ]}
    </HStack>,
  ]);
}
