// The widget's RENDER CONTRACT and its pure builders (widget PR W5).
//
// ── Why this module exists (the W5 architecture finding, recorded) ───────────
// `expo-widgets` does not run the app's JS in the extension. A widget layout is
// a SINGLE self-contained function, stringified at build time by
// babel-preset-expo's `'widget'` directive, stored in the App Group, and
// evaluated inside the widget extension's own JavaScriptCore context whose only
// globals are `@expo/ui/swift-ui` + its modifiers + a React/JSX shim. That
// context has no module graph, no filesystem, and no network — so the layout
// cannot import anything, and W4's App Intents (lib/widgetCapture.ts, which need
// expo-file-system + fetch) cannot execute there.
//
// The consequence, and the split this module encodes:
//   • Every DECISION is made app-side and shipped to the widget as plain data —
//     this file builds those props from the W3/W4 snapshots.
//   • The layout (widgets/CulpritWidget.tsx) is a renderer plus a state machine
//     over these props. A button press returns a props patch, which the
//     extension merges into the persisted timeline entry (see the OUTBOX below).
//   • The app drains the outbox back through the shipped W4 intents
//     (lib/widgetBridge.ts), so the write path, its ids, and its idempotency are
//     exactly the ones W3/W4 built and reviewed.
//
// ── The outbox ───────────────────────────────────────────────────────────────
// A tap cannot write a file from the extension's JS context, so the capture is
// appended to `pending` in the widget's own props; WidgetKit's interaction
// intent persists that patch into the App Group before reloading the widget.
// The app drains `pending` on foreground, on each sync tick, and on the
// interaction event. The ids are generated AT TAP TIME in the widget and travel
// through unchanged, so the whole chain keeps W3's id-keyed idempotency: a
// double drain re-writes the same row ids and `INSERT OR IGNORE` absorbs it.
//
// Safety invariants carried by construction (spec §8 / D9), same posture as the
// snapshot contract: no field here can hold Signal/AI copy, reassurance, praise,
// or monetization state; a status row's "logged" state exists only as an
// explicit `done` boolean derived from a real logged meal, never from time
// passing (B-156 G1 generalized).

import type { PetSlotIndex } from './widgetResolution';
import type { WidgetSnapshot } from './widgetSnapshot';

/** Must match the widget `name` in app.json's expo-widgets plugin config. */
export const WIDGET_NAME = 'CulpritWidget';

/** Bumped when the props shape changes incompatibly (the layout reads it). */
export const WIDGET_PROPS_SCHEMA_VERSION = 1;

/** The deep-link scheme (app.json `expo.scheme`). */
export const WIDGET_LINK_SCHEME = 'nyx';

/**
 * The D5 pet-slot enum case for a 1-based slot — the exact string the
 * `petSlot` configuration parameter delivers in `environment.configuration`
 * (app.json's enum `value`s are `slot1`…`slot6`).
 */
export function slotKeyFor(slot: number): string {
  return `slot${slot}`;
}

/** One status-column row — ambient, glance-only (D3). */
export interface WidgetStatusRow {
  /** 'Breakfast' | 'Dinner' | 'Bowl' … */
  label: string;
  /** A real logged meal claimed this slot today. Never inferred from the clock. */
  done: boolean;
  /** '7:42a' — the time it was logged. '' when the row is not done. */
  when: string;
  /**
   * '~6p' | 'free-fed' — what to show when the row is NOT done, and what a
   * day-stale render falls back to. Kept separate from `when` so the staleness
   * guard can drop a tick and its clock time together, without inventing a
   * blank row (§4.1 Q3).
   */
  expected: string;
  /**
   * True for the free-fed bowl row: an ambient standing fact, not a task. The
   * widget renders it with a distinct, non-tick mark so an un-topped bowl can
   * never read as an unmet obligation and a top-up can never read as a fed-✓ —
   * grazing intake is unmeasured, and the row must not imply otherwise.
   */
  ambient: boolean;
}

/** One one-tap named choice in a picker (D2 — a choice always names its item). */
export interface WidgetChoiceRow {
  label: string;
  foodItemId: string;
  /** 'Top up bowl' is an arrangement re-attest, never a named food. */
  kind: 'meal' | 'treat';
}

/** Everything one bound pet's widget renders. */
export interface WidgetPetPanel {
  slot: number;
  petId: string;
  petName: string;
  /** false = tombstoned slot (the pet left the account) — D5's visible state. */
  active: boolean;
  /** The device-local day the row states describe (staleness guard, §4.1 Q3). */
  dayKey: string;
  /** 'Day 12 of 28' | 'free-fed + meals' | 'free-fed' | '' */
  contextLine: string;
  rows: WidgetStatusRow[];
  mealChoices: WidgetChoiceRow[];
  treatChoices: WidgetChoiceRow[];
  /** An active free-choice arrangement exists → the meal picker offers a top-up. */
  bowl: boolean;
}

