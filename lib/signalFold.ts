// The Signal fold store (CUL-784 · `docs/nyx-signal-fold-requirements.md` §5).
//
// A fold is a fact about a READER, not about the record: "I have read this card." It
// removes nothing, re-orders nothing, and is never read as an all-clear (FS-1). What this
// module holds is the reader's memory of what they have seen, and the one rule that
// decides when the record overrides that memory — a MATERIAL change in the finding
// (§5.3), judged on the device from the cached payload (DF-4), never by a clock (DF-5).
//
// PURE CORE + ASYNCSTORAGE SHELL (the `lib/signalArrival` / `lib/dailyRecapOffer` split):
// `foldIdentity`, `foldFingerprint`, `materialChange` and `reconcileFolds` are pure and
// unit-tested with no I/O; the shell reads once per pet, writes on fold / touch /
// release, and carries the clear-epoch guard the arrival marker ships.
//
// ONE KEY, NOT A KEY PER PET — for the wipe, not the write. A per-pet key prefix makes
// the sign-out wipe a `getAllKeys()` scan-and-filter, and a wipe that scans is a wipe
// that can miss. One key is one `removeItem`, asserted by name in `lib/session.test.ts`
// (DF-6 / B-402 / FR-9). The blob shape makes every write a read-modify-write, which is
// what the clear epoch below pays for.
//
// DEVICE-LOCAL, NOT SYNCED (DF-6 / FS-10). The spouse's phone folds independently; a
// reinstall may un-fold (the harmless direction); nothing here reaches the vet report or
// the engine. An "acknowledged" that ever reaches anything clinical is F4's own schema,
// never inferred from a fold.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { InsightType, SignalFinding } from './signal';
import { proteinCluster } from './signalCopy';

export const SIGNAL_FOLD_STORAGE_KEY = 'nyx.signalFold';

// ── Types (§5.1) ──────────────────────────────────────────────────────────────

/** Why a folded card came back — the key into `backBecauseCopy` (§4). Never a verdict. */
export type BackBecauseReason =
  | 'new_episode'
  | 'new_week'
  | 'tier_established'
  | 'ask_changed'
  | 'trial_counts'
  | 'intake_day'
  | 'photo_record'
  | 'timing_changed';

/** The material fields of a finding, flattened by dotted path (`bandCounts.rapid`), plus
 *  `type`. Absent payload fields are stored as `null`, so an old cached row and a new one
 *  compare field by field rather than by shape. */
export type FoldFingerprint = Record<string, string | number | boolean | null>;

export type FoldEntry =
  | { state: 'folded'; fingerprint: FoldFingerprint; foldedAtIso: string }
  // A released fold: the face renders the Back-because line until the owner's next touch
  // of that card or the next fingerprint change (§5.3 release rule 2). The fingerprint at
  // release time is kept so "the next fingerprint change" is decidable.
  | { state: 'reopened'; reason: BackBecauseReason; fingerprint: FoldFingerprint; atIso: string };

/** One pet's entries, keyed by `foldIdentity`. */
export type PetFoldEntries = Record<string, FoldEntry>;
/** The persisted blob: `{ [petId]: PetFoldEntries }`. */
export type FoldStore = Record<string, PetFoldEntries>;

// ── The class gate (DF-2) ────────────────────────────────────────────────────

/**
 * CUL-785 brief A — whether `intake_decline` may fold on this build. HELD CLOSED, provisionally.
 *
 * DF-2 ruled that the acute cards fold "bounded by the record: their material fields move
 * daily, so an acute fold lasts one regen cycle". For the red flag that bound holds (a newer
 * flagged photo moves `mostRecentFlaggedIso`). For intake decline it does NOT: the shipped
 * `detectIntakeDecline` walks exactly `consecutiveDays` days, so `daysBelowBaseline` is a
 * constant (1 for a cat, 2 for a dog) and 0 on a refusal — a folded "not eating" strip would
 * stay folded for as long as the decline continued, with no clock allowed to re-open it
 * (DF-5). Until the engine emits a field that moves with each day of the decline, the safe
 * default is the one Dr. Chen's dissent asked for: the card stays open. The strip copy, the
 * ask and the tests are built and pinned, so the flip is this one line once the PM ratifies
 * it or the engine change lands.
 */
