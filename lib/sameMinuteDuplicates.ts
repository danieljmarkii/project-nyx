// The same-minute duplicate rule: ONE home for the vet report and History v2
// (CUL-1161 / HV-4; docs/nyx-history-v2-requirements.md §3.2, §5.2, PMD-10).
//
// WHY IT MOVED HERE. The vet report collapses a bout logged twice (a double tap, an
// offline retry) into one incident, `dedupeEvents` in `generate-report/report.ts`. History
// counts rows, so its "1,094 logged" and the report's count of the same record could differ
// with nothing on either surface saying why (the critique's PMD-10). History v2 discloses
// the difference instead ("3 possible repeats within a minute"), and a disclosure is only
// honest if it is the report's OWN rule, not a second one that agrees today. So the rule is
// lifted here, verbatim, onto a minimal event shape; History imports it now and the report
// moves onto it in HV-15 (CUL-1170). Until then `sameMinuteDuplicates.test.ts` evaluates the
// report's live `dedupeEvents` source and holds the two equal over thousands of seeded
// inputs, so neither can drift without a red build.
//
// THE RULE, as the report states it (§5.11):
//   • Two events whose instants fall within SAME_MINUTE_WINDOW_MS are one incident when
//     they share a group: an observation type (a symptom or a stool) groups by TYPE, a meal
//     groups by its FOOD (two different foods seconds apart are two real feedings), and
//     every other event groups with nothing. A dose or a weigh-in carries its identity on
//     its child row (which drug, which reading), so a type-and-minute collapse would
//     destroy real data: two drugs given together (the B-156 combo) are two doses.
//   • A cluster is anchored on its FIRST member: an event joins while it is within one
//     window of the anchor, so a slow chain of sub-window gaps can never fold an
//     arbitrarily long run into one incident (the report's adversarial finding 3).
//   • The member that REPRESENTS the incident is chosen in-window first, so a duplicate
//     straddling a window's edge never pulls a genuine in-window bout out of the window
//     (finding 1); then a preferred member (the report prefers the one whose photo read
//     completed); then the earliest; then the id. A total order, independent of input order.
//   • An unparseable instant is never "near" anything: it never joins a cluster.
//
// WHAT STAYS WITH THE CALLER. What a caller DOES with a cluster is not the rule. The report
// folds the members' owner severity and notes onto the representative so the collapse loses
// no clinical input; History folds nothing, it only counts the rows the report would drop
// and says so. That fold stays in `report.ts` when HV-15 adopts this module.
//
// DENO-COMPATIBLE BY CONSTRUCTION: no imports at all, so `generate-report` can import it
// as-is (the `lib/medicationHistory.ts` precedent) and jest runs it unchanged.

/** The window, the report's `DEDUP_WINDOW_MS`: "same minute", robust to a minute-boundary
 *  straddle (10:00:59 and 10:01:01 are 2s apart but in different clock minutes). */
export const SAME_MINUTE_WINDOW_MS = 60_000;

/**
 * The observation types that collapse by TYPE: the report's symptom set plus normal stool
 * (`DEDUP_OBSERVATION_TYPES` = `REPORT_SYMPTOM_TYPES` + `stool_normal`). The report's set,
 * deliberately, not the client's `SYMPTOM_TYPES`: `scratch` and `skin_reaction` are valid
 * stored values with no quick-log tile, and a legacy row of either must collapse here
 * exactly as it collapses in the report, or the disclosure stops matching the report.
 * A new observation leaf joins this set in the PR its report membership lands; the
 * membership walk (`constants/eventTypes.membership.test.ts`) carries the per-leaf row.
 */
export const SAME_MINUTE_OBSERVATION_TYPES: ReadonlySet<string> = new Set([
  'vomit',
  'diarrhea',
  'itch',
  'scratch',
  'skin_reaction',
  'cough',
  'sneeze',
  'lethargy',
  'stool_normal',
]);

/** The fields the rule reads, and nothing else. */
export interface SameMinuteEvent {
  id: string;
  /** `events.event_type`. */
  type: string;
  /** `events.occurred_at`, an ISO instant in either spelling (`…Z` or `…+00:00`); parsed,
   *  never compared as text (C-40). */
  occurredAt: string;
  /** `meals.food_item_id`. Read only for a meal; a meal with no food groups with every
   *  other food-less meal, as the report's `meal|null` key does. */
  foodItemId: string | null;
}

/** The group an event can collapse within. Exported so the report's key shape is pinned
 *  against this one by source text, not only by behaviour. */
export function sameMinuteGroupKey(e: SameMinuteEvent): string {
  if (e.type === 'meal') return `meal|${e.foodItemId ?? 'null'}`;
  if (SAME_MINUTE_OBSERVATION_TYPES.has(e.type)) return e.type;
  return `keep|${e.id}`;
}

export interface SameMinuteCluster<E extends SameMinuteEvent> {
  /** The member that stands for the incident (in-window, preferred, earliest, id). */
  representative: E;
  /** Every member, in the sweep's order (instant, then id). A cluster of one is an
   *  incident logged once. */
  members: E[];
  /** Every member's id, sorted: the report's `memberEventIds`. */
  memberEventIds: string[];
}

