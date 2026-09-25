// History v2's screen, the pure half (CUL-1164 / HV-7; docs/nyx-history-v2-requirements.md
// §3.1–3.5, §3.10–3.12). Everything the list decides that a table test can hold lives here,
// so the rules are asserted over data (C-41: a rule whose effect lands below the fold is
// invisible to a rendered tree). The reads are `store/historyListStore.ts`'s; the drawing is
// `components/historyV2/`'s; the numbers are `lib/historyDays.ts`'s. This file adapts one to
// the other and restates none of them (R-3).
//
// ── A FILTER ONLY HIDES (R-2, AC 9) ──────────────────────────────────────────────
// `visibleNodesOf` is the one place a filter or a search touches a day's rows. The nodes are
// built over the WHOLE day (`readWholeDays`), then hidden by the ids the page's SQL showed:
// a run shows whole or, when only some of its members match a search, as those members, never
// re-cut over the survivors. So a row's timing line, its run, its vehicle and its chips are the
// same under every filter, because the nodes never saw the filter.

import { SYMPTOM_TYPES, type EventTypeKey } from '../constants/eventTypes';
import { buildDayNodes, type DayNode } from './dayNodes';
import {
  DEFAULT_MEAL_TIMING_CONFIG,
  type FeedingInput,
  type FreeFedSpan,
  type OnsetConfidence,
} from './mealTiming';
import type { HistoryRow } from './historyQueries';
import type { SpineAnalysisRow } from './spineNode';
import {
  absenceText,
  type CountLineDoorKey,
  type CountLineWindow,
  type DateOnlyItem,
  type DayRange,
  type HistoryDateFormat,
  type HistoryFilter,
  type HistorySection,
} from './historyDays';
import type { ResolvedWindow, WindowFacts } from './historyWindows';
import { foodFormatWord } from './foodFormat';
import { recordDay, recordRange, recordWeekday } from './recordDates';
import { dayKeyFromIndex, dayKeyToLocalDate } from './utils';
import type { ActiveArrangementView } from './feedingArrangements';

// ── The one date formatter, for the screen (H-10) ──────────────────────────────

/**
 * The count line's and the gap lines' dates, through `lib/recordDates.ts` for one `today`.
 * Every key handed in is a day key the screen's own day math produced, so a null (a
 * malformed key) cannot happen in practice; if it ever did, the key itself is printed,
 * which is at least the day the record named, never a guessed one.
 */
export function historyDatesFor(today: string): HistoryDateFormat {
  return {
    day: (key) => recordDay(key, today) ?? key,
    weekday: (key) => recordWeekday(key, today) ?? key,
    range: (from, to) => recordRange(from, to, today) ?? `${from} – ${to}`,
  };
}

// ── The count line's window ─────────────────────────────────────────────────────

/** The anchored window's own day: the trial's first day of evidence, or the visit's day. */
function anchorDayOf(resolved: ResolvedWindow, facts: WindowFacts): string | null {
  if (resolved.key.kind === 'trial') {
    const range = facts.trial?.exposureRange ?? null;
    return range ? dayKeyFromIndex(range.startDayIndex) : null;
  }
  if (resolved.key.kind === 'visit') return facts.sinceVisit;
  return null;
}

/**
 * The window as the count line names it (HV-4's `CountLineWindow`), from HV-3's resolved
 * window and the facts it was resolved against. The anchor is the trial's or the visit's own
 * day, which is earlier than the window's first day exactly when the record starts later
 * (CUL-1189 · 1): then the count line names both.
 */
export function countLineWindowOf(resolved: ResolvedWindow, facts: WindowFacts): CountLineWindow {
  return {
    longName: resolved.label.long,
    anchorDay: anchorDayOf(resolved, facts),
    isAllTime: resolved.key.kind === 'all',
    isTrial: resolved.key.kind === 'trial',
    range: resolved.bounds,
    recordFrom: resolved.recordStartsLater,
    pastPlannedEnd: resolved.trialPastTarget,
  };
}