export const INTAKE_DECLINE_FOLDS = false;

/**
 * Which findings may be folded on THIS build. Every safety type folds (DF-2, PM-ruled
 * 2026-09-03 — the standing class AND the acute class), with the one provisional hold above.
 * One place, so the control, the store and the strip can never disagree about the class
 * line; the strip's ask is guarded separately (FS-3, `signalCopy.strip.test.ts`).
 */
export function canFold(finding: SignalFinding): boolean {
  // CUL-786: a stood-down marker is a line, not a card — nothing to fold, no control.
  if (finding.type === 'stood_down') return false;
  if (finding.type === 'intake_decline') return INTAKE_DECLINE_FOLDS;
  return true;
}

// ── Identity (§5.2) — the finding key, never `rank` ───────────────────────────

/**
 * `type` + the noun the sentence is about. Rank is presentation and moves as findings
 * come and go; the key must survive a re-rank so a fold follows its finding. A lone
 * `postprandial_timing` that becomes a `timing_story` is a NEW identity and renders open
 * — correct: the card's shape changed.
 */
export function foldIdentity(finding: SignalFinding): string {
  switch (finding.type) {
    case 'food_symptom_correlation':
      // The cluster, sorted — a member joining is a new key (a new identity, §5.3).
      return `${finding.type}:${[...proteinCluster(finding)].sort().join('+')}`;
    case 'incident_red_flag':
      // A fold on a vomit flag never covers a later stool flag.
      return `${finding.type}:${finding.incidentType}`;
    case 'trial_response':
    case 'intake_decline':
      // One per pet.
      return finding.type;
    default:
      return `${finding.type}:${finding.symptomType}`;
  }
}

// ── The material-change table (§5.3) ──────────────────────────────────────────
//
// The rule: a field the sentence or the ask is built from, moving THE WAY THE PET MOVED
// — a count that rose, a newer episode, a tier that changed, a member that joined, a new
// week's pair. A window sliding an old episode out is not the pet changing and must not
// re-open the card. Hence the asymmetry: counts are INCREASE-ONLY; tiers, booleans and
// directions re-open on ANY change. The table is data so the property test in
// `signalFold.test.ts` can walk every row rather than restate it.

export type MaterialKind = 'increase' | 'decrease' | 'turn_on' | 'change' | 'later';

/**
 * What the LOCAL RECORD knows about a finding that the cached payload does not — read by
 * `useLastEpisodeDates` and handed to the fold with the finding (CUL-785). `record.*` paths in
 * a `MaterialSpec` read from here, never from the finding.
 *
 * Why the record is a material input at all: the engine's `daysSinceLastEpisode` is a FLOORED
 * day count, pinned at 0 whenever the last episode is under a day old, and `episodeCount` /
 * `activeWeeks` / `tier` all saturate on a dense course — so for a pet vomiting daily every
 * material field is at a ceiling or a floor and `materialChange` is a fixed point: ten new
 * episodes, zero re-opens (the adversarial pass, 2026-09-04, against the real detector). The
 * instant of the record's newest episode is the witness a floored day count is not — it only
 * ever moves LATER on a new episode, it needs no engine change, and it is readable offline.
 */
export interface RecordFacts {
  /** ISO of the pet's most recent logged episode of the finding's symptom; null = unread. */
  lastEpisodeIso?: string | null;
}

export interface MaterialSpec {
  /** Re-opens only when the value RISES. */
  increaseOnly: readonly string[];
  /** Re-opens only when the value FALLS (a newer episode: `daysSinceLastEpisode`). */
  decreaseOnly: readonly string[];
  /** Re-opens only when the flag TURNS ON (the cough↔vomit adjacency). */
  turnOn: readonly string[];
  /** Re-opens on ANY change. */
  anyChange: readonly string[];
  /** ISO instants (from `RecordFacts`) that re-open only when they move LATER — a newer
   *  episode in the record. Never re-opens on an earlier instant (a deleted episode) and never
   *  on a read that did not answer. */
  laterInstant: readonly string[];
  /** The Back-because reason a change in a given field carries. */
  reason: (field: string, kind: MaterialKind) => BackBecauseReason;
}

const timingReason = (_field: string, kind: MaterialKind): BackBecauseReason =>
  kind === 'increase' ? 'new_episode' : 'timing_changed';

