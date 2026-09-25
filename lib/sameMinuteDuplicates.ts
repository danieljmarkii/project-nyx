// The same-minute duplicate rule: ONE home for the vet report and History v2
// (CUL-1161 / HV-4; docs/nyx-history-v2-requirements.md §3.2, §5.2, PMD-10).
//
// WHY IT MOVED HERE. The vet report collapses a bout logged twice (a double tap, an
// offline retry) into one incident, `dedupeEvents` in `generate-report/report.ts`. History
// counts rows, so its "1,094 logged" and the report's count of the same record could differ
// with nothing on either surface saying why (the critique's PMD-10). History v2 discloses
// the difference instead ("3 logged twice in the same minute"), and a disclosure is only
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

/** Instant ascending, then id: the sweep's order and the survivors' order. An unparseable
 *  instant sorts last. */
function byInstantThenId(a: SameMinuteEvent, b: SameMinuteEvent): number {
  const am = parseMs(a.occurredAt) ?? Number.POSITIVE_INFINITY;
  const bm = parseMs(b.occurredAt) ?? Number.POSITIVE_INFINITY;
  if (am !== bm) return am - bm;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
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
  const rank = (e: E): [number, number, number, string] => [
    isInWindow(e) ? 0 : 1,
    isPreferred(e) ? 0 : 1,
    parseMs(e.occurredAt) ?? Number.POSITIVE_INFINITY,
    e.id,
  ];
  const rankLess = (a: E, b: E): boolean => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < 4; i++) {
      if (ra[i] !== rb[i]) return ra[i] < rb[i];
    }
    return false;
  };

  const byGroup = new Map<string, E[]>();
  for (const e of events) {
    const k = sameMinuteGroupKey(e);
    const arr = byGroup.get(k);
    if (arr) arr.push(e);
    else byGroup.set(k, [e]);
  }

  const clusters: SameMinuteCluster<E>[] = [];
  const droppedEventIds = new Set<string>();

  for (const group of byGroup.values()) {
    const sorted = [...group].sort(byInstantThenId);
    let cluster: E[] = [];
    const flush = () => {
      if (cluster.length === 0) return;
      let representative = cluster[0];
      for (const e of cluster) if (rankLess(e, representative)) representative = e;
      for (const e of cluster) if (e.id !== representative.id) droppedEventIds.add(e.id);
      clusters.push({
        representative,
        members: cluster,
        memberEventIds: cluster.map((e) => e.id).sort(),
      });
      cluster = [];
    };
    let anchorMs: number | null = null;
    for (const e of sorted) {
      const ms = parseMs(e.occurredAt);
      if (cluster.length === 0) {
        cluster = [e];
        anchorMs = ms;
        continue;
      }
      // Within one window of the cluster's FIRST member, inclusive. The anchor never moves
      // for the cluster's life, so no cluster spans more than one window.
      if (ms !== null && anchorMs !== null && ms - anchorMs <= SAME_MINUTE_WINDOW_MS) {
        cluster.push(e);
      } else {
        flush();
        cluster = [e];
        anchorMs = ms;
      }
    }
    flush();
  }

  clusters.sort((a, b) => byInstantThenId(a.representative, b.representative));
  return { clusters, droppedEventIds };
}