export interface SameMinuteResult<E extends SameMinuteEvent> {
  /** One per incident, ordered by the representative's instant, then id (the report's
   *  survivor order). */
  clusters: SameMinuteCluster<E>[];
  /** Every member that is not its cluster's representative: the rows the report drops. */
  droppedEventIds: Set<string>;
}

export interface SameMinuteOptions<E extends SameMinuteEvent> {
  /** Whether a member lies inside the window being read; an in-window member always
   *  outranks an out-of-window one. Default: every member is in-window. */
  isInWindow?: (e: E) => boolean;
  /** A member to prefer among the in-window ones (the report: its photo read completed).
   *  Default: none preferred. */
  isPreferred?: (e: E) => boolean;
}

/** Milliseconds since the epoch, or null when the instant does not parse. */
function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** An event with its instant parsed once (CUL-1228). The sweep's order, the anchor test,
 *  the representative's rank and the survivors' order all read `ms`, never the string: a
 *  comparator that parsed both sides cost hundreds of thousands of `Date.parse` calls on a
 *  two-year record, where every meal of one food falls into one group. */
interface Parsed<E> {
  e: E;
  /** Epoch ms, or +Infinity when the instant does not parse (it sorts last). */
  ms: number;
  /** Whether the instant parsed: an unparseable one is never "near" anything. */
  parsed: boolean;
}

/** Instant ascending, then id: the sweep's order and the survivors' order. An unparseable
 *  instant sorts last. */
function byInstantThenId<E extends SameMinuteEvent>(a: Parsed<E>, b: Parsed<E>): number {
  if (a.ms !== b.ms) return a.ms < b.ms ? -1 : 1;
  return a.e.id < b.e.id ? -1 : a.e.id > b.e.id ? 1 : 0;
}

/**
 * Group `events` into same-minute incidents by the vet report's rule. Pure and
 * deterministic: the result does not depend on the input's order.
 *
 * The caller decides what the input is. A window read should include the rows just
 * outside the window too (the report reads its whole pull; History reads a day of slack
 * each side), because a cluster is anchored on its first member and an anchor outside the
 * window can change which in-window rows pair up.
 */
export function collapseSameMinute<E extends SameMinuteEvent>(
  events: readonly E[],
  opts: SameMinuteOptions<E> = {},
): SameMinuteResult<E> {
  const isInWindow = opts.isInWindow ?? (() => true);
  const isPreferred = opts.isPreferred ?? (() => false);

  // The representative's rank: in-window first, then preferred, then earliest, then id.
  // Compared element by element, so it is a total order over distinct ids.
  const rankLess = (a: Parsed<E>, b: Parsed<E>): boolean => {
    const wa = isInWindow(a.e) ? 0 : 1;
    const wb = isInWindow(b.e) ? 0 : 1;
    if (wa !== wb) return wa < wb;
    const pa = isPreferred(a.e) ? 0 : 1;
    const pb = isPreferred(b.e) ? 0 : 1;
    if (pa !== pb) return pa < pb;
    if (a.ms !== b.ms) return a.ms < b.ms;
    return a.e.id < b.e.id;
  };

  // Each instant parsed exactly once, here.
  const byGroup = new Map<string, Parsed<E>[]>();
  for (const e of events) {
    const ms = parseMs(e.occurredAt);
    const p: Parsed<E> = { e, ms: ms ?? Number.POSITIVE_INFINITY, parsed: ms !== null };
    const k = sameMinuteGroupKey(e);
    const arr = byGroup.get(k);
    if (arr) arr.push(p);
    else byGroup.set(k, [p]);
  }

  const parsedClusters: { representative: Parsed<E>; members: Parsed<E>[] }[] = [];
  const droppedEventIds = new Set<string>();

  for (const group of byGroup.values()) {
    group.sort(byInstantThenId);
    let cluster: Parsed<E>[] = [];
    const flush = () => {
      if (cluster.length === 0) return;
      let representative = cluster[0];
      for (const p of cluster) if (rankLess(p, representative)) representative = p;
      for (const p of cluster) if (p.e.id !== representative.e.id) droppedEventIds.add(p.e.id);
      parsedClusters.push({ representative, members: cluster });
      cluster = [];
    };
    let anchor: Parsed<E> | null = null;
    for (const p of group) {
      if (cluster.length === 0 || anchor === null) {
        cluster = [p];
        anchor = p;
        continue;
      }
      // Within one window of the cluster's FIRST member, inclusive. The anchor never moves
      // for the cluster's life, so no cluster spans more than one window.
      if (p.parsed && anchor.parsed && p.ms - anchor.ms <= SAME_MINUTE_WINDOW_MS) {
        cluster.push(p);
      } else {
        flush();
        cluster = [p];
        anchor = p;
      }
    }
    flush();
  }

  parsedClusters.sort((a, b) => byInstantThenId(a.representative, b.representative));
  const clusters: SameMinuteCluster<E>[] = parsedClusters.map((c) => ({
    representative: c.representative.e,
    members: c.members.map((p) => p.e),
    memberEventIds: c.members.map((p) => p.e.id).sort(),
  }));
  return { clusters, droppedEventIds };
}