export const MATERIAL_FIELDS: Record<InsightType, MaterialSpec> = {
  symptom_chronicity: {
    increaseOnly: ['episodeCount', 'activeWeeks'],
    // A newer episode — catches the net-zero day when a new episode lands as an old one
    // ages out of the window.
    decreaseOnly: ['daysSinceLastEpisode'],
    turnOn: ['coughVomitAdjacent'],
    anyChange: ['tier'],
    // The record's newest episode — the witness that survives a saturated course (above).
    laterInstant: ['record.lastEpisodeIso'],
    reason: (field) => (field === 'tier' || field === 'coughVomitAdjacent' ? 'ask_changed' : 'new_episode'),
  },
  symptom_worsening: {
    increaseOnly: ['currentCount', 'currentDays'],
    decreaseOnly: [],
    turnOn: [],
    anyChange: ['tier', 'trigger'],
    laterInstant: ['record.lastEpisodeIso'],
    reason: (field, kind) => (kind === 'later' ? 'new_episode' : kind === 'increase' ? 'new_week' : 'ask_changed'),
  },
  food_symptom_correlation: {
    increaseOnly: ['matchedPairs', 'symptomEventCount'],
    decreaseOnly: [],
    turnOn: [],
    laterInstant: [],
    // A member joining the cluster is a NEW KEY (foldIdentity), so it never reaches here.
    anyChange: ['tier', 'jointCandidate', 'jointGuidance'],
    reason: (field, kind) =>
      kind === 'increase' ? 'new_episode' : field === 'tier' ? 'tier_established' : 'ask_changed',
  },
  postprandial_timing: {
    increaseOnly: ['rapidCount', 'eligibleCount'],
    decreaseOnly: [],
    turnOn: [],
    laterInstant: [],
    anyChange: ['lastTwoEligibleRapid'],
    reason: timingReason,
  },
  timeofday_clustering: {
    increaseOnly: ['clusterCount', 'eligibleCount'],
    decreaseOnly: [],
    turnOn: [],
    laterInstant: [],
    anyChange: ['clusterStartLocalHour', 'clusterWindowHours'],
    reason: timingReason,
  },
  empty_stomach_timing: {
    increaseOnly: ['bandCounts.rapid', 'bandCounts.mid', 'bandCounts.long', 'eligibleCount', 'clockCount'],
    decreaseOnly: [],
    turnOn: [],
    laterInstant: [],
    anyChange: ['lastTwoEligibleLong'],
    reason: timingReason,
  },
  timing_story: {
    increaseOnly: ['bandCounts.rapid', 'bandCounts.mid', 'bandCounts.long', 'eligibleCount', 'long.clockCount'],
    decreaseOnly: [],
    turnOn: [],
    laterInstant: [],
    anyChange: ['rapid.lastTwoEligible', 'long.lastTwoEligible'],
    reason: timingReason,
  },
  reflection: {
    increaseOnly: [],
    decreaseOnly: [],
    turnOn: [],
    laterInstant: [],
    // The pair IS the finding; a new week's pair is a new fact.
    anyChange: ['currentCount', 'priorCount', 'direction', 'density.comparable'],
    reason: () => 'new_week',
  },
  trial_response: {
    increaseOnly: [],
    decreaseOnly: [],
    turnOn: [],
    laterInstant: [],
    // The server already emits only on "changed materially".
    anyChange: ['pooledTrialCount', 'pooledBaselineCount', 'comparisonDirection', 'rapid.trial', 'mid.trial', 'long.trial'],
    reason: () => 'trial_counts',
  },
  intake_decline: {
    // The spec's premise was that this field climbs daily; under the shipped detector it is a
    // constant per species (see INTAKE_DECLINE_FOLDS above), so the row is correct but inert
    // until the engine moves the field. Kept as the §5.3 table states it.
    increaseOnly: ['daysBelowBaseline'],
    decreaseOnly: [],
    turnOn: [],
    laterInstant: [],
    anyChange: ['trigger', 'refusedFoodLabel'],
    reason: (_field, kind) => (kind === 'increase' ? 'intake_day' : 'ask_changed'),
  },
  incident_red_flag: {
    increaseOnly: ['flaggedIncidentCount'],
    decreaseOnly: [],
    turnOn: [],
    laterInstant: [],
    anyChange: ['mostRecentFlaggedIso', 'flags'],
    reason: () => 'photo_record',
  },
  // CUL-786 — the labeled stand-down marker. Not foldable (`canFold` refuses it), so no entry
  // is ever written for it and this row is never read; it exists because the table is
  // exhaustive over InsightType. When the course RE-FIRES, the chronicity finding returns
  // under its own key, and the marker's absence from the set is what release-on-absence
  // sees — the returning course renders as a full card, never as a strip.
  stood_down: {
    increaseOnly: [],
    decreaseOnly: [],
    turnOn: [],
    laterInstant: [],
    anyChange: [],
    reason: () => 'new_episode',
  },
};

