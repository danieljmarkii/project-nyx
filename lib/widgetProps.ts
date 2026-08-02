// The widget's RENDER CONTRACT and its pure builders (Widget V2, PR 2).
//
// ── What changed at v2 (the informational rebuild, B-664) ────────────────────
// v1 was a CAPTURE widget: a tap returned a props patch, the extension merged it
// into an outbox (`pending`/`revoked`), and the app drained it back through the
// W4 intents. V2-1 retired capture entirely — the widget now ANSWERS
// "what's been logged today?" and is the fastest door back into Culprit, and
// every interactive element is a `Link`, never a write. So this contract holds
// FACTS, not an outbox: per-pet tiles, a ground band, and a header — all decided
// app-side and rendered widget-side (the W5 architecture split, unchanged).
//
// ── The W5 architecture split (unchanged, still load-bearing) ────────────────
// `expo-widgets` does not run the app's JS in the extension. The layout
// (widgets/CulpritWidget.tsx) is a SINGLE self-contained function, stringified at
// build time by babel-preset-expo's `'widget'` directive, stored in the App
// Group, and evaluated inside the extension's own JavaScriptCore context — no
// module graph, no filesystem, no network. So the layout cannot import anything:
// every DISPLAY STRING it renders is precomputed HERE (which CAN import helpers)
// and shipped as plain data. The layout maps a tile's `kind` to a glyph + colour
// and places it; it composes no facts.
//
// Safety invariants carried BY CONSTRUCTION (spec §8 / D9), same posture as the
// snapshot contract: no field here can hold Signal/AI copy, reassurance, praise,
// or monetization state — a widget cannot render what the contract cannot
// express. A tile exists only where the class carries a logged fact today; a
// missing tile is never a claim (a filled mark exists only where a logged row
// does, B-156 G1 generalized); the pips and trial strip are COVERAGE, never
// wellness; med display is confirmation-register only.

import type { PetSlotIndex } from './widgetResolution';
import type { WidgetSnapshot } from './widgetSnapshot';
import type {
  WidgetClassFacts,
  WidgetMedFacts,
  WidgetSymptomFacts,
  WidgetTrialSnapshot,
} from './widgetSnapshotV2';

/** Must match the widget `name` in app.json's expo-widgets plugin config. */
export const WIDGET_NAME = 'CulpritWidget';

/**
 * Bumped when the props shape changes incompatibly (the layout reads it and
 * renders the sign-in door on a mismatch, §3 — never garbage). v1 = the capture
 * widget; v2 = the informational rebuild.
 */
export const WIDGET_PROPS_SCHEMA_VERSION = 2;

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

// ── The tile (§2.3) ───────────────────────────────────────────────────────────

/** A grid tile's class — selects the glyph + background in the layout. The four
 *  record classes plus the two derived tiles (the look-ahead, the trial record).
 *  The layout renders exactly these; there is no `other` tile. */
export type WidgetTileKind = 'symptom' | 'meal' | 'med' | 'treat' | 'upNext' | 'trialRecord';

/** One fact tile, strings precomputed (the layout has no formatter at runtime).
 *  `value` is the bold run and `unit` the lighter run of the value line; `sub` is
 *  the one name/detail sub-line. Any of `unit`/`sub` may be '' (a tile with no
 *  sub renders two lines, not three). */
export interface WidgetTile {
  kind: WidgetTileKind;
  /** Small-caps label ("Meals", "Vomiting", "Meds", "Treats", "Trial record"). */
  label: string;
  /** The bold value run ("1", "×2", "12"). */
  value: string;
  /** The lighter unit run ("· 7:42a", "of 2 today", "of 12 days"), or ''. */
  unit: string;
  /** The name / detail sub-line ("Hill's z/d", "2:14p · 4:40p"), or ''. */
  sub: string;
}

/** The Up-next look-ahead (§2.4). Carried as its two facts rather than a full
 *  tile because the sub differs by state: the resting grid appends
 *  "· not logged yet", the empty-day grid does not (the headline already says
 *  it). The layout composes the sub; the tone rule (§2.4) is that neither form
 *  ever gains urgency. */