/**
 * The running trial's days, for the *Outside the trial diet* door (PMD-9): its evidence
 * window (`exposureRange`, never `range`), only while the trial runs (`isTrialRunning`, read
 * by `windowTrialOf`). A trial that is not running today offers no door.
 */
export function trialRangeOf(facts: WindowFacts): DayRange | null {
  const trial = facts.trial;
  if (!trial || !trial.running || !trial.exposureRange) return null;
  return {
    fromDay: dayKeyFromIndex(trial.exposureRange.startDayIndex),
    toDay: dayKeyFromIndex(trial.exposureRange.endDayIndex),
  };
}

/** Where a count line's door goes (§3.2: "the destinations are fixed"). The labels are the
 *  copy pass's (HV-12); the places are the surfaces that own each number. */
export type HistoryDoorHref =
  | '/trial-exposures'
  | '/insights/trial'
  | '/insights'
  | { pathname: '/insights/[metric]'; params: { metric: string } };

export function countLineDoorHref(door: CountLineDoorKey, filter: HistoryFilter): HistoryDoorHref {
  switch (door) {
    case 'outside-trial-diet':
      // The shipped "Outside the trial diet" screen (PMD-9), reachable before only from Profile.
      return '/trial-exposures';
    case 'trial-compare':
      // Patterns' "The trial so far": the trial's own before-and-during view.
      return '/insights/trial';
    case 'symptom-compare':
      // One symptom: its Patterns detail, the window-over-window compare. All symptoms: Patterns.
      return filter.kind === 'type' && SYMPTOM_TYPES.has(filter.type as EventTypeKey)
        ? { pathname: '/insights/[metric]', params: { metric: filter.type } }
        : '/insights';
    case 'noticed-patterns':
      // H-9: what you noticed is counted on Patterns, and only there.
      return '/insights';
  }
}

// ── The bowl's line (§3.3, H-6) ─────────────────────────────────────────────────

/** Under All types and Meal only, and never under a search: the bowl is standing context
 *  for what was eaten, not a row a search found. */
export function showsBowlLine(filter: HistoryFilter, search: string | null): boolean {
  return search === null && (filter.kind === 'all' || (filter.kind === 'type' && filter.type === 'meal'));
}

/** One bowl's facts after the line's lead: *Royal Canin · Selected Protein PR, Dry · since
 *  Sep 10*. The date goes through the one formatter (H-10). */
export function bowlLineText(bowl: ActiveArrangementView, today: string): string {
  const brand = bowl.brand?.trim() ?? '';
  const product = bowl.product_name?.trim() ?? '';
  const food = brand && product ? `${brand} · ${product}` : product || brand || 'A food';
  const word = foodFormatWord(bowl.format, product);
  const since = bowl.active_from ? recordDay(bowl.active_from, today) : null;
  return `${food}${word ? `, ${word}` : ''}${since ? ` · since ${since}` : ''}`;
}

/** The line's lead: the words the shipped strip used. */
export const BOWL_LINE_LEAD = 'Always available';

// ── The whole day behind a filtered page (R-2) ─────────────────────────────────

/** Whether the page's own rows are the whole day: only under All types with no search.
 *  Noticed draws its looks from the page and builds no nodes. */
export function needsWholeDays(filter: HistoryFilter, search: string | null): boolean {
  return filter.kind !== 'noticed' && (filter.kind !== 'all' || search !== null);
}

/**
 * The nodes a filter or a search leaves on screen: an event node whose row the page showed;
 * a run whose members all show, whole; a run only some of whose members show (a search that
 * names one format of a product), as those members; and nothing else. Never re-cut: the
 * nodes were built over the whole day, so a survivor keeps every fact the day gave it.
 */
export function visibleNodesOf(nodes: readonly DayNode[], shown: ReadonlySet<string>): DayNode[] {
  const out: DayNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'event') {
      if (shown.has(node.id)) out.push(node);
      continue;
    }
    const members = node.rows.filter((r) => shown.has(r.id));
    if (members.length === node.rows.length) out.push(node);
    else out.push(...members);
  }
  return out;
}