// A dotted-path read, normalised to a fingerprint value: absent → null; an array is a SET
// (sorted, joined) so `flags` order never counts as a change; any other object is JSON.
function readPath(finding: SignalFinding, path: string): string | number | boolean | null {
  let cur: unknown = finding;
  for (const seg of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[seg];
  }
  if (cur === undefined || cur === null) return null;
  if (Array.isArray(cur)) return [...cur].map(String).sort().join('|');
  if (typeof cur === 'object') return JSON.stringify(cur);
  if (typeof cur === 'string' || typeof cur === 'number' || typeof cur === 'boolean') return cur;
  return null;
}

/** Every path a spec names, in one list. */
function specPaths(spec: MaterialSpec): string[] {
  return [...spec.increaseOnly, ...spec.decreaseOnly, ...spec.turnOn, ...spec.anyChange, ...spec.laterInstant];
}

/** The finding's material fields (§5.3), by dotted path, plus `type` — and the record's
 *  facts under `record.*` when the caller has them (absent → `null`, like any missing field). */
export function foldFingerprint(finding: SignalFinding, record: RecordFacts = {}): FoldFingerprint {
  const spec = MATERIAL_FIELDS[finding.type];
  const fp: FoldFingerprint = { type: finding.type };
  for (const path of specPaths(spec)) {
    fp[path] = path.startsWith('record.')
      ? readPath(record as unknown as SignalFinding, path.slice('record.'.length))
      : readPath(finding, path);
  }
  return fp;
}