export interface WidgetUpNext {
  /** The slot name ("Dinner", "Wet dinner"). */
  label: string;
  /** The learned window, pre-formatted ("~5p") by the resolution lib. */
  approxTime: string;
}

// ── The ground band (§2.5) ────────────────────────────────────────────────────

/** The trial-day strip: one dot per elapsed trial day (most-recent ≤14),
 *  filled = a covered day, `todayDotIndex` the accented current day. Caption
 *  totals the WHOLE trial (§2.5) — coverage language only, never an outcome. */
export interface WidgetTrialBand {
  type: 'trial';
  dots: { logged: boolean }[];
  /** Index into `dots` of the current trial day, or -1 (today outside the shown
   *  window — only when the strip was capped and today somehow fell off, which
   *  cannot happen for a running trial but is handled rather than assumed). */
  todayDotIndex: number;
  caption: string;
}

/** The 7-day coverage pips: per local day a tick (≥1 event) + a rose pip (≥1
 *  symptom), oldest→today. The last entry is today (the layout outlines it).
 *  Coverage ≠ wellness (§2.5). */
export interface WidgetPipsBand {
  type: 'pips';
  days: { logged: boolean; symptomLogged: boolean }[];
  caption: string;
}

/** The band's coverage content, or null → the band shows only the Log chip (a
 *  stale render carries no ticks across midnight, §2.6.5; a running trial whose
 *  coverage could not be read degrades here rather than to a wrong strip). */
export type WidgetBand = WidgetTrialBand | WidgetPipsBand | null;

// ── The panel ────────────────────────────────────────────────────────────────

/** Everything one bound pet's widget renders. Populated only for an ACTIVE pet;
 *  a tombstoned slot carries `active: false` and empty facts (the layout renders
 *  the "no longer here" door). */
export interface WidgetPetPanel {
  slot: number;
  petId: string;
  petName: string;
  /** false = tombstoned slot (the pet left the account) — D5's visible state. */
  active: boolean;
  /** The device-local day the facts describe ('YYYY-MM-DD'). The layout's
   *  staleness guard (§2.6.5): a render on a later local day shows the empty day,
   *  carrying no tile, count or context line across the rollover. */
  dayKey: string;
  /** 'Day 12 of 28' | 'Day 61 · 5d past' | 'free-fed + meals' | 'free-fed' | '' */
  contextLine: string;
  /** The present class tiles (symptom→meal→med→treat, priority order, §2.3). A
   *  class with nothing logged today contributes no tile. */
  classTiles: WidgetTile[];
  /** The learned-window look-ahead, or null (§2.4 presence rule, resolved app-side). */
  upNext: WidgetUpNext | null;
  /** The trial-record tile (§2.3 ⑥), or null when there is no running trial. */
  trialRecord: WidgetTile | null;
  /** True when ≥1 event was logged today in ANY class — gates the empty-day state
   *  (a class-tile-less pet with a trial still shows the resting layout, not the
   *  empty headline, so its band renders). */
  hasTodayEvents: boolean;
  band: WidgetBand;
}

export interface CulpritWidgetProps {
  schemaVersion: number;
  /** Panels by slot key. A missing key = nothing bound to that slot. */
  pets: Record<string, WidgetPetPanel>;
  /** false = signed out; the widget renders the sign-in door, never pet data. */
  signedIn: boolean;
}

// ── v1 residual-outbox drain (the §3 one-time upgrade path only) ──────────────
//
// v2 props carry no outbox. But a build-35 user upgrading to v2 may have an
// un-drained v1 capture sitting in the stored timeline, and dropping it would
// lose a meal the owner logged. So the app drains the OLD timeline once, before
// its first v2 publish (lib/widgetBridge.drainResidualV1Outbox). These two are
// that path's contract — the shape v1 wrote — kept here so the drain reads the
// same definition it was written against. They are NOT part of CulpritWidgetProps.

