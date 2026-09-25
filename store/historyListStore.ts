import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { getDb } from '../lib/db';
import { eventTintCategory } from '../lib/dayEvents';
import { loadTrialPredicateFacts } from '../lib/dietTrialFacts';
import {
  getActiveArrangementsForPet,
  getBoundaryMarkers,
  type ActiveArrangementView,
} from '../lib/feedingArrangements';
import {
  dateOnlyItemsOf,
  type DateOnlyItem,
  type DayRange,
  type HistoryCourse,
  type HistoryFacts,
  type HistoryFilter,
} from '../lib/historyDays';
import {
  readDayPage,
  readHistoryCourses,
  readHistoryFacts,
  readRecordFirstDay,
  readWholeDays,
  type DayPage,
  type DayPageCursor,
  type DayPageScope,
  type HistoryDay,
  type HistoryRow,
} from '../lib/historyQueries';
import { dayStartMs, needsWholeDays, type HistoryDayTiming } from '../lib/historyScreen';
import {
  resolveWindow,
  windowParam,
  windowTrialOf,
  type ResolvedWindow,
  type WindowFacts,
} from '../lib/historyWindows';
import { DEFAULT_MEAL_TIMING_CONFIG } from '../lib/mealTiming';
import type { SpineAnalysisRow } from '../lib/spineNode';
import {
  readAnalysisRows,
  readFeedingsSince,
  readFreeFedSpans,
  readVomitOnsetsSince,
} from '../lib/spineReads';
import { readVisitsForHistory } from '../lib/vetVisits';
import { readLatestVisitBefore } from '../lib/visitWindow';
import {
  effectiveSearch,
  filterId,
  historyScopeKey,
  useHistoryScopeStore,
  type HistoryScope,
} from './historyScopeStore';
import { usePetStore, type Pet } from './petStore';

// What History v2's list has read for the scope on screen (CUL-1164 / HV-7;
// docs/nyx-history-v2-requirements.md §3.2–3.5, §3.12, §5.2).
//
// ── ONE READ BEHIND EVERY NUMBER (R-1, AC 1, AC 5) ──────────────────────────────
// A load reads, in order: the window's facts (the record's first day, the trial, the last
// visit), the window those resolve to (HV-3), then everything the screen draws for it: the
// facts every count sums (HV-4), the date-only items, the bowl, the first page, the whole
// days behind a filtered page, and the timing lane's and the reads' inputs. It lands as ONE
// snapshot, so the count line, the day headers and the strip can never come from two reads
// (and the pinned row's counts, HV-9, can read the same snapshot). A re-read replaces the
// whole snapshot at once; a removal, a write, a sync tick and a pull all re-derive together.
//
// ── A READ THAT ANSWERS FOR ANOTHER PET OR SCOPE IS DROPPED (CUL-1120, AC 12) ───
// Two checks, protecting different things, as v1's loaders hold them: a monotonic load id
// stops an older load from overwriting a newer one, and the active pet read FRESH at commit
// stops a load a switch overtook. And a snapshot is stamped with the request it answers
// (`historyRequestKey`: the pet, the day, the window's identity, the filter, the search) and
// with HV-3's `historyScopeKey` (the resolved dates), so the screen draws it only while both
// are still the ones on screen: an old snapshot is never painted under a new pill.
//
// ── THE WHOLE DAY BEHIND A FILTER (R-2, AC 9) ───────────────────────────────────
// A filtered page tells the list WHICH rows show; `readWholeDays` supplies each shown day's
// every row, so the shared row's nodes are built as the day built them and a filter only
// hides (`lib/historyScreen.ts`, `visibleNodesOf`).
//
// ── ACCOUNT STATE IN MEMORY ─────────────────────────────────────────────────────
// The snapshot holds one pet's rows. It follows the pet store (the subscription at the foot,
// the scope store's own mechanism): a switch, the fallback when the active pet is archived,
// and sign-out's `reset()` each drop it inside the pet store's own update, so no frame and no
// later session can see another pet's record from here.