// ── The timing lane's inputs, per day ──────────────────────────────────────────

/** A local day key's midnight, in epoch ms, or null for a malformed key. */
export function dayStartMs(day: string): number | null {
  const d = dayKeyToLocalDate(day);
  return d ? d.getTime() : null;
}

/**
 * The vomit onsets before a day that the lane's collapse must see (`lib/spineNode.ts`:
 * "collapse on the full list, then window"): those inside the episode gap before the day's
 * midnight. The same bound Home's Today card reads with (`TodayCard`), per day.
 */
export function priorOnsetsFor(
  day: string,
  onsets: readonly { ms: number; confidence: OnsetConfidence | null }[],
  gapHours: number = DEFAULT_MEAL_TIMING_CONFIG.episodeGapHours,
): { ms: number; confidence: OnsetConfidence | null }[] {
  const start = dayStartMs(day);
  if (start === null) return [];
  const from = start - gapHours * 3_600_000;
  return onsets.filter((o) => o.ms >= from && o.ms < start);
}

/** What the timing lane measures a day's vomits against, over the loaded span: the
 *  feedings, the free-fed spans and the vomit onsets (`lib/spineReads.ts`). */
export interface HistoryDayTiming {
  feedings: readonly FeedingInput[];
  freeFedSpans: readonly FreeFedSpan[];
  onsets: readonly { ms: number; confidence: OnsetConfidence | null }[];
}

/**
 * A day card's nodes: the WHOLE day through the shared pipeline (`buildDayNodes`, the one
 * Home's Today card calls; spec §5.5), then hidden by what the page showed
 * (`visibleNodesOf`). The photo fact is the row's own (`has_photo`, the month's predicate);
 * the reads are the phone's copy and the chains in flight; the timing lane gets the onsets
 * before the day inside its episode gap, so a bout across midnight is one episode here as on
 * the lane.
 */
export function historyDayNodes(args: {
  day: string;
  /** Every row of the day, morning to night (`readWholeDays`, or the page's own). */
  rows: readonly HistoryRow[];
  /** The ids the page's filter or search showed. */
  shown: ReadonlySet<string>;
  analysis: ReadonlyMap<string, SpineAnalysisRow>;
  working: ReadonlySet<string>;
  timing: HistoryDayTiming;
}): DayNode[] {
  const photographed = new Set(args.rows.filter((r) => r.has_photo).map((r) => r.id));
  const nodes = buildDayNodes(args.rows, {
    reads: { photographed, analysis: args.analysis, working: args.working },
    timings: {
      feedings: args.timing.feedings,
      freeFedSpans: args.timing.freeFedSpans,
      priorOnsets: priorOnsetsFor(args.day, args.timing.onsets),
    },
  });
  return visibleNodesOf(nodes, args.shown);
}

// ── Date-only items (§3.5, rule L) ──────────────────────────────────────────────

/** The words a bowl's change carries, the shipped marker row's (`BoundaryMarkerRow`), minus
 *  the date the day card already prints. */
export function bowlChangeText(item: Extract<DateOnlyItem, { kind: 'bowl' }>): string {
  switch (item.change) {
    case 'started':
      return `Started free-feeding ${item.foodLabel}`;
    case 'stopped':
      return `Stopped free-feeding ${item.foodLabel}`;
    case 'switched':
      return `Switched free-feeding from ${item.foodLabel} to ${item.toFoodLabel ?? 'another food'}`;
  }
}

/** A date-only item in a day card: its title and the quieter words after it. */
export function dateOnlyItemText(item: DateOnlyItem): { title: string; detail: string | null } {
  switch (item.kind) {
    case 'visit': {
      const parts = [item.reason, item.where].filter((s): s is string => !!s && s.trim().length > 0);
      return { title: 'Vet visit', detail: parts.length > 0 ? parts.join(' · ') : null };
    }
    case 'course-start':
      return { title: `${item.name} started`, detail: null };
    case 'bowl':
      return { title: bowlChangeText(item), detail: null };
  }
}

