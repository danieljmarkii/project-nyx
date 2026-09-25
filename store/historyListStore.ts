import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { getDb } from '../lib/db';
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
import { mayCarryRead, type SpineAnalysisRow } from '../lib/spineNode';
import {
  readAnalysisCopy,
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
// (`historyRequestKey`: the pet, the day, the window's identity, the filter, the search), so
// the screen draws it only while that is still the request on screen: an old snapshot is
// never painted under a new pill. Its resolved dates are the ones the load read for that
// request; a change in the facts behind them (a first log, a visit, a trial) is a write, and
// every write reloads.
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
  /** HV-3's `historyScopeKey(scope, resolved)`: what was answered, dates included. A
   *  re-read keeps the depth scrolled to, and a landing carries on, only under the same key. */
  key: string;
  /** `historyWindowRequestKey(today, scope)`: the part of the request the header's reads
   *  depend on. A filter or search change keeps it, so the header can stay (`headerSnapshotFor`). */
  windowRequest: string;
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
  /** The phone's copy of the reads, for the loaded rows a read can sit on (HV-5). */
  analysis: ReadonlyMap<string, SpineAnalysisRow>;
  /** The rows whose copy a look has ANSWERED for (HV-6, `TodayCard` the template): only these
   *  may claim their photo, so a look that failed never draws a photo nobody read. */
  answered: ReadonlySet<string>;
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
  /** The next page, for the pages it extends: in flight, or failed (said at the foot). Keyed
   *  on the PAGES, not the snapshot object: a read landing mid-page replaces the snapshot and
   *  keeps its pages, and must neither drop the page nor orphan this state. */
  more: { of: HistoryPages; state: 'loading' | 'failed' } | null;

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

/** The part of the request every header read depends on: the pet, the day and the window's
 *  identity. The facts, courses, items, bowls and window facts are all read for exactly
 *  these; only the pages and what hangs off them depend on the filter and the search. */
export function historyWindowRequestKey(today: string, scope: HistoryScope): string {
  return JSON.stringify([scope.petId, today, windowParam(scope.window)]);
}

/**
 * The snapshot, only when it answers the scope on screen right now: the same request (pet,
 * day, window, filter, search). Everything the list, the pinned row and the strip draw from
 * the list's reads goes through this, so none of them can paint one scope's numbers under
 * another's name.
 */
export function snapshotForScope(
  snapshot: HistorySnapshot | null,
  scope: HistoryScope,
  today: string,
): HistorySnapshot | null {
  return snapshot && snapshot.request === historyRequestKey(today, scope) ? snapshot : null;
}

/**
 * The snapshot whose HEADER reads still answer the scope on screen: the same pet, day and
 * window, whatever the filter or search. While a filter or search change reads its pages,
 * the header (the count line, the bowl's line, the strip) is drawn from these, under the new
 * filter, so it never blanks and returns; the list below waits as the silhouette (C-12). They
 * are the same reads the new load makes, so no number here belongs to another scope
 * (CUL-1120): a window change asks for new facts, and the header waits with the list.
 */
export function headerSnapshotFor(
  snapshot: HistorySnapshot | null,
  scope: HistoryScope,
  today: string,
): HistorySnapshot | null {
  return snapshot && snapshot.windowRequest === historyWindowRequestKey(today, scope) ? snapshot : null;
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
 *  or one page when there is nothing to keep. From `from`'s cursor on when it is given (a
 *  load reading on to a depth the list reached while it read). */
async function readPagesThrough(
  petId: string,
  scope: DayPageScope,
  keepTo: string | null,
  from: HistoryPages | null = null,
): Promise<HistoryPages> {
  let pages: HistoryPages | null = from;
  let cursor: DayPageCursor | null = from ? from.next : null;
  for (let guard = 0; guard < MAX_LANDING_PAGES; guard++) {
    const page: DayPage = await readDayPage(petId, scope, cursor);
    pages = pages === null ? { days: page.days, span: page.span, next: page.next } : mergePages(pages, page);
    if (!pages.next || keepTo === null || !pages.span || pages.span.fromDay <= keepTo) break;
    cursor = pages.next;
  }
  return pages ?? { days: [], span: null, next: null };
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

/** The rows of these days that can carry a read: the pipeline's one gate (`mayCarryRead`,
 *  HV-6), never the rose tint, so a formed stool's read is read (CUL-1197) and a row re-typed
 *  after its read landed keeps the rose the predicate stands. */
function readableIdsIn(days: ReadonlyMap<string, readonly HistoryRow[]>): Set<string> {
  const ids = new Set<string>();
  for (const rows of days.values()) {
    for (const r of rows) if (mayCarryRead(r.event_type)) ids.add(r.id);
  }
  return ids;
}

/** What a look at the phone's copy answered: the rows it asked about and what it found, or
 *  nothing at all when the local read FAILED (`readAnalysisCopy` answers null), so "no read
 *  on this phone" and "could not look" stay two answers (CUL-1198). */
interface ReadAnswer {
  answered: ReadonlySet<string>;
  rows: ReadonlyMap<string, SpineAnalysisRow>;
}

const NO_ANSWER: ReadAnswer = { answered: new Set(), rows: new Map() };

async function readAnalysis(days: ReadonlyMap<string, readonly HistoryRow[]>): Promise<ReadAnswer> {
  const asked = readableIdsIn(days);
  const rows = await readAnalysisCopy([...asked]);
  return rows === null ? NO_ANSWER : { answered: asked, rows };
}

/** Two answers as one: the later one's rows win for the ids it answered. */
function joinAnswers(a: ReadAnswer, b: ReadAnswer): ReadAnswer {
  return { answered: new Set([...a.answered, ...b.answered]), rows: new Map([...a.rows, ...b.rows]) };
}

/**
 * A look's answer laid over the reads on screen, `TodayCard`'s rule (HV-6): the ids the look
 * answered take its answer (a missing row means "no read on this phone"); every other loaded
 * row keeps its last answer, so a look that failed changes nothing and a rose already drawn
 * stays drawn (CUL-1198). A read for a row no longer loaded (removed meanwhile) leaves.
 */
function settleReads(
  prev: Pick<HistorySnapshot, 'analysis' | 'answered'> | null,
  answer: ReadAnswer,
  loaded: ReadonlyMap<string, readonly HistoryRow[]>,
): Pick<HistorySnapshot, 'analysis' | 'answered'> {
  const present = new Set<string>();
  for (const rows of loaded.values()) for (const r of rows) present.add(r.id);
  const analysis = new Map<string, SpineAnalysisRow>();
  const answered = new Set<string>();
  if (prev) {
    for (const id of prev.answered) if (present.has(id) && !answer.answered.has(id)) answered.add(id);
    for (const [id, row] of prev.analysis) if (present.has(id) && !answer.answered.has(id)) analysis.set(id, row);
  }
  for (const id of answer.answered) if (present.has(id)) answered.add(id);
  for (const [id, row] of answer.rows) if (present.has(id)) analysis.set(id, row);
  return { analysis, answered };
}

/** Whether the pet a read was made for is still the pet on screen, read FRESH (CUL-1120). */
function stillActive(petId: string): boolean {
  return usePetStore.getState().activePet?.id === petId;
}

// ── The store ───────────────────────────────────────────────────────────────────

let loadSeq = 0;
/** Looks at the phone's copy, issued and applied. An answer yields only to a NEWER one
 *  already applied, never to one merely issued: a newer look that then fails must not throw
 *  away an older answer that carried the rose (`TodayCard`, HV-6's second adversarial pass). */
let readsIssued = 0;
let readsApplied = 0;
/**
 * The next-page read in flight, with the pages it extends. Two calls for the SAME pages share
 * one read; a call after a load replaced them never joins a read made for the old ones, which
 * could not land (a refresh or a switch mid-page would otherwise hand a landing a read that
 * changes nothing). Released by identity, never a bare clear (C-24).
 */
let moreInFlight: { of: HistoryPages; run: Promise<void> } | null = null;

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
      const same = prior !== null && prior.key === key && prior.petId === pet.id ? prior : null;
      const keepTo = same && same.pages.span ? same.pages.span.fromDay : null;
      const [facts, courses, visits, bowls, arrangements, firstPages] = await Promise.all([
        readHistoryFacts(pet.id, resolved.bounds),
        readHistoryCourses(pet.id),
        readVisitsForHistory(pet.id),
        getBoundaryMarkers(pet.id),
        getActiveArrangementsForPet(pet.id),
        readPagesThrough(pet.id, pageScope, keepTo),
      ]);
      let pages = firstPages;
      let wholeDays = await wholeDaysFor(pet.id, pages.days, scope.filter, search);
      const timingFor = (span: DayRange | null) =>
        scope.filter.kind === 'noticed' ? Promise.resolve(EMPTY_TIMING) : readTiming(pet.id, span);
      const readSeq = ++readsIssued;
      let [timing, answer] = await Promise.all([timingFor(pages.span), readAnalysis(wholeDays)]);
      // The depth to keep can grow WHILE this load reads: a landing pages the snapshot on
      // screen back to its day, or the owner scrolls on. Read on to that depth before landing,
      // so a re-read never takes back a day the list already holds (a landing would lose the
      // day it just jumped to, and a scrolling owner the rows under their thumb).
      for (let guard = 0; guard < MAX_LANDING_PAGES; guard++) {
        const now = get().snapshot;
        const reached = now && now.key === key && now.petId === pet.id && now.pages.span ? now.pages.span.fromDay : null;
        if (reached === null || !pages.next || !pages.span || pages.span.fromDay <= reached) break;
        const deeper = await readPagesThrough(pet.id, pageScope, reached, pages);
        const added = await wholeDaysFor(pet.id, deeper.days.slice(pages.days.length), scope.filter, search);
        const [deeperTiming, addedAnswer] = await Promise.all([timingFor(deeper.span), readAnalysis(added)]);
        pages = deeper;
        wholeDays = new Map([...wholeDays, ...added]);
        timing = deeperTiming;
        answer = joinAnswers(answer, addedAnswer);
        if (myId !== loadSeq || !stillActive(pet.id)) return 'superseded';
      }
      if (myId !== loadSeq || !stillActive(pet.id)) return 'superseded';
      // The reads are laid over the ones on screen NOW (a same-scope snapshot), and an answer
      // older than one already applied does not overwrite it.
      const onScreen = get().snapshot;
      const shown = onScreen && onScreen.key === key && onScreen.petId === pet.id ? onScreen : null;
      const current = readSeq < readsApplied && shown
        ? { answered: new Set([...answer.answered].filter((id) => !shown.answered.has(id))), rows: answer.rows }
        : answer;
      if (answer.answered.size > 0) readsApplied = Math.max(readsApplied, readSeq);
      const reads = settleReads(shown, current, wholeDays);
      set({
        snapshot: {
          request,
          key,
          windowRequest: historyWindowRequestKey(today, scope),
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
          analysis: reads.analysis,
          answered: reads.answered,
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
    const snap = get().snapshot;
    if (!snap || !snap.pages.next) return Promise.resolve();
    if (moreInFlight && moreInFlight.of === snap.pages) return moreInFlight.run;
    const cursor = snap.pages.next;
    const of = snap.pages;
    const run = (async () => {
      set({ more: { of, state: 'loading' } });
      try {
        const pageScope: DayPageScope = { range: snap.resolved.bounds, filter: snap.filter, search: snap.search };
        const page = await readDayPage(snap.petId, pageScope, cursor);
        const added = await wholeDaysFor(snap.petId, page.days, snap.filter, snap.search);
        const pages = mergePages(snap.pages, page);
        const [timing, addedAnswer] = await Promise.all([
          snap.filter.kind === 'noticed' ? Promise.resolve(EMPTY_TIMING) : readTiming(snap.petId, pages.span),
          readAnalysis(added),
        ]);
        // Only onto the pages it was read for: a load that replaced them (a refresh, a new
        // scope, a switch) owns the list now, and its own cursor pages it. A read landing in
        // between replaces the snapshot and keeps its pages, so the page lands on that one.
        const now = get().snapshot;
        if (!now || now.pages !== of || !stillActive(now.petId)) return;
        const wholeDays = new Map([...now.wholeDays, ...added]);
        set({
          snapshot: { ...now, pages, wholeDays, timing, ...settleReads(now, addedAnswer, wholeDays) },
          more: null,
        });
      } catch (e) {
        console.error('[history] next page failed:', e);
        if (get().snapshot?.pages === of) set({ more: { of, state: 'failed' } });
      }
    })().finally(() => {
      if (moreInFlight?.run === run) moreInFlight = null;
    });
    moreInFlight = { of, run };
    return run;
  },

  ensureDay: async (day) => {
    const first = get().snapshot;
    if (!first) return false;
    for (let guard = 0; guard < MAX_LANDING_PAGES; guard++) {
      const snap = get().snapshot;
      // The landing belongs to the scope it was asked in: a refresh of that scope carries
      // it on, while another scope or pet (a switch mid-landing) ends it, so a day asked
      // for one pet never moves another pet's list.
      if (!snap || snap.key !== first.key || snap.petId !== first.petId || !snap.pages.span) return false;
      if (snap.pages.span.fromDay <= day) return true;
      if (!snap.pages.next) return false;
      await get().loadMore();
      // The page failed: the pages did not move. Stop, never loop.
      if (get().snapshot?.pages === snap.pages) return false;
    }
    return false;
  },

  refreshReads: async () => {
    const snap = get().snapshot;
    if (!snap) return;
    const seq = ++readsIssued;
    const answer = await readAnalysis(snap.wholeDays);
    // A failed look answers nothing, and an answer older than one applied yields to it.
    if (answer.answered.size === 0 || seq < readsApplied) return;
    const now = get().snapshot;
    // Laid over whatever the snapshot on screen holds now (a page may have landed since,
    // whose reads this did not ask about), as long as it is still the same scope's.
    if (!now || now.key !== snap.key || now.petId !== snap.petId) return;
    readsApplied = seq;
    set({ snapshot: { ...now, ...settleReads(now, answer, now.wholeDays) } });
  },

  reset: () => {
    loadSeq += 1;
    moreInFlight = null;
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
