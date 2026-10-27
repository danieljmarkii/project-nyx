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
//   T8  a vomit on each of three consecutive calendar days, this one's among them → call today
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

/** How far either side of the vomit the rule reads: T8's run can reach two calendar days
 *  either side of the vomit's own. A caller reading less makes the rule see less. Mirrored
 *  into the may-wait SQL (guards/mayWaitRecordChange.test.ts), so it moves only with a
 *  migration. Residual: a local day that is 25 hours long (a fall-back night) can put a run's
 *  first log up to an hour past this reach; T8 then stays silent, never louder. */
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
  /** The owner's IANA zone, which decides where T8's calendar days begin: the server passes
   *  `user_profiles.timezone`, the phone its own. Absent, null or unresolvable, T8 fires only
   *  on a run that holds in every zone a pet can live in (UTC-12 … UTC+14). */
  timeZone?: string | null;
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

const DAY_MS = 24 * HOUR;

/** Day-index functions for T8: the owner's zone when it resolves, else every whole-hour
 *  offset a pet can live at. Intl is the platform's, not an import, so the rule stays
 *  import-free (§8.1). */
export function calendars(timeZone: string | null | undefined): ((t: number) => number)[] {
  if (timeZone) {
    try {
      const fmt = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' });
      return [
        (t) => {
          const parts = fmt.formatToParts(new Date(t));
          const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
          return Math.floor(Date.UTC(n('year'), n('month') - 1, n('day')) / DAY_MS);
        },
      ];
    } catch {
      // An unresolvable zone is no zone: fall through to every offset.
    }
  }
  return Array.from({ length: 27 }, (_, i) => (t: number) => Math.floor((t + (i - 12) * HOUR) / DAY_MS));
}

/** Whether `days` holds FLOOR_PERSISTENCE_DAYS consecutive days, `anchorDay` among them. */
export function persistsThrough(days: readonly number[], anchorDay: number): boolean {
  const logged = new Set(days);
  for (let start = anchorDay - FLOOR_PERSISTENCE_DAYS + 1; start <= anchorDay; start++) {
    let run = true;
    for (let k = 0; k < FLOOR_PERSISTENCE_DAYS; k++) if (!logged.has(start + k)) run = false;
    if (run) return true;
  }
  return false;
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

  // T8: a vomit on each of three consecutive calendar days, the anchor's day among them. Days,
  // not sliding 24-hour spans: a span may start anywhere, so it can split two vomits sixteen
  // minutes apart, and three vomits across 25 hours on two days read as "three days in a row"
  // (CUL-2223, Nyx: 06:10 and 06:26 one morning, 07:44 the next). The sentence names days, so
  // the rule counts days. With no zone the day boundary is unknown, and the run must hold in
  // every offset (the burden detector's quietest reading, generate-signal/detection.ts): the
  // claim is made only where it is true wherever the owner is.
  if (calendars(input.timeZone).every((dayOf) => persistsThrough(all.map(dayOf), dayOf(a)))) rows.add('T8');

  const ordered = ROW_ORDER.filter((r) => rows.has(r));
  const tier: FloorTier | null = ordered.some((r) => FLOOR_ROW_TIER[r] === 'call_now')
    ? 'call_now'
    : ordered.length > 0
      ? 'call_today'
      : null;
  return { tier, rows: ordered, counts, ageUnknown: rows.has('T7') && age === null };
}