/** A tap captured on a v1 Home Screen, waiting for the app to drain it. */
export interface WidgetPendingCapture {
  /** The events row id — generated at tap time, canonical through the chain. */
  id: string;
  /** The meals row id; null for a bowl top-up (it inserts no rows). */
  mealId: string | null;
  kind: 'meal' | 'treat' | 'bowl_topup';
  petId: string;
  /** null only for a bowl top-up (the no-garbage rule held — see captureRecord). */
  foodItemId: string | null;
  /** Tap time, ISO UTC. */
  occurredAt: string;
  /** Display only (the undo strip). Never written to any row. */
  label: string;
}

/** The two v1 outbox fields, as they appeared on a v1 timeline entry's props. */
export interface V1OutboxProps {
  pending?: WidgetPendingCapture[];
  revoked?: string[];
}

// '7:42a' / '6p' — the compact clock the tiles' recency runs render. Device-local
// on purpose: the widget renders on the same device the event was logged from,
// and the owner reads it against the kitchen clock.
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

// The header's right-aligned context line (§2.2). A trial wins — it is the wedge
// user's own countdown; otherwise the arrangement shape, or nothing. Unchanged
// from v1 (including the overrun rule), because this string and the trial card's
// are read by the same owner about the same trial and may not disagree.
export function contextLineFor(snapshot: WidgetSnapshot): string {
  if (snapshot.trialDay !== null && snapshot.trialTargetDays !== null) {
    // Past the window, `Day 61 of 56` is a contradiction, and with most trials
    // never formally completed, stale-active is the STEADY state. Same rule as the
    // trial card's state 6 (`lib/dietTrialCard.ts`), phrased for the widget's
    // narrower column.
    const past = snapshot.trialDay - snapshot.trialTargetDays;
    if (past > 0) return `Day ${snapshot.trialDay} · ${past}d past`;
    return `Day ${snapshot.trialDay} of ${snapshot.trialTargetDays}`;
  }
  if (snapshot.trialDay !== null) return `Day ${snapshot.trialDay}`;
  if (snapshot.freeFed) return snapshot.slots.length > 0 ? 'free-fed + meals' : 'free-fed';
  return '';
}

// ── Tile builders (pure; every string precomputed for the layout) ─────────────

// A meal or treat tile: "N · time" (1 event) / "N · last time" (2+), sub = the
// distinct food names it can name. A count over an unnamed food still counts;
// it just contributes no sub-line.
function feedingTile(kind: 'meal' | 'treat', label: string, f: WidgetClassFacts): WidgetTile | null {
  if (f.count <= 0) return null;
  const clock = f.lastAt ? formatClock(f.lastAt) : '';
  const unit = clock ? (f.count === 1 ? `· ${clock}` : `· last ${clock}`) : '';
  const names = distinct(f.names).slice(0, 2);
  return { kind, label, value: `${f.count}`, unit, sub: names.join(', ') };
}

// The med tile — confirmation register (§2.3, B-614). A denominator renders ONLY
// when the cadence is known (`expectedToday` non-null, resolved upstream from the
// med-strip cadence field); otherwise count + recency. Never "missed"/"due"
// (the grep gate pins this on the emitted strings).
function medTile(f: WidgetMedFacts): WidgetTile | null {
  if (f.count <= 0) return null;
  const drug = f.names[0] ?? 'Medication';
  if (f.expectedToday != null) {
    // Cadence known: "N of M today", sub names the drug + its dose times (ascending).
    const times = f.times.slice(0, 2).map(formatClock).filter(Boolean).reverse();
    return {
      kind: 'med',
      label: 'Meds',
      value: `${f.count}`,
      unit: `of ${f.expectedToday} today`,
      sub: [drug, ...times].join(' · '),
    };
  }
  // Cadence unknown: "N · time" (§2.7). This branch is reached when the pet may
  // have MORE than one med (2+ regimens, a regimen + an ad-hoc dose), so `value`
  // aggregates across meds — and the sub must NOT name a single drug as if it
  // accounted for the whole count (the N2 cross-med fabrication the denominator
  // guards against, applied to the name). Join the distinct drug identities, like
  // the meal tile; a single drug dosed twice still reads as one name.
  const clock = f.lastAt ? formatClock(f.lastAt) : '';
  const unit = clock ? (f.count === 1 ? `· ${clock}` : `· last ${clock}`) : '';
  return { kind: 'med', label: 'Meds', value: `${f.count}`, unit, sub: distinct(f.names).slice(0, 2).join(', ') };
}