/** An item as a line under a filter names it: *Vet visit, Recheck*. */
function itemPhrase(item: DateOnlyItem): string {
  switch (item.kind) {
    case 'visit':
      return item.reason && item.reason.trim() ? `Vet visit, ${item.reason.trim()}` : 'Vet visit';
    case 'course-start':
      return `${item.name} started`;
    case 'bowl':
      return bowlChangeText(item);
  }
}

/**
 * The line a filter leaves for a day that holds only date-only items (§3.5; the mock's
 * *Wed, Sep 16 · Vet visit, Recheck · no vomit logged*). The absence is added only where
 * `listSectionsOf` says the day may carry one (a closed, logged day inside the claims).
 */
export function itemsOnlyLineText(
  section: Extract<HistorySection, { kind: 'items-only' }>,
  items: readonly DateOnlyItem[],
  filter: HistoryFilter,
  dates: HistoryDateFormat,
  courseName: string | null,
): string {
  const parts = [dates.weekday(section.day), ...items.map(itemPhrase)];
  if (section.statesAbsence) {
    const absence = absenceText(filter, courseName);
    if (absence) parts.push(absence);
  }
  return parts.join(' · ');
}

// ── The list's end, and where a landing lands ──────────────────────────────────

/**
 * *{pet}'s record starts here · Thu, May 14* (§3.12) closes the list only where it is TRUE:
 * every page is loaded and the list's last section holds the record's first day. "Here" is
 * a place in the list, so the rule reads the list, not the window: under a filter or a search
 * the list ends at the kind's first row, and the logged days before it are not drawn (gap
 * lines never start before the kind's first row, AC 10), so a line naming the record's start
 * under that card would put weeks of unshown record at "here". A window that starts later
 * ends where it starts, and says nothing about the record either.
 */
export function showsRecordStart(args: {
  recordStart: string | null;
  /** The earliest day the list's last section holds (a card's day, a run's first day). */
  lastSectionFromDay: string | null;
  allLoaded: boolean;
}): boolean {
  return args.allLoaded && args.recordStart !== null && args.lastSectionFromDay === args.recordStart;
}

/** The earliest day a section holds: its day, or its run's first day. */
export function sectionFromDay(section: HistorySection): string {
  switch (section.kind) {
    case 'day':
    case 'today-open':
    case 'items-only':
      return section.day;
    case 'unlogged':
    case 'no-match':
      return section.fromDay;
  }
}

/** The section that holds a day: its card, or the gap line whose run includes it (§3.1). */
export function sectionIndexFor(sections: readonly HistorySection[], day: string): number {
  return sections.findIndex((s) => {
    switch (s.kind) {
      case 'day':
      case 'today-open':
      case 'items-only':
        return s.day === day;
      case 'unlogged':
      case 'no-match':
        return s.fromDay <= day && day <= s.toDay;
    }
  });
}

/** A section's stable key: its day, or its run's two ends. */
export function sectionKeyOf(section: HistorySection): string {
  switch (section.kind) {
    case 'day':
    case 'today-open':
    case 'items-only':
      return `${section.kind}:${section.day}`;
    case 'unlogged':
    case 'no-match':
      return `${section.kind}:${section.fromDay}:${section.toDay}`;
  }
}

// ── The viewport (§4: a jump beyond one screen) ────────────────────────────────

/**
 * Whether a scroll the app makes may animate: never under Reduce Motion, and never across
 * more than one viewport (§4: "`false` beyond one viewport"), where a long glide is motion
 * nobody asked for.
 */
export function scrollAnimates(args: { reducedMotion: boolean; distance: number; viewport: number }): boolean {
  return !args.reducedMotion && args.viewport > 0 && Math.abs(args.distance) <= args.viewport;
}