function asInstant(v: string | number | boolean | null | undefined): number | null {
  if (typeof v !== 'string') return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

function asNumber(v: string | number | boolean | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * The reason a folded card should come back, or null when nothing material moved. A pure
 * function of the two fingerprints — it never reads the clock (DF-5), never reads the
 * finding set, never reads storage.
 *
 * Precedence, when several fields move in one regen: the structural change (a tier, an
 * ask, a direction) names the reason before a count does — "the vet ask changed" is the
 * more informative line when both are true. A field the STORED fingerprint never carried
 * (an older build's fingerprint after an upgrade) is skipped rather than treated as a
 * change, so an upgrade never re-opens every fold on the device at once.
 */
export function materialChange(prev: FoldFingerprint, next: FoldFingerprint): BackBecauseReason | null {
  const type = next.type as InsightType;
  if (prev.type !== type) return null;
  const spec = MATERIAL_FIELDS[type];
  if (!spec) return null;
  const has = (f: string) => Object.prototype.hasOwnProperty.call(prev, f);
  for (const f of spec.anyChange) {
    if (has(f) && prev[f] !== next[f]) return spec.reason(f, 'change');
  }
  for (const f of spec.turnOn) {
    if (has(f) && next[f] === true && prev[f] !== true) return spec.reason(f, 'turn_on');
  }
  for (const f of spec.increaseOnly) {
    const a = asNumber(prev[f]);
    const b = asNumber(next[f]);
    if (has(f) && a !== null && b !== null && b > a) return spec.reason(f, 'increase');
  }
  for (const f of spec.decreaseOnly) {
    const a = asNumber(prev[f]);
    const b = asNumber(next[f]);
    if (has(f) && a !== null && b !== null && b < a) return spec.reason(f, 'decrease');
  }
  for (const f of spec.laterInstant) {
    const a = asInstant(prev[f]);
    const b = asInstant(next[f]);
    if (has(f) && a !== null && b !== null && b > a) return spec.reason(f, 'later');
  }
  return null;
}

/**
 * A record witness the fold already holds is never overwritten by a read that did not
 * answer: `laterInstant` fields that are null on the new fingerprint keep the stored value,
 * so a transient store failure cannot erase the instant a later episode is judged against.
 */
function keepWitnesses(prev: FoldFingerprint, next: FoldFingerprint): FoldFingerprint {
  const spec = MATERIAL_FIELDS[next.type as InsightType];
  if (!spec || spec.laterInstant.length === 0) return next;
  let out = next;
  for (const f of spec.laterInstant) {
    if ((next[f] === null || next[f] === undefined) && prev[f] != null) {
      if (out === next) out = { ...next };
      out[f] = prev[f];
    }
  }
  return out;
}

function sameFingerprint(a: FoldFingerprint, b: FoldFingerprint): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && a[k] === b[k]);
}

/**
 * The pure reconcile (§5.3 release rules), run against the settled finding set:
 *
 *   1. A folded finding whose key is ABSENT from the set has its entry deleted — so when
 *      it re-fires after standing down it renders as a full card (Dr. Chen's trigger 4).
 *   2. A folded finding that moved materially becomes `reopened` with its reason.
 *   3. A folded finding that moved but NOT materially (a count aging down as the window
 *      slides) stays folded, and its stored fingerprint follows the record down — so the
 *      NEXT new episode is an increase from where the record actually is, not from where
 *      it was on the day of the fold. (Fold at 8; the window ages to 6; a new episode
 *      makes 7. Against the fold-day 8 that is a decrease; against the record it is the
 *      new episode it is.)
 *   4. A `reopened` entry whose fingerprint changed at all is deleted (the line clears).
 *   5. The record's witness (`record.lastEpisodeIso`) re-opens on a LATER instant only, and a
 *      read that did not answer never erases the witness a fold already holds.
 *
 * `nowIso` is passed in, never read here: the only clock this function touches is the
 * timestamp it STAMPS on a release, and the decision never depends on it. Returns the
 * same `entries` object when nothing changed, so a caller can skip the write.
 */
export function reconcileFolds(
  entries: PetFoldEntries,
  findings: readonly SignalFinding[],
  nowIso: string,
  /** The record's facts for a finding (CUL-785) — the zone's `useLastEpisodeDates` read;
   *  absent for callers that have none (every row then carries a null witness). */
  recordOf: (finding: SignalFinding) => RecordFacts = () => ({}),
): { entries: PetFoldEntries; changed: boolean } {
  const byKey = new Map<string, SignalFinding>();
  for (const f of findings) byKey.set(foldIdentity(f), f);
  let changed = false;
  const next: PetFoldEntries = { ...entries };
  for (const [key, entry] of Object.entries(entries)) {
    const finding = byKey.get(key);
    if (!finding) {
      delete next[key];
      changed = true;
      continue;
    }
    const fp = keepWitnesses(entry.fingerprint, foldFingerprint(finding, recordOf(finding)));
    if (entry.state === 'folded') {
      const reason = materialChange(entry.fingerprint, fp);
      if (reason) {
        next[key] = { state: 'reopened', reason, fingerprint: fp, atIso: nowIso };
        changed = true;
      } else if (!sameFingerprint(entry.fingerprint, fp)) {
        next[key] = { ...entry, fingerprint: fp };
        changed = true;
      }
    } else if (!sameFingerprint(entry.fingerprint, fp)) {
      delete next[key];
      changed = true;
    }
  }
  return changed ? { entries: next, changed } : { entries, changed };
}

/** A fresh `folded` entry for a finding the owner just compacted, carrying the record's
 *  facts as of the fold so the next episode is judged against where the record IS. */
export function foldedEntry(finding: SignalFinding, nowIso: string, record: RecordFacts = {}): FoldEntry {
  return { state: 'folded', fingerprint: foldFingerprint(finding, record), foldedAtIso: nowIso };
}

// ── The AsyncStorage shell ────────────────────────────────────────────────────

// The clear epoch — `lib/signalArrival`'s idiom, for the same reason. A blob write is a
// read-modify-write, and the zone fires it un-awaited; a `clearSignalFold()` landing
// between the read and the write would let the stale write put the WHOLE previous
// account's map back after `wipeLocalSession()` had already returned clean. Capture the
// epoch on entry, re-check before writing, abandon on a wipe. Module-local because this
// module's clear IS the key's only wipe.
let clearEpoch = 0;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isEntry(v: unknown): v is FoldEntry {
  if (!isRecord(v) || !isRecord(v.fingerprint)) return false;
  if (v.state === 'folded') return typeof v.foldedAtIso === 'string';
  if (v.state === 'reopened') return typeof v.reason === 'string' && typeof v.atIso === 'string';
  return false;
}

/** Discard anything that is not this module's shape — a hand-edited, half-written, or
 *  future-version blob is dropped entry by entry rather than trusted. */
function sanitizeStore(parsed: unknown): FoldStore {
  if (!isRecord(parsed)) return {};
  const store: FoldStore = {};
  for (const [petId, entries] of Object.entries(parsed)) {
    if (!isRecord(entries)) continue;
    const clean: PetFoldEntries = {};
    for (const [key, entry] of Object.entries(entries)) {
      if (isEntry(entry)) clean[key] = entry;
    }
    if (Object.keys(clean).length > 0) store[petId] = clean;
  }
  return store;
}

/** The whole blob, or null when storage could not be read (as distinct from empty). */
async function readStore(): Promise<FoldStore | null> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(SIGNAL_FOLD_STORAGE_KEY);
  } catch {
    // Storage did not answer. Distinct from a blob that answered with garbage (below):
    // that one is discarded; this one must leave the surface exactly as it was.
    return null;
  }
  if (!raw) return {};
  try {
    return sanitizeStore(JSON.parse(raw));
  } catch {
    return {};
  }
}