// The symptom tile — always first, always rendered when ≥1 symptom is logged
// (§2.3 ①, Principle 3). One type → the type is the label; multiple distinct
// types → the **highest-count** type leads (ties → most recent), the total in the
// sub. Leading by COUNT, not recency, is the safety call: this is the tile whose
// whole job is the safety lead, and a day of "vomiting ×2 + one itch" must not
// bury the vomiting under the more-recent itch (pm-feature-review; §2.3 left the
// tie-break as a build-detail). Naming symptoms on the widget is in scope (V2-3,
// post-unlock Home Screen). PROVISIONAL — flagged for PM confirm over recency.
function symptomTile(s: WidgetSymptomFacts): WidgetTile | null {
  if (s.count <= 0) return null;
  const lastClock = s.lastAt ? formatClock(s.lastAt) : '';
  const unit = lastClock ? `· last ${lastClock}` : '';
  // `distinct` preserves most-recent-first order (names are recency-sorted), so it
  // is also the tie-break: the first-seen (most recent) type wins an equal count.
  const types = distinct(s.names);
  if (types.length <= 1) {
    // One type: "Vomiting ×2 · last 4:40p", sub = the recent times (ascending).
    // `types[0]` (never `leadingType`) so a null leadingType can never render a
    // bare "Symptom ×0" — the label is always a real logged type.
    const label = types[0] ?? s.leadingType ?? 'Symptom';
    const times = s.times.slice(0, 2).map(formatClock).filter(Boolean).reverse();
    return { kind: 'symptom', label, value: `×${s.count}`, unit, sub: times.join(' · ') };
  }
  // Mixed: the highest-count type leads (ties → most recent), the total in the sub.
  let leadType = types[0];
  let leadCount = 0;
  for (const t of types) {
    const c = s.names.filter((n) => n === t).length;
    if (c > leadCount) {
      leadCount = c;
      leadType = t;
    }
  }
  return { kind: 'symptom', label: leadType, value: `×${leadCount}`, unit, sub: `${s.count} symptoms today` };
}

// The trial-record tile (§2.3 ⑥) — a record fact, never praise. Value = days
// logged of days elapsed; the sub states the record, never scores it.
function trialRecordTile(trial: WidgetTrialSnapshot): WidgetTile {
  const complete = trial.daysLogged >= trial.daysElapsed && trial.daysElapsed > 0;
  return {
    kind: 'trialRecord',
    label: 'Trial record',
    value: `${trial.daysLogged}`,
    unit: `of ${trial.daysElapsed} days`,
    sub: complete ? 'every day logged so far' : 'record of the trial so far',
  };
}