/** The pages read so far for one scope, merged: whole local days, newest first. */
export interface HistoryPages {
  /** The rows the scope shows, by day, newest day first; morning to night inside a day. */
  days: readonly HistoryDay[];
  /** The days the pages account for (every day in it without a row holds none). */
  span: DayRange | null;
  /** The next page, or null once the window's first day is reached. */
  next: DayPageCursor | null;
}

/** What the timing lane measures against, over the loaded days (`lib/spineReads.ts`). */
export type HistoryTiming = HistoryDayTiming;

/** Everything the list draws for one scope, read together. */
export interface HistorySnapshot {
  /** `historyRequestKey(today, scope)`: what was asked. */
  request: string;
  /** HV-3's `historyScopeKey(scope, resolved)`: what was answered, dates included. */
  key: string;
  petId: string;
  /** The local day the whole snapshot was read for. */
  today: string;
  filter: HistoryFilter;
  search: string | null;
  windowFacts: WindowFacts;
  resolved: ResolvedWindow;
  facts: HistoryFacts;
  courses: readonly HistoryCourse[];
  /** Date-only items by day, over the window (`dateOnlyItemsOf`). */
  items: ReadonlyMap<string, DateOnlyItem[]>;
  /** The bowls down now: the bowl's line (§3.3). */
  arrangements: readonly ActiveArrangementView[];
  pages: HistoryPages;
  /** Every row of each shown day, whatever the filter (R-2). Empty under Noticed, whose
   *  looks are drawn straight from the page. */
  wholeDays: ReadonlyMap<string, readonly HistoryRow[]>;
  timing: HistoryTiming;
  /** The phone's copy of the reads, for the loaded days' symptom rows (HV-5). */
  analysis: ReadonlyMap<string, SpineAnalysisRow>;
}

/** The pet a load reads for: the trial predicate needs its species (route rules) and sex. */
export type HistoryListPet = Pick<Pet, 'id' | 'name' | 'species' | 'sex'>;

export interface HistoryLoadRequest {
  pet: HistoryListPet;
  scope: HistoryScope;
  /** `toLocalDayKey(new Date())`, derived once by the caller for the whole load. */
  today: string;
}

/** How a load ended: it drew, it failed (said on screen, C-12), or a newer one replaced it. */
export type HistoryLoadOutcome = 'drawn' | 'failed' | 'superseded';

interface HistoryListState {
  /** The screen's local day (`toLocalDayKey(new Date())`): one clock for the list, the pinned
   *  row and the strip, moved by the list at midnight, on focus and on foreground. Null until
   *  the list has mounted. */
  today: string | null;
  snapshot: HistorySnapshot | null;
  /** The request whose latest load failed. Cleared when a load for it starts again. */
  failedRequest: string | null;
  /** The next page, for the snapshot it extends: in flight, or failed (said at the foot). */
  more: { of: HistorySnapshot; state: 'loading' | 'failed' } | null;

  setToday: (today: string) => void;
  load: (request: HistoryLoadRequest) => Promise<HistoryLoadOutcome>;
  /** The next page of the snapshot on screen. Joins a page already in flight. */
  loadMore: () => Promise<void>;
  /** Page until `day` is loaded (a landing further back than the pages reach). True when
   *  the loaded span now holds it. */
  ensureDay: (day: string) => Promise<boolean>;
  /** Re-read the phone's copy of the reads for the loaded rows (a read landed). */
  refreshReads: () => Promise<void>;
  reset: () => void;
}

/**
 * What a load is asked for, before any read: the pet, the day, the window's IDENTITY, the
 * filter and the search. The screen draws a snapshot only while its request key is the
 * current one (C-12, CUL-1120).
 */
export function historyRequestKey(today: string, scope: HistoryScope): string {
  return JSON.stringify([scope.petId, today, windowParam(scope.window), filterId(scope.filter), effectiveSearch(scope)]);
}

/**
 * The snapshot, only when it answers the scope on screen right now: the same request (pet,
 * day, window, filter, search) and the same resolved dates. Everything the list, the pinned
 * row and the strip draw from the list's reads goes through this, so none of them can paint
 * one scope's numbers under another's name.
 */