/**
 * One pet's entries. `{}` when nothing is folded; **`null` when storage could not be
 * read** — the caller must treat that as "unanswered" and leave the surface as it was
 * (C-12: never release, never fold, never write on a read that did not answer). A
 * corrupted blob reads as `{}`: it answered, with nothing usable, and the next write
 * replaces it.
 */
export async function readFoldEntries(petId: string): Promise<PetFoldEntries | null> {
  const store = await readStore();
  if (store === null) return null;
  return store[petId] ?? {};
}

/**
 * Replace one pet's entries (an empty map removes the pet's key). Read-modify-write on
 * the blob, epoch-guarded; best-effort — a write failure is logged, never thrown, because
 * a fold is a convenience and an owner-facing error about it would be worse than the
 * fold not sticking.
 */
export async function writeFoldEntries(petId: string, entries: PetFoldEntries): Promise<void> {
  const epoch = clearEpoch;
  try {
    const store = (await readStore()) ?? {};
    // A wipe landed while we were reading; writing now would restore the map the sign-out
    // just destroyed. Losing this one fold is the correct outcome.
    if (clearEpoch !== epoch) return;
    if (Object.keys(entries).length === 0) delete store[petId];
    else store[petId] = entries;
    await AsyncStorage.setItem(SIGNAL_FOLD_STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.warn('[signalFold] write failed:', e);
  }
}

/**
 * Drop the entries of pets this device no longer knows (§5.1: "entries whose pet is no
 * longer in the store are pruned on read"). Epoch-guarded like every write here.
 */
export async function pruneFoldStore(keepPetIds: readonly string[]): Promise<void> {
  // An empty keep-list is never a prune instruction — it is a store that has not loaded.
  if (keepPetIds.length === 0) return;
  const epoch = clearEpoch;
  try {
    const store = await readStore();
    if (store === null || clearEpoch !== epoch) return;
    const keep = new Set(keepPetIds);
    const stale = Object.keys(store).filter((id) => !keep.has(id));
    if (stale.length === 0) return;
    for (const id of stale) delete store[id];
    await AsyncStorage.setItem(SIGNAL_FOLD_STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.warn('[signalFold] prune failed:', e);
  }
}

/**
 * Sign-out teardown (DF-6 / FS-10 / B-402 FR-9 parity) — wired into `wipeLocalSession`
 * BY NAME. Best-effort and idempotent, like every other clear on that path.
 */
export async function clearSignalFold(): Promise<void> {
  // Bumped BEFORE the removal, so a write whose read straddles this clear is caught by the
  // re-check rather than racing the removal itself.
  clearEpoch++;
  try {
    await AsyncStorage.removeItem(SIGNAL_FOLD_STORAGE_KEY);
  } catch (e) {
    console.warn('[signalFold] clear failed:', e);
  }
}