/** De-dupe preserving first-seen order; drops blanks. */
function distinct(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

// ── The band builder ──────────────────────────────────────────────────────────

/** The ground band from the v2 block: the trial strip while a trial runs, else
 *  the 7-day pips, else null (the Log-chip-only band). The trial numbers all come
 *  from the shared lib (`buildTrialSnapshot`), so the strip and the trial card
 *  cannot disagree (AC 5). */
function buildBand(snapshot: WidgetSnapshot): WidgetBand {
  const trial = snapshot.trial;
  if (trial) {
    // Cap the dots at the most recent 14 (§2.5); the caption always totals the
    // whole trial. The last elapsed day is today for a running trial, so the last
    // shown dot is today's.
    const MAX_DOTS = 14;
    const dots = trial.stripDays.slice(-MAX_DOTS).map((d) => ({ logged: d.logged }));
    return {
      type: 'trial',
      dots,
      todayDotIndex: dots.length - 1,
      caption: `${trial.daysLogged} of ${trial.daysElapsed} trial days logged`,
    };
  }
  const seven = snapshot.sevenDays;
  if (seven && seven.length > 0) {
    return {
      type: 'pips',
      days: seven.map((d) => ({ logged: d.logged, symptomLogged: d.symptomLogged })),
      caption: 'last 7 days',
    };
  }
  return null;
}

// One pet's panel. Everything comes from the snapshot the app already publishes —
// this shapes the v2 block into render-ready tiles + band; it adds no facts.
export function buildPetPanel(
  slot: number,
  active: boolean,
  petName: string,
  snapshot: WidgetSnapshot,
): WidgetPetPanel {
  const today = snapshot.todayByClass;
  const classTiles: WidgetTile[] = [];
  if (today) {
    // Priority order (§2.3): symptom first and never dropped, then meal, med, treat.
    const s = symptomTile(today.symptoms);
    if (s) classTiles.push(s);
    const m = feedingTile('meal', 'Meals', today.meals);
    if (m) classTiles.push(m);
    const d = medTile(today.meds);
    if (d) classTiles.push(d);
    const t = feedingTile('treat', 'Treats', today.treats);
    if (t) classTiles.push(t);
  }

  const upNext: WidgetUpNext | null = snapshot.upNext
    ? { label: snapshot.upNext.label, approxTime: snapshot.upNext.approxTime }
    : null;

  const trialRecord = snapshot.trial ? trialRecordTile(snapshot.trial) : null;

  const hasTodayEvents = today
    ? today.meals.count + today.treats.count + today.meds.count + today.symptoms.count > 0
    : false;

  return {
    slot,
    petId: snapshot.petId,
    petName,
    active,
    dayKey: snapshot.dayKey,
    contextLine: contextLineFor(snapshot),
    classTiles,
    upNext,
    trialRecord,
    hasTodayEvents,
    band: buildBand(snapshot),
  };
}

// The whole props payload. ONE timeline serves every placed instance of the
// widget kind, so the payload carries every bound slot and the layout picks its
// own by `environment.configuration.petSlot` — that is what makes two widgets on
// one Home Screen render two different pets, independently of the in-app active
// pet (AC 7 / D5).
//
// A tombstoned slot (the pet left the account) is carried with `active: false`
// and NO facts — the publisher already pruned that pet's snapshot file, and the
// widget renders the "no longer here" door rather than silently re-pointing to
// whoever now holds the slot (the B-086 hidden-switch hazard).
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
      classTiles: [],
      upNext: null,
      trialRecord: null,
      hasTodayEvents: false,
      band: null,
    };
  }
  return {
    schemaVersion: WIDGET_PROPS_SCHEMA_VERSION,
    pets,
    signedIn: input.signedIn,
  };
}

/** A timeline entry as `Widget.updateTimeline` takes it. */
export interface WidgetTimelinePlan {
  date: Date;
  props: CulpritWidgetProps;
}

// Two entries: now, and the next device-local midnight (§2.6.5). The midnight
// entry carries the SAME props on purpose — the layout's own staleness rule
// (panel.dayKey vs the entry date's local day) turns yesterday's facts into an
// honest empty day, so the "never carry a count across the rollover" guarantee
// lives in exactly one place instead of being duplicated into a second payload.
//
// WidgetKit's `.atEnd` policy re-requests a timeline once the last entry is past;
// the provider re-reads the same stored entries, so an app that never runs again
// keeps rendering the empty day rather than stale facts. Honest by default.
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

// Collect the v1 residual outbox across every stored timeline entry (the §3
// one-time upgrade drain). Deduped by capture id. Reads the v1 shape off entries
// whose props predate the schema flip — the v2 payload carries no outbox, so this
// only ever finds anything on the FIRST launch after a build-35 → v2 upgrade.
export function collectOutbox(
  entries: { props?: V1OutboxProps }[],
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