export function snapshotForScope(
  snapshot: HistorySnapshot | null,
  scope: HistoryScope,
  today: string,
): HistorySnapshot | null {
  if (!snapshot || snapshot.request !== historyRequestKey(today, scope)) return null;
  return snapshot.key === historyScopeKey(scope, snapshot.resolved) ? snapshot : null;
}

// ── The reads ───────────────────────────────────────────────────────────────────

const MS_PER_HOUR = 3_600_000;
const EMPTY_TIMING: HistoryTiming = { feedings: [], freeFedSpans: [], onsets: [] };
/** A landing pages back at most this far: past it, the day is not reachable by paging. */
const MAX_LANDING_PAGES = 400;

/** The window facts for one pet and one `today`, all read for the same day (HV-3's
 *  contract: every field of `WindowFacts` derives from one `today`). */
async function readWindowFacts(pet: HistoryListPet, today: string): Promise<WindowFacts> {
  const [firstRecordDay, trial, sinceVisit] = await Promise.all([
    readRecordFirstDay(pet.id),
    loadTrialPredicateFacts({ id: pet.id, name: pet.name, species: pet.species, sex: pet.sex }),
    readLatestVisitBefore(getDb(), pet.id, today),
  ]);
  return {
    petId: pet.id,
    today,
    firstRecordDay,
    // Unscoped facts, as `windowTrialOf` requires. Facts the trial loader could not compute
    // carry no evidence window, so the trial window is simply not offered (never dated off
    // a guess); the loader has already said why in the log.
    trial: trial ? windowTrialOf(trial.trial, trial.facts ?? { exposureRange: null }, today) : null,
    sinceVisit,
  };
}

/** Pages until the span reaches `keepTo` (a re-read keeps the depth the owner scrolled to),
 *  or one page when there is nothing to keep. */
async function readPagesThrough(petId: string, scope: DayPageScope, keepTo: string | null): Promise<HistoryPages> {
  let pages: HistoryPages = { days: [], span: null, next: null };
  let cursor: DayPageCursor | null = null;
  for (let guard = 0; guard < MAX_LANDING_PAGES; guard++) {
    const page: DayPage = await readDayPage(petId, scope, cursor);
    pages = guard === 0 ? { days: page.days, span: page.span, next: page.next } : mergePages(pages, page);
    if (!pages.next || keepTo === null || !pages.span || pages.span.fromDay <= keepTo) break;
    cursor = pages.next;
  }
  return pages;
}

/** A later page appended to the ones before it: its days after theirs, the span extended
 *  down to its first day. Pages are contiguous by construction (the cursor is a day). */
export function mergePages(pages: HistoryPages, page: DayPage): HistoryPages {
  const span =
    pages.span && page.span
      ? { fromDay: page.span.fromDay, toDay: pages.span.toDay }
      : (pages.span ?? page.span);
  return { days: [...pages.days, ...page.days], span, next: page.next };
}

/** The whole day behind each shown day (R-2): the page's own rows when they are the whole
 *  day, a read of every row otherwise, and nothing under Noticed. */
async function wholeDaysFor(
  petId: string,
  days: readonly HistoryDay[],
  filter: HistoryFilter,
  search: string | null,
): Promise<Map<string, readonly HistoryRow[]>> {
  if (filter.kind === 'noticed') return new Map();
  if (!needsWholeDays(filter, search)) return new Map(days.map((d) => [d.day, d.rows]));
  return readWholeDays(
    petId,
    days.map((d) => d.day),
  );
}

/** The timing lane's inputs over the loaded span: the feedings inside the lookback before
 *  its first day, the free-fed spans, and the vomit onsets inside the episode gap before it
 *  (Home's Today card reads the same three for one day). */