/** A tap captured on the Home Screen, waiting for the app to drain it. */
export interface WidgetPendingCapture {
  /** The events row id — generated at tap time, canonical through the chain. */
  id: string;
  /** The meals row id; null for a bowl top-up (it inserts no rows). */
  mealId: string | null;
  kind: 'meal' | 'treat' | 'bowl_topup';
  petId: string;
  /** null only for a bowl top-up (the no-garbage rule holds — see captureRecord). */
  foodItemId: string | null;
  /** Tap time, ISO UTC. */
  occurredAt: string;
  /** Display only (the undo strip). Never written to any row. */
  label: string;
}

/** Widget-local UI state, per pet slot. */
export interface WidgetSlotUi {
  view: 'resting' | 'meal' | 'treat';
  /**
   * Epoch ms when a picker was opened. The widget has no timer, but every
   * system refresh re-evaluates the layout — so comparing this against the
   * evaluation clock lets an abandoned picker fall back to resting on the next
   * refresh instead of leaving the Home Screen showing a menu (spec §2.2's
   * "auto-reverts after a short idle", as closely as this platform allows).
   */
  openedAt?: number;
  /**
   * The just-captured tap this slot is offering to undo, or null. `at` is the
   * tap's own clock time ('7:42a'): the strip has no guaranteed re-render, so
   * it names the minute rather than claiming "just now" hours later.
   */
  logged: { id: string; label: string; at: string } | null;
}

export interface CulpritWidgetProps {
  schemaVersion: number;
  /** Panels by slot key. A missing key = nothing bound to that slot. */
  pets: Record<string, WidgetPetPanel>;
  /** false = signed out; the widget renders the sign-in door, never pet data. */
  signedIn: boolean;
  /** Per-slot view state — written only by button presses. */
  ui: Record<string, WidgetSlotUi>;
  /** The outbox (see module header). */
  pending: WidgetPendingCapture[];
  /** Capture ids the owner undid. Honored pre-drain AND post-drain. */
  revoked: string[];
}

// '7:42a' / '6p' — the mock's compact clock. Device-local on purpose: the widget
// renders on the same device the meal was logged from, and the owner reads it
// against the kitchen clock.
export function formatClock(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const d = new Date(ms);
  const h24 = d.getHours();
  const mm = d.getMinutes();
  const suffix = h24 < 12 ? 'a' : 'p';
  const h12 = ((h24 + 11) % 12) + 1;
  return mm === 0 ? `${h12}${suffix}` : `${h12}:${String(mm).padStart(2, '0')}${suffix}`;
}

// The header's right-aligned context line (§2.1). A trial wins — it is the
// wedge user's own countdown; otherwise the arrangement shape, or nothing.
export function contextLineFor(snapshot: WidgetSnapshot): string {
  if (snapshot.trialDay !== null && snapshot.trialTargetDays !== null) {
    return `Day ${snapshot.trialDay} of ${snapshot.trialTargetDays}`;
  }
  if (snapshot.trialDay !== null) return `Day ${snapshot.trialDay}`;
  if (snapshot.freeFed) return snapshot.slots.length > 0 ? 'free-fed + meals' : 'free-fed';
  return '';
}

// The status column (§2.1). Slot rows first (time order, as the resolution lib
// returns them), then the bowl row for a free-fed component — the hybrid pet's
// two row types coexisting, exactly as D6 requires.
//
// The bowl row is deliberately NOT a slot: grazing intake is unmeasured, so it
// can never carry a "logged/unlogged" verdict. It shows a ✓ only when the
// arrangement was re-attested TODAY (a real, dated fact); otherwise it renders
// as an ambient 'free-fed' row with no tick and no expectation.
export function buildStatusRows(snapshot: WidgetSnapshot): WidgetStatusRow[] {
  const rows: WidgetStatusRow[] = snapshot.slots.map((slot) => ({
    label: slot.label,
    done: slot.loggedAt !== null,
    when: slot.loggedAt ? formatClock(slot.loggedAt) : '',
    expected: slot.expectedWindow ?? '',
    ambient: false,
  }));
  if (snapshot.freeFed) {
    const toppedToday =
      snapshot.bowlConfirmedAt !== null &&
      !Number.isNaN(Date.parse(snapshot.bowlConfirmedAt)) &&
      localDayKeyOf(new Date(Date.parse(snapshot.bowlConfirmedAt))) === snapshot.dayKey;
    rows.push({
      label: 'Bowl',
      done: toppedToday,
      when: toppedToday ? `topped ${formatClock(snapshot.bowlConfirmedAt!)}` : '',
      expected: 'free-fed',
      ambient: true,
    });
  }
  return rows;
}

