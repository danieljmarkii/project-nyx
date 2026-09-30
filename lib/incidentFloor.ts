// EN-4's floor for the vomit read: how soon to call, from the record alone (Engines v3
// PR-28, CUL-1134; docs/nyx-incident-tiers-requirements.md §7 and §8).
//
// ONE RULE, pure, import-free and copy-free (§8.1), so the Edge Functions import it without
// pulling client copy into their shipping closure (C-26) and the phone can run the same rule
// offline later (the client half, §8.5). No clock: the caller hands the rows it read, and
// every window is measured from the vomit, never from the read.
//
// RAISE-ONLY, BY CONSTRUCTION. This rule never decides that a read is calm. It returns the
// louder rows of the sign-to-tier table (§7) that the record meets, and the caller takes the
// louder of its answer and today's (the shipped repeat, intake and lethargy flags keep firing
// exactly as they did). So every row that is QUIETER than today in §7 (T5c's merge, the
// found-pile exclusion from the day count, T10) is simply not here: today's louder answer
// stands until the harness, the PM and the paid vet review say otherwise (E-6, CUL-1312).
//
// THE ROWS BUILT (every threshold is a placeholder for the ruling sheet, CUL-583):
//   T1  three logs of vomiting, found piles excepted, inside one 30-minute span that holds
//       this vomit                                                            → call now
//   T2  three onsets inside one ~4-hour span that holds this vomit's onset    → call now
//   T3  lethargy logged within 24 h either side of this vomit                 → call now
//   T6  a dog, two vomits inside one 24-hour span that holds this one         → call today
//   T7  under six months old, or no birthday on file, the same two in 24 h    → call today
//   T8  a vomit in each of three back-to-back 24-hour spans holding this one  → call today
// Species "other" gets every count rung and T3 (T26); only T6 is species-keyed.
//
// HELD, deliberately absent: T11 (a dog retching with nothing produced) until there is a way
// to log "nothing came up" (GAP-14); T9 (another vomit while a call is open) until GAP-33
// says how long a call stays open; T20 / T21 (drugs on board, a new course) until the
// ruling sheet's curated list exists.
//
// COUNTING (§8.9, GAP-10). A found pile (confidence 'window') is never an onset: its time is
// when it was found, not when it happened, so it never counts toward T1 or T2. It still
// counts toward the day rungs (T6, T7, T8), dated by discovery. Only WITNESSED logs merge
// into one onset, and only within 30 minutes of that onset's first log, never chaining
// (lib/symptomEpisodes.ts chains, which would fold a dog retching every ten minutes into one
// episode). Estimated and unclassified logs are each their own onset. This is a second,
// differently named predicate beside symptomEpisodes, not a replacement for it: the two
// answer different questions (C-34), and owner-facing copy says "vomits logged", never
// "episodes".
//
// Instants are parsed, never compared as text (C-40). An unparseable time is outside every
// window, and an unparseable anchor meets no row.

export const FLOOR_MERGE_MINUTES = 30;
export const FLOOR_BURST_MINUTES = 30; // T1's span
export const FLOOR_BURST_COUNT = 3;
export const FLOOR_SPAN_HOURS = 4; // T2's span
export const FLOOR_SPAN_COUNT = 3;
export const FLOOR_LETHARGY_HOURS = 24; // T3, either side of the vomit
export const FLOOR_PAIR_HOURS = 24; // T6, T7
export const FLOOR_PAIR_COUNT = 2;
export const FLOOR_YOUNG_MONTHS = 6; // T7's age cut
export const FLOOR_PERSISTENCE_DAYS = 3; // T8

/** How far either side of the vomit the rule reads: T8 needs three 24-hour spans on either
 *  side of the one that holds the vomit. A caller reading less makes the rule see less. */
export const FLOOR_READ_HOURS = FLOOR_PERSISTENCE_DAYS * 24;

export type FloorTier = 'call_now' | 'call_today';
export type FloorRow = 'T1' | 'T2' | 'T3' | 'T6' | 'T7' | 'T8';

/** One logged vomit. `confidence` is `events.occurred_at_confidence`: 'witnessed',
 *  'estimated', 'window' (a found pile), or null (unclassified). */
export interface FloorVomit {
  at: string;
  confidence: string | null;
}

export interface FloorInput {
  /** The vomit being read, as it sits in `vomits` (it is counted from there). */
  anchor: FloorVomit;
  /** Every live vomit log of this pet the caller read, the anchor included or not. */
  vomits: readonly FloorVomit[];
  /** Every live lethargy log of this pet the caller read. */
  lethargyAt: readonly string[];
  species: string;
  /** `pets.date_of_birth` (YYYY-MM-DD) or null when none is on file. */
  birthDate: string | null;
}

export interface FloorResult {
  /** The loudest tier any row gives, or null when the record meets none. */
  tier: FloorTier | null;
  /** Every row the record meets, loudest first, in table order within a tier. */
  rows: FloorRow[];
  /** The counts behind the rows, for the read's words. Zero when a row did not apply. */
  counts: { burst: number; span: number; pair: number };
  /** True when T7 fired only because no birthday is on file (the read says so, §8.11). */
  ageUnknown: boolean;
}

export const FLOOR_ROW_TIER: Readonly<Record<FloorRow, FloorTier>> = {
  T1: 'call_now',
  T2: 'call_now',
  T3: 'call_now',
  T6: 'call_today',
  T7: 'call_today',
  T8: 'call_today',
};

const ROW_ORDER: readonly FloorRow[] = ['T1', 'T2', 'T3', 'T6', 'T7', 'T8'];

const MIN = 60_000;
const HOUR = 3_600_000;