async function readTiming(petId: string, span: DayRange | null): Promise<HistoryTiming> {
  const start = span ? dayStartMs(span.fromDay) : null;
  if (start === null) return EMPTY_TIMING;
  const config = DEFAULT_MEAL_TIMING_CONFIG;
  const [feedings, freeFedSpans, onsets] = await Promise.all([
    readFeedingsSince(petId, new Date(start - config.feedingLookbackHours * MS_PER_HOUR).toISOString()),
    readFreeFedSpans(petId),
    readVomitOnsetsSince(petId, new Date(start - config.episodeGapHours * MS_PER_HOUR).toISOString()),
  ]);
  return { feedings, freeFedSpans, onsets };
}

/** The phone's copy of the reads for these days' symptom rows. Never rejects: a failed local
 *  read is an empty map, which the row draws as unread, never as calm (HV-5). */
function readAnalysis(days: ReadonlyMap<string, readonly HistoryRow[]>): Promise<Map<string, SpineAnalysisRow>> {
  const ids: string[] = [];
  for (const rows of days.values()) {
    for (const r of rows) if (eventTintCategory(r.event_type) === 'symptom') ids.push(r.id);
  }
  return readAnalysisRows(ids);
}

/** Whether the pet a read was made for is still the pet on screen, read FRESH (CUL-1120). */
function stillActive(petId: string): boolean {
  return usePetStore.getState().activePet?.id === petId;
}

// ── The store ───────────────────────────────────────────────────────────────────

let loadSeq = 0;
let moreInFlight: Promise<void> | null = null;