// 'YYYY-MM-DD' for a Date in device-local time. (lib/utils' toLocalDayKey twin,
// re-stated here so this module stays importable from the pure test path.)
function localDayKeyOf(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// One pet's panel. Everything comes from the snapshot the app already
// publishes — this function adds no facts, it only shapes them for the layout.
export function buildPetPanel(
  slot: number,
  active: boolean,
  petName: string,
  snapshot: WidgetSnapshot,
): WidgetPetPanel {
  return {
    slot,
    petId: snapshot.petId,
    petName,
    active,
    dayKey: snapshot.dayKey,
    contextLine: contextLineFor(snapshot),
    rows: buildStatusRows(snapshot),
    mealChoices: snapshot.mealChoices.map((c) => ({
      label: c.label,
      foodItemId: c.foodItemId,
      kind: 'meal' as const,
    })),
    treatChoices: snapshot.treatChoices.map((c) => ({
      label: c.label,
      foodItemId: c.foodItemId,
      kind: 'treat' as const,
    })),
    bowl: snapshot.freeFed,
  };
}

// The whole props payload. ONE timeline serves every placed instance of the
// widget kind, so the payload carries every bound slot and the layout picks its
// own by `environment.configuration.petSlot` — that is what makes two widgets
// on one Home Screen render (and write to) two different pets, independently of
// the in-app active pet (AC §5.5).
//
// A tombstoned slot (the pet left the account) is carried with `active: false`
// and NO snapshot data — the publisher already pruned that pet's snapshot file,
// and the widget renders the "no longer here" door rather than silently
// re-pointing to whoever now holds the slot (the B-086 hidden-switch hazard).
export function buildWidgetProps(input: {
  index: PetSlotIndex | null;
  snapshots: WidgetSnapshot[];
  signedIn: boolean;
}): CulpritWidgetProps {
  const bySnapshotPet = new Map(input.snapshots.map((s) => [s.petId, s]));
  const pets: Record<string, WidgetPetPanel> = {};
  for (const entry of input.index?.assignments ?? []) {
    const snapshot = bySnapshotPet.get(entry.petId);
    if (snapshot && entry.active) {
      pets[slotKeyFor(entry.slot)] = buildPetPanel(entry.slot, true, entry.petName, snapshot);
      continue;
    }
    pets[slotKeyFor(entry.slot)] = {
      slot: entry.slot,
      petId: entry.petId,
      petName: entry.petName,
      active: false,
      dayKey: '',
      contextLine: '',
      rows: [],
      mealChoices: [],
      treatChoices: [],
      bowl: false,
    };
  }
  return {
    schemaVersion: WIDGET_PROPS_SCHEMA_VERSION,
    pets,
    signedIn: input.signedIn,
    ui: {},
    pending: [],
    revoked: [],
  };
}

/** A timeline entry as `Widget.updateTimeline` takes it. */
export interface WidgetTimelinePlan {
  date: Date;
  props: CulpritWidgetProps;
}

// Two entries: now, and the next device-local midnight (§4.1 Q3). The midnight
// entry carries the SAME props on purpose — the layout's own staleness rule
// (panel.dayKey vs the entry date's local day) turns yesterday's ticks into
// honest gaps, so the "never carry a ✓ across the rollover" guarantee lives in
// exactly one place instead of being duplicated into a second props payload.
//
// WidgetKit's `.atEnd` policy re-requests a timeline once the last entry is
// past; the provider re-reads the same stored entries, so an app that never
// runs again keeps rendering gaps rather than stale ticks. Honest by default.
export function buildWidgetTimeline(
  props: CulpritWidgetProps,
  now: Date = new Date(),
): WidgetTimelinePlan[] {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return [
    { date: now, props },
    { date: midnight, props },
  ];
}

// Collect the outbox across every timeline entry (a press merges into whichever
// entry was on screen). Deduped by capture id — the same tap can appear in more
// than one entry only if the timeline was rebuilt mid-flight, and applying it
// twice must be impossible even before the id-keyed DB idempotency catches it.
export function collectOutbox(
  entries: { props: Partial<CulpritWidgetProps> }[],
): { pending: WidgetPendingCapture[]; revoked: string[] } {
  const pending = new Map<string, WidgetPendingCapture>();
  const revoked = new Set<string>();
  for (const entry of entries) {
    for (const capture of entry.props?.pending ?? []) {
      if (capture && typeof capture.id === 'string' && !pending.has(capture.id)) {
        pending.set(capture.id, capture);
      }
    }
    for (const id of entry.props?.revoked ?? []) {
      if (typeof id === 'string') revoked.add(id);
    }
  }
  return { pending: [...pending.values()], revoked: [...revoked] };
}