function ms(iso: string): number {
  return Date.parse(iso);
}

const isFound = (v: FloorVomit) => v.confidence === 'window';

/** The most points inside any closed span of `widthMs` that also holds `at`. An optimal span
 *  can always start at a point, so trying each point at or before `at` (and within reach) is
 *  exhaustive. `at` must itself be one of the points for the answer to count it. */
export function mostInSpanHolding(points: readonly number[], at: number, widthMs: number): number {
  let best = 0;
  for (const start of points) {
    if (start > at || at - start > widthMs) continue;
    const end = start + widthMs;
    const n = points.filter((p) => p >= start && p <= end).length;
    if (n > best) best = n;
  }
  return best;
}

/** The onset of every non-found log, in time order. A witnessed log within 30 minutes of an
 *  open witnessed onset joins it (and does not move it, so nothing chains); anything else
 *  opens its own onset. Returns, per log, the onset it belongs to. */
export function vomitOnsets(vomits: readonly FloorVomit[]): { at: number; onset: number }[] {
  const logs = vomits
    .filter((v) => !isFound(v) && Number.isFinite(ms(v.at)))
    .map((v) => ({ at: ms(v.at), witnessed: v.confidence === 'witnessed' }))
    .sort((a, b) => a.at - b.at);
  const out: { at: number; onset: number }[] = [];
  let open: number | null = null;
  for (const log of logs) {
    if (log.witnessed && open !== null && log.at - open <= FLOOR_MERGE_MINUTES * MIN) {
      out.push({ at: log.at, onset: open });
      continue;
    }
    out.push({ at: log.at, onset: log.at });
    open = log.witnessed ? log.at : null;
  }
  return out;
}

/** Age in whole months at `atMs`, or null when the birthday is missing or unreadable. */
export function ageInMonths(birthDate: string | null, atMs: number): number | null {
  if (!birthDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate);
  if (!m || !Number.isFinite(atMs)) return null;
  const at = new Date(atMs);
  let months = (at.getUTCFullYear() - Number(m[1])) * 12 + (at.getUTCMonth() + 1 - Number(m[2]));
  if (at.getUTCDate() < Number(m[3])) months -= 1;
  return months;
}

export function incidentFloor(input: FloorInput): FloorResult {
  const none: FloorResult = { tier: null, rows: [], counts: { burst: 0, span: 0, pair: 0 }, ageUnknown: false };
  const a = ms(input.anchor.at);
  if (!Number.isFinite(a)) return none;

  // Every log, with the anchor present exactly once: the caller's read may race its own
  // write, so the anchor is added when no log sits at its instant.
  const vomits = input.vomits.filter((v) => Number.isFinite(ms(v.at)));
  if (!vomits.some((v) => ms(v.at) === a)) vomits.push(input.anchor);

  const rows = new Set<FloorRow>();
  const counts = { burst: 0, span: 0, pair: 0 };

  // T1 and T2 read onsets, and a found anchor is not one: its own read gets the day rungs
  // and today's repeat rule, and its witnessed neighbours carry the call now.
  if (!isFound(input.anchor)) {
    const logs = vomits.filter((v) => !isFound(v)).map((v) => ms(v.at));
    counts.burst = mostInSpanHolding(logs, a, FLOOR_BURST_MINUTES * MIN);
    if (counts.burst >= FLOOR_BURST_COUNT) rows.add('T1');

    const onsets = vomitOnsets(vomits);
    const mine = onsets.find((o) => o.at === a)?.onset ?? a;
    const distinct = [...new Set(onsets.map((o) => o.onset))];
    counts.span = mostInSpanHolding(distinct, mine, FLOOR_SPAN_HOURS * HOUR);
    if (counts.span >= FLOOR_SPAN_COUNT) rows.add('T2');
  }

  // T3: lethargy on either side of the vomit, bounded by the vomit, never by the read (BRK-2).
  if (input.lethargyAt.some((t) => Number.isFinite(ms(t)) && Math.abs(ms(t) - a) <= FLOOR_LETHARGY_HOURS * HOUR)) {
    rows.add('T3');
  }

  // The day rungs count every log, found piles included, dated as logged.
  const all = vomits.map((v) => ms(v.at));
  counts.pair = mostInSpanHolding(all, a, FLOOR_PAIR_HOURS * HOUR);
  const age = ageInMonths(input.birthDate, a);
  if (counts.pair >= FLOOR_PAIR_COUNT) {
    if (input.species === 'dog') rows.add('T6');
    if (age === null || age < FLOOR_YOUNG_MONTHS) rows.add('T7');
  }

  // T8: three consecutive 24-hour spans, each holding a log, the anchor inside the three.
  // The server knows no zone, so the spans are not calendar days: they may start at any
  // moment, and an optimal run can always start at a log, so each log in reach is tried.
  const DAY = 24 * HOUR;
  const RUN = FLOOR_PERSISTENCE_DAYS * DAY;
  for (const s of all) {
    if (s > a || a >= s + RUN) continue;
    let run = true;
    for (let k = 0; k < FLOOR_PERSISTENCE_DAYS; k++) {
      if (!all.some((t) => t >= s + k * DAY && t < s + (k + 1) * DAY)) run = false;
    }
    if (run) {
      rows.add('T8');
      break;
    }
  }

  const ordered = ROW_ORDER.filter((r) => rows.has(r));
  const tier: FloorTier | null = ordered.some((r) => FLOOR_ROW_TIER[r] === 'call_now')
    ? 'call_now'
    : ordered.length > 0
      ? 'call_today'
      : null;
  return { tier, rows: ordered, counts, ageUnknown: rows.has('T7') && age === null };
}