export const useHistoryListStore = create<HistoryListState>((set, get) => ({
  today: null,
  snapshot: null,
  failedRequest: null,
  more: null,

  setToday: (today) => {
    if (get().today !== today) set({ today });
  },

  load: async ({ pet, scope, today }) => {
    // A scope that is not this pet's is a caller's race (the pet store moved first); the
    // load it would make is for nobody on screen.
    if (scope.petId !== pet.id) return 'superseded';
    const request = historyRequestKey(today, scope);
    const myId = ++loadSeq;
    // A retry starts clean: a load that succeeds takes the failure down, one that fails puts
    // it back (v1's rule, per attempt, not per mount).
    if (get().failedRequest === request) set({ failedRequest: null });
    try {
      const windowFacts = await readWindowFacts(pet, today);
      const resolved = resolveWindow(scope.window, windowFacts);
      const key = historyScopeKey(scope, resolved);
      const search = effectiveSearch(scope);
      const pageScope: DayPageScope = { range: resolved.bounds, filter: scope.filter, search };
      // A re-read of the scope on screen keeps the depth the owner scrolled to, so a sync
      // tick or a removal never snaps a long list back to its first page.
      const prior = get().snapshot;
      const keepTo = prior && prior.key === key && prior.pages.span ? prior.pages.span.fromDay : null;
      const [facts, courses, visits, bowls, arrangements, pages] = await Promise.all([
        readHistoryFacts(pet.id, resolved.bounds),
        readHistoryCourses(pet.id),
        readVisitsForHistory(pet.id),
        getBoundaryMarkers(pet.id),
        getActiveArrangementsForPet(pet.id),
        readPagesThrough(pet.id, pageScope, keepTo),
      ]);
      const wholeDays = await wholeDaysFor(pet.id, pages.days, scope.filter, search);
      const [timing, analysis] = await Promise.all([
        scope.filter.kind === 'noticed' ? Promise.resolve(EMPTY_TIMING) : readTiming(pet.id, pages.span),
        readAnalysis(wholeDays),
      ]);
      if (myId !== loadSeq || !stillActive(pet.id)) return 'superseded';
      set({
        snapshot: {
          request,
          key,
          petId: pet.id,
          today,
          filter: scope.filter,
          search,
          windowFacts,
          resolved,
          facts,
          courses,
          items: dateOnlyItemsOf({ visits, courses, bowls, range: resolved.bounds }),
          arrangements,
          pages,
          wholeDays,
          timing,
          analysis,
        },
        failedRequest: null,
        more: null,
      });
      return 'drawn';
    } catch (e) {
      // Logged whoever it answered for (no silent failures); only the newest load, for the
      // pet on screen, may put the screen in its failed state.
      console.error('[history] load failed:', e);
      if (myId !== loadSeq || !stillActive(pet.id)) return 'superseded';
      set({ failedRequest: request });
      return 'failed';
    }
  },

  loadMore: () => {
    if (moreInFlight) return moreInFlight;
    const snap = get().snapshot;
    if (!snap || !snap.pages.next) return Promise.resolve();
    const cursor = snap.pages.next;
    const run = (async () => {
      set({ more: { of: snap, state: 'loading' } });
      try {
        const pageScope: DayPageScope = { range: snap.resolved.bounds, filter: snap.filter, search: snap.search };
        const page = await readDayPage(snap.petId, pageScope, cursor);
        const added = await wholeDaysFor(snap.petId, page.days, snap.filter, snap.search);
        const pages = mergePages(snap.pages, page);
        const [timing, addedAnalysis] = await Promise.all([
          snap.filter.kind === 'noticed' ? Promise.resolve(EMPTY_TIMING) : readTiming(snap.petId, pages.span),
          readAnalysis(added),
        ]);
        // Only onto the snapshot it was read for: a load that replaced it (a refresh, a new
        // scope, a switch) owns the list now, and its own cursor pages it.
        if (get().snapshot !== snap || !stillActive(snap.petId)) return;
        set({
          snapshot: {
            ...snap,
            pages,
            wholeDays: new Map([...snap.wholeDays, ...added]),
            timing,
            analysis: new Map([...snap.analysis, ...addedAnalysis]),
          },
          more: null,
        });
      } catch (e) {
        console.error('[history] next page failed:', e);
        if (get().snapshot === snap) set({ more: { of: snap, state: 'failed' } });
      }
    })().finally(() => {
      moreInFlight = null;
    });
    moreInFlight = run;
    return run;
  },

  ensureDay: async (day) => {
    for (let guard = 0; guard < MAX_LANDING_PAGES; guard++) {
      const snap = get().snapshot;
      if (!snap || !snap.pages.span) return false;
      if (snap.pages.span.fromDay <= day) return true;
      if (!snap.pages.next) return false;
      await get().loadMore();
      // The page failed, or a load replaced the snapshot mid-page: stop, never loop.
      if (get().snapshot === snap) return false;
    }
    return false;
  },

  refreshReads: async () => {
    const snap = get().snapshot;
    if (!snap) return;
    const analysis = await readAnalysis(snap.wholeDays);
    const now = get().snapshot;
    // A read only ever lands, so the fresh answer is laid over whatever the snapshot on
    // screen holds now, as long as it is still the same scope's.
    if (!now || now.key !== snap.key || now.petId !== snap.petId) return;
    set({ snapshot: { ...now, analysis: new Map([...now.analysis, ...analysis]) } });
  },

  reset: () => {
    loadSeq += 1;
    set({ snapshot: null, failedRequest: null, more: null });
  },
}));

/**
 * The snapshot for the scope on screen, or null while it has not answered (the pending
 * state: a skeleton, never another scope's numbers, C-12). The one way a surface reads the
 * list's reads, so the count line, the pinned row's counts and the strip agree (AC 1).
 */
export function useHistorySnapshot(): HistorySnapshot | null {
  const snapshot = useHistoryListStore((s) => s.snapshot);
  const today = useHistoryListStore((s) => s.today);
  const scope = useHistoryScopeStore(
    useShallow((s) => ({
      petId: s.petId,
      filter: s.filter,
      window: s.window,
      searchOpen: s.searchOpen,
      searchText: s.searchText,
      landedDay: s.landedDay,
      stripWeek: s.stripWeek,
    })),
  );
  return today === null ? null : snapshotForScope(snapshot, scope, today);
}

/**
 * Follow the active pet: a switch, the archived-pet fallback and sign-out's `reset()` drop
 * the snapshot inside the pet store's own update (the header). The superseding bump makes a
 * load still in flight for the old pet land nowhere.
 */
usePetStore.subscribe((petState) => {
  const petId = petState.activePet?.id ?? null;
  const snap = useHistoryListStore.getState().snapshot;
  if (snap && snap.petId !== petId) useHistoryListStore.getState().reset();
});
