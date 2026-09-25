// The list (History v2, HV-7 / CUL-1164; spec §3.1–3.5, §3.10–3.12, §5.2; round 5 of the
// mock).
//
// A `SectionList` of whole local days, newest first. Its header scrolls away with the list
// (§3.1): the count line, the bowl's line and the week strip (HV-8's slot). Its sections are
// HV-4's `listSectionsOf`: a day card (two cells, the header sticky under the pinned row,
// H-3 b), today's open card, a filter's items line, and the gap lines. Every number is the
// list store's one snapshot (`store/historyListStore.ts`), and every word about a number is
// `lib/historyDays.ts`'s.
//
// ── THE QUIET STATES (§3.12, C-12) ───────────────────────────────────────────────
// A read that has not answered is the list's silhouette, never an empty record; a failed read
// is the shipped copy and a way back, with no strip and no count line; a new account is the
// shipped first-log line under the strip; a filter or a search with no match says so; the
// list ends by naming where the record starts; the next page is one skeleton row at the foot.
// The snapshot is drawn only while it answers the scope on screen (`snapshotForScope`), so a
// scope change, a pet switch or midnight shows the silhouette until the new read lands, never
// the old rows under the new pill (CUL-1120). A filter or a search change keeps the HEADER:
// its reads are the window's, the same ones the new load makes (`headerSnapshotFor`), so the
// count line, the bowl's line and the strip redraw under the new filter at once and only the
// days below wait. A window change, a pet switch or midnight asks for new facts, and the
// header waits with them. With no pet at all there is no read to wait for, so the screen is
// the first-log line rather than a silhouette that never ends (v1's rule).
//
// ── WHAT RE-DERIVES THE COUNTS (AC 5) ────────────────────────────────────────────
// One reload, whole: on focus (a removal on the record screen lands here), on the sync tick
// (another device, and a per-incident read claimed or landed, `lib/analysis.ts`), on a write
// through the Today store while History is on screen (a log, an Undo), and on a pull. A
// reload of the same scope keeps the depth the owner scrolled to.
//
// ── MOVING THE VIEWPORT (§3.1, §4) ───────────────────────────────────────────────
//   • A landing (a strip tap, a doorway) is consumed from the scope store in ONE step and
//     held in a ref (C-22), waits for the snapshot, pages back until the day is loaded, then
//     JUMPS to the day's card or the gap line that holds it: a state, not an animation. The
//     outline stays until the owner's own scroll (`onScrollBeginDrag`), which a scroll the
//     app makes never fires.
//   • A second tap on the History tab returns to today: the strip back to this week, the
//     landed state cleared, the list to its top. It glides only within one viewport and never
//     under Reduce Motion (read at the tap, CUL-1123).
//   • A new request (a filter, a window, a search, a pet, a new day) resets the list to its
//     top without animating it: its content is replaced, and at midnight so is every window.
//
// ── MOTION AND FOCUS (HV-10 / CUL-1167; spec §4, every row of its table) ─────────
//   • The first paint: when the first read for a MOUNT IDENTITY (pet · filter · window · the
//     day the list opens on, `paintIdentityOf`) answers, every day card on that first frame
//     draws its thread down once (`ThreadDraw`). The PAINT LEDGER (`createPaintLedger`) is
//     opened in the render that first draws the snapshot and seals itself after the commit
//     in which the first card claimed (the list mounts its cells a batch after an empty-to-
//     full data change, so "the first frame" is the cards', not this render's); the owner's
//     own scroll seals it too. So exactly the cards on that frame draw, and a card the owner
//     scrolls to later, or a card the list unmounts and mounts again, never does. A reload
//     of the same identity draws nothing.
//   • A landing, with motion on, draws its day once more after the jump (`ledger.land`).
//   • A run opens in place on every card (`openInPlace`).
//   • A removal: the record screen's confirm removes the row through the shared reversal,
//     which leaves a notice (`lib/removalNotice.ts`); on coming back the list takes the
//     notices for the rows it draws, fades them out (`leaving`, the fold's 180ms), then takes
//     them out under `FOLD_LAYOUT` (the box closes over 300ms) and re-reads. Under Reduce
//     Motion they are gone at once. Nothing folds for a row that left for any other reason.
//   • VoiceOver: a landing, a removal and the re-press each move focus to a day's header
//     (or the gap line holding the day), through one pending request that the header's own
//     mount fulfils when the list has not drawn it yet. The owner's own scroll cancels it.
//   • Reduce Motion is read at the moment of each move (`reducedMotionNow()`), and is known
//     before the first frame (CUL-1123), so nothing starts and then snaps.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  LayoutAnimation,
  RefreshControl,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { theme } from '../../constants/theme';
import { analysisChainOutstanding, awaitAnalysisChain, watchAnalysisRow } from '../../lib/analysis';
import { focusAccessibility } from '../../lib/a11yFocus';
import { takeRemovals } from '../../lib/removalNotice';
import { windowParam } from '../../lib/historyWindows';
import type { DayNode } from '../../lib/dayNodes';
import { HISTORY_V2_SCROLL_INSET } from '../../lib/fabFootprint';
import {
  countLineOf,
  dayFactsOn,
  firstDayFor,
  gapLineText,
  listSectionsOf,
  type HistoryCourse,
  type HistoryFilter,
  type HistorySection,
} from '../../lib/historyDays';
import { SEARCH_READS_NOTES, type HistoryRow } from '../../lib/historyQueries';
import {
  BOWL_LINE_LEAD,
  LANDING_RETRIES,
  LANDING_RETRY_MS,
  bowlLineText,
  countLineWindowOf,
  filterQuietStateOf,
  foldableRowsOf,
  historyDatesFor,
  itemsOnlyLineText,
  historyNodesByDay,
  paintIdentityOf,
  rePressFocusDay,
  scrollAnimates,
  sectionFromDay,
  sectionIndexFor,
  sectionKeyOf,
  showsBowlLine,
  showsRecordStart,
  trialRangeOf,
  type QuietState,
} from '../../lib/historyScreen';
import { recordWeekday } from '../../lib/recordDates';
import { mayCarryRead } from '../../lib/spineNode';
import { readAnalysisRows } from '../../lib/spineReads';
import { syncNow } from '../../lib/sync';
import { toLocalDayKey } from '../../lib/utils';
import { useEventStore } from '../../store/eventStore';
import {
  headerSnapshotFor,
  historyRequestKey,
  snapshotForScope,
  useHistoryListStore,
  type HistoryLoadOutcome,
  type HistorySnapshot,
} from '../../store/historyListStore';
import { effectiveSearch, filterId, useHistoryScopeStore, type HistoryScope } from '../../store/historyScopeStore';
import { usePetStore } from '../../store/petStore';
import { reducedMotionNow } from '../../store/reducedMotionStore';
import { useSnackbarStore } from '../../store/snackbarStore';
import { useSyncStore } from '../../store/syncStore';
import { FOLD_LAYOUT, FOLD_MOTION } from '../motion/foldMotion';
import { createPaintLedger } from '../motion/threadMotion';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import { ThemedText } from '../ui/ThemedText';
import { CountLine } from './CountLine';
import { DayCardBody, DayCardHeader, TODAY_NOTHING_YET } from './DayCard';
import { GapLine, ItemsLine, RecordStartLine } from './GapLine';
import { WeekStrip } from './WeekStrip';

// ── Copy (placeholders for HV-12's pass, the shipped strings where they exist) ─────

export const HISTORY_EMPTY_TITLE = 'Nothing logged yet';
export const historyEmptyBody = (pet: string) =>
  `Tap + anywhere to log ${pet}'s first food or symptom. Everything you log builds up here.`;
export const HISTORY_ERROR_TITLE = "Couldn't load history";
export const historyErrorBody = (pet: string) => `Something went wrong loading ${pet}'s history.`;
export const HISTORY_RETRY = 'Try again';
export const historyNoSearchMatchTitle = (word: string) => `Nothing matches “${word}”`;
/** Where search looks (§3.12): the notes clause only once notes are searched (CUL-848). */
export const HISTORY_SEARCH_LOOKS = SEARCH_READS_NOTES
  ? 'Search looks in food and medicine names and in your notes.'
  : 'Search looks in food and medicine names.';
export const historyMoreFailed = (pet: string) => `Couldn't load more of ${pet}'s history.`;
export const HISTORY_REFRESH_FAILED = "Couldn't refresh history.";
export const recordStartText = (pet: string, day: string) => `${pet}'s record starts here · ${day}`;

/** A list section: one HV-4 section, drawn as a header cell (day cards) and one body cell. */
interface ListSection {
  key: string;
  model: HistorySection;
  data: readonly HistorySection[];
}

/** The slice of the tab navigator this list needs to hear a History-tab re-tap (Home's). */
type TabPressNavigation = {
  isFocused: () => boolean;
  addListener: (event: 'tabPress', callback: () => void) => () => void;
};

const NO_ROWS: readonly HistoryRow[] = [];
const NO_NODES: readonly DayNode[] = [];
const NO_NODES_BY_DAY: ReadonlyMap<string, DayNode[]> = new Map();
const NO_OPEN: ReadonlySet<string> = new Set();

function courseOf(snapshot: HistorySnapshot, filter: HistoryFilter = snapshot.filter): HistoryCourse | null {
  return filter.kind === 'course' ? (snapshot.courses.find((c) => c.key === filter.courseKey) ?? null) : null;
}

/** A filter that left the list empty (§3.12): the record's fact, never the filter's fault.
 *  Whether the kind was ever logged is read over the whole record (`FirstDays`); a course
 *  asks its first DOSE, never its span, which a regimen's start opens with no dose logged;
 *  a course that has not loaded cannot say, so only the window form is claimed. */
function filterQuietStateFor(snapshot: HistorySnapshot): QuietState {
  const { filter, facts, today } = snapshot;
  const course = courseOf(snapshot);
  const everLogged =
    filter.kind === 'course'
      ? course === null
        ? null
        : course.firstDoseDay !== null
      : firstDayFor(facts.firsts, filter, null) !== null;
  return filterQuietStateOf({
    filter,
    everLogged,
    todayOnly: facts.range.fromDay === today && facts.range.toDay === today,
    courseName: course?.name ?? null,
  });
}

/** The loaded rows a read can sit on: the pipeline's one gate (`mayCarryRead`, HV-6), so a
 *  formed stool's read is watched though a formed stool is no symptom (CUL-1197). */
function readableIdsOf(snapshot: HistorySnapshot | null): string {
  if (!snapshot) return '';
  const ids: string[] = [];
  for (const rows of snapshot.wholeDays.values()) {
    for (const r of rows) if (mayCarryRead(r.event_type)) ids.push(r.id);
  }
  return ids.sort().join('|');
}

export function HistoryList() {
  const activePet = usePetStore((s) => s.activePet);
  const petName = activePet?.name?.trim() || 'your pet';

  const scopePetId = useHistoryScopeStore((s) => s.petId);
  const filter = useHistoryScopeStore((s) => s.filter);
  const windowKey = useHistoryScopeStore((s) => s.window);
  const searchOpen = useHistoryScopeStore((s) => s.searchOpen);
  const searchText = useHistoryScopeStore((s) => s.searchText);
  const landedDay = useHistoryScopeStore((s) => s.landedDay);
  const stripWeek = useHistoryScopeStore((s) => s.stripWeek);
  const landTick = useHistoryScopeStore((s) => s.landTick);
  const scope = useMemo<HistoryScope>(
    () => ({ petId: scopePetId, filter, window: windowKey, searchOpen, searchText, landedDay, stripWeek }),
    [scopePetId, filter, windowKey, searchOpen, searchText, landedDay, stripWeek],
  );

  // ── Today: the screen's one clock ──
  const [today, setToday] = useState(() => toLocalDayKey(new Date()));
  const refreshToday = useCallback(() => setToday(toLocalDayKey(new Date())), []);
  // Published in the same commit, before paint: the pinned row reads its record for this day
  // (`useHistoryToday`) and the strip takes it as a prop, so neither draws a frame on the
  // other side of midnight from the count line.
  useLayoutEffect(() => {
    useHistoryListStore.getState().setToday(today);
  }, [today]);
  useEffect(() => {
    // A screen left open across midnight moves with it (HV-3: every window fact is
    // recomputed for the new day, and a read made before midnight is dropped after it).
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    const timer = setTimeout(refreshToday, nextMidnight - now.getTime() + 1_000);
    return () => clearTimeout(timer);
  }, [today, refreshToday]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshToday();
    });
    return () => sub.remove();
  }, [refreshToday]);

  // ── The one read ────────────────────────────────────────────────────────────────
  const request = historyRequestKey(today, scope);
  const rawSnapshot = useHistoryListStore((s) => s.snapshot);
  const failedRequest = useHistoryListStore((s) => s.failedRequest);
  const more = useHistoryListStore((s) => s.more);
  const snapshot = snapshotForScope(rawSnapshot, scope, today);
  const failed = snapshot === null && failedRequest === request;
  // The header's reads, through a filter or search change (the header comment). Drawn under
  // the filter and search ON SCREEN, which are the snapshot's own whenever it answers.
  const headerSnap = snapshot ?? (failed ? null : headerSnapshotFor(rawSnapshot, scope, today));
  const shownSearch = effectiveSearch(scope);

  const latest = useRef({ activePet, scope, today });
  latest.current = { activePet, scope, today };
  const reload = useCallback((): Promise<HistoryLoadOutcome> => {
    const { activePet: pet, scope: sc, today: day } = latest.current;
    if (!pet || sc.petId !== pet.id) return Promise.resolve('superseded');
    return useHistoryListStore.getState().load({ pet, scope: sc, today: day });
  }, []);

  const listRef = useRef<SectionList<HistorySection, ListSection>>(null);
  const scrollY = useRef(0);
  const viewport = useRef(0);

  // ── Focus (§4's focus column) ───────────────────────────────────────────────────
  // Every node VoiceOver can be sent to, by section, with the days it holds: a day card's
  // header, or the line holding a gap or a day's items. A request waits here until a node
  // holding its day is mounted (a jump far down draws the day a frame after it).
  const focusTargets = useRef(new Map<string, { from: string; to: string; node: View }>());
  const focusRefs = useRef(new Map<string, (node: View | null) => void>());
  const pendingFocus = useRef<string | null>(null);
  const tryFocus = useCallback(() => {
    const day = pendingFocus.current;
    if (day === null) return;
    for (const t of focusTargets.current.values()) {
      if (t.from <= day && day <= t.to) {
        pendingFocus.current = null;
        focusAccessibility(t.node);
        return;
      }
    }
  }, []);
  const requestFocus = useCallback(
    (day: string | null) => {
      pendingFocus.current = day;
      tryFocus();
    },
    [tryFocus],
  );
  /** One stable ref callback per section, so a render never detaches and re-attaches it. */
  const focusRefFor = useCallback(
    (key: string, from: string, to: string) => {
      let ref = focusRefs.current.get(key);
      if (!ref) {
        ref = (node: View | null) => {
          if (node === null) {
            focusTargets.current.delete(key);
            return;
          }
          focusTargets.current.set(key, { from, to, node });
          tryFocus();
        };
        focusRefs.current.set(key, ref);
      }
      return ref;
    },
    [tryFocus],
  );

  // ── The first paint's ledger (the header) ───────────────────────────────────────
  const ledger = useRef(createPaintLedger()).current;
  const [landDraw, setLandDraw] = useState(0);

  // ── A removal's fold ────────────────────────────────────────────────────────────
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(NO_OPEN);
  const [gone, setGone] = useState<ReadonlySet<string>>(NO_OPEN);
  const foldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelFold = useCallback(() => {
    if (foldTimer.current !== null) clearTimeout(foldTimer.current);
    foldTimer.current = null;
  }, []);
  useEffect(() => cancelFold, [cancelFold]);

  // A new scope: read it, close every run, and start at the top without a glide (§4).
  const [openRuns, setOpenRuns] = useState<ReadonlySet<string>>(NO_OPEN);
  useEffect(() => {
    setOpenRuns(NO_OPEN);
    // Nothing from the old list carries over: no fold half done, no focus waiting on a
    // day of the old scope.
    cancelFold();
    setLeaving(NO_OPEN);
    setGone(NO_OPEN);
    pendingFocus.current = null;
    // A new request REPLACES the list's content, so the viewport goes back to its top in the
    // same instant, with nothing to glide across (§4: "resets the list without animating the
    // viewport"). Midnight is one: every window moves with the day, and the list waits for
    // the new day's read as the silhouette, so there is no place to leave the owner in.
    listRef.current?.getScrollResponder()?.scrollTo({ y: 0, animated: false });
    void reload();
  }, [request, reload, cancelFold]);

  // Focus: a removal or an edit on the record screen lands here. The mount's own focus is
  // the request effect's read, so the first is skipped. A row the owner just removed folds
  // away first (§4 "Remove a row"), and the read that re-derives every count follows it.
  const focusedOnce = useRef(false);
  const foldable = useRef<ReadonlyMap<string, string>>(new Map());
  const foldAway = useCallback(
    (ids: string[], day: string) => {
      const finish = () => {
        foldTimer.current = null;
        setLeaving(NO_OPEN);
        setGone(new Set(ids));
        // The day's header, or the line that holds the day once it has nothing left (§4).
        requestFocus(day);
        refreshToday();
        void reload();
      };
      if (reducedMotionNow()) {
        finish();
        return;
      }
      setLeaving(new Set(ids));
      cancelFold();
      foldTimer.current = setTimeout(() => {
        // The box closes over the fold's 300ms, geometry only, on the commit that takes the
        // rows out. Only while one is still drawn: `configureNext` is GLOBAL, and fired over
        // a commit with nothing leaving it would land on whatever else lays out there.
        if (ids.some((id) => foldable.current.has(id))) LayoutAnimation.configureNext(FOLD_LAYOUT);
        finish();
      }, FOLD_MOTION.leaveMs);
    },
    [requestFocus, refreshToday, reload, cancelFold],
  );
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        return;
      }
      const removed = takeRemovals(foldable.current.keys());
      const day = removed.length > 0 ? foldable.current.get(removed[0]) : undefined;
      if (day !== undefined) {
        foldAway(removed, day);
        return;
      }
      refreshToday();
      void reload();
    }, [reload, refreshToday, foldAway]),
  );

  // The sync tick: another device's rows, and a per-incident read claimed or landed.
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const firstTick = useRef(true);
  useEffect(() => {
    if (firstTick.current) {
      firstTick.current = false;
      return;
    }
    refreshToday();
    void reload();
  }, [hydrationTick, reload, refreshToday]);

  // A write through the Today store while History is on screen: a log from the + button,
  // an Undo on its card. Off screen, the focus reload covers it.
  // The navigator is read through a ref: a write must reload once, not once per render of
  // whatever identity the navigation object has this time.
  const navigation = useNavigation() as unknown as TabPressNavigation;
  const navigationRef = useRef(navigation);
  navigationRef.current = navigation;
  const todayEvents = useEventStore((s) => s.todayEvents);
  const firstEvents = useRef(true);
  useEffect(() => {
    if (firstEvents.current) {
      firstEvents.current = false;
      return;
    }
    if (navigationRef.current.isFocused()) void reload();
  }, [todayEvents, reload]);

  // Pull to refresh: a sync, then the read. A failure keeps what is on screen and says so.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncNow();
    } catch (e) {
      console.warn('[history] manual sync failed:', e);
    }
    // The pinned row's counts re-read with the list (AC 5): the pull moved no sync tick.
    useHistoryListStore.getState().bumpPullTick();
    refreshToday();
    const outcome = await reload();
    setRefreshing(false);
    if (outcome === 'failed') useSnackbarStore.getState().show({ message: HISTORY_REFRESH_FAILED });
  }, [reload, refreshToday]);

  // ── Reads in flight (C-30): the tick while a chain is outstanding, then the landing ──
  const readableIds = useMemo(() => readableIdsOf(snapshot), [snapshot]);
  const [working, setWorking] = useState<ReadonlySet<string>>(NO_OPEN);
  useEffect(() => {
    const ids = readableIds ? readableIds.split('|') : [];
    const outstanding = ids.filter((id) => analysisChainOutstanding(id));
    setWorking(outstanding.length > 0 ? new Set(outstanding) : NO_OPEN);
    let cancelled = false;
    for (const id of outstanding) {
      void awaitAnalysisChain(id).then(async () => {
        if (cancelled) return;
        // Re-read FIRST, then drop the working fact (C-30, HV-6's second adversarial pass):
        // dropped first, the row spends the re-read's round trip on the copy from before the
        // read landed, a frame of "Photo not read" with its tick gone, and the rose then
        // arrives on a new rail with no announcement.
        await useHistoryListStore.getState().refreshReads();
        if (cancelled) return;
        setWorking((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
    }
    return () => {
      cancelled = true;
    };
  }, [readableIds, hydrationTick]);

  // A read the server left `pending`: watched as Home's Today card and the record watch it.
  const pendingKey = useMemo(
    () =>
      snapshot
        ? [...snapshot.analysis.values()].filter((r) => r.status === 'pending').map((r) => r.event_id).sort().join('|')
        : '',
    [snapshot],
  );
  useEffect(() => {
    if (!pendingKey) return;
    const teardowns = pendingKey.split('|').map((id) =>
      watchAnalysisRow(
        id,
        async () => {
          const row = (await readAnalysisRows([id])).get(id);
          if (row && row.status !== 'pending') {
            void useHistoryListStore.getState().refreshReads();
            return true;
          }
          return false;
        },
        () => {},
      ),
    );
    return () => teardowns.forEach((t) => t());
  }, [pendingKey]);

  // ── What the snapshot draws ─────────────────────────────────────────────────────
  const dates = useMemo(() => historyDatesFor(today), [today]);
  const course = snapshot ? courseOf(snapshot) : null;
  const courseName = course?.name ?? null;
  const search = snapshot?.search ?? null;
  const noticed = snapshot?.filter.kind === 'noticed';

  const sections = useMemo<ListSection[]>(() => {
    if (!snapshot || !snapshot.pages.span) return [];
    const c = courseOf(snapshot);
    return listSectionsOf({
      span: snapshot.pages.span,
      facts: snapshot.facts,
      filter: snapshot.filter,
      course: snapshot.filter.kind === 'course' ? (c?.days ?? null) : null,
      itemDays: new Set(snapshot.items.keys()),
      today: snapshot.today,
      searchDays: snapshot.search !== null ? snapshot.pages.days.map((d) => d.day) : null,
    }).map((model) => ({ key: sectionKeyOf(model), model, data: [model] }));
  }, [snapshot]);

  const pageRows = useMemo(
    () =>
      new Map(
        snapshot
          ? snapshot.pages.days.map((d) => [d.day, gone.size === 0 ? d.rows : d.rows.filter((r) => !gone.has(r.id))] as const)
          : [],
      ),
    [snapshot, gone],
  );
  // A new read has answered: the rows a fold took out are the record's to show or not now.
  useEffect(() => setGone(NO_OPEN), [rawSnapshot]);

  // Every loaded day's nodes at once, over the whole days (R-2), so each card is handed the
  // meals a timing line on another card measures from (`timedElsewhere`, HV-6).
  const nodesByDay = useMemo(
    () =>
      snapshot && snapshot.filter.kind !== 'noticed'
        ? historyNodesByDay({
            days: snapshot.wholeDays,
            reads: { analysis: snapshot.analysis, answered: snapshot.answered, working },
            timing: snapshot.timing,
          })
        : NO_NODES_BY_DAY,
    [snapshot, working],
  );

  // The rows a removal could fold, read by the focus callback when the owner comes back.
  foldable.current = useMemo(
    () => foldableRowsOf({ nodesByDay, shownByDay: pageRows, noticed: snapshot?.filter.kind === 'noticed' }),
    [nodesByDay, pageRows, snapshot],
  );

  // The first paint: opened by the render that first draws a snapshot for its identity; the
  // ledger seals itself once that identity's first cards have claimed (the header).
  if (snapshot && scopePetId !== null) {
    ledger.open(
      paintIdentityOf({ petId: snapshot.petId, filterId: filterId(snapshot.filter), windowParam: windowParam(windowKey), today: snapshot.today }),
    );
  }

  const countLine = useMemo(() => {
    if (!headerSnap) return null;
    const c = courseOf(headerSnap, filter);
    return countLineOf({
      filter,
      search: shownSearch,
      window: countLineWindowOf(headerSnap.resolved, headerSnap.windowFacts),
      facts: headerSnap.facts,
      course: c ? { name: c.name, days: c.days } : null,
      trialRange: trialRangeOf(headerSnap.windowFacts),
      today: headerSnap.today,
      dates: historyDatesFor(headerSnap.today),
    });
  }, [headerSnap, filter, shownSearch]);


  const toggleRun = useCallback((id: string) => {
    setOpenRuns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const openVisit = useCallback((id: string) => {
    router.push({ pathname: '/vet-visits/[id]', params: { id } });
  }, []);

  // ── The landing (§3.1; C-22) ────────────────────────────────────────────────────
  const landing = useRef<string | null>(null);
  const [landingSeq, setLandingSeq] = useState(0);
  useEffect(() => {
    const day = useHistoryScopeStore.getState().takeLanding();
    if (day === null) return;
    landing.current = day;
    setLandingSeq((n) => n + 1);
  }, [landTick]);

  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const snapshotReady = snapshot !== null;
  useEffect(() => {
    const day = landing.current;
    if (!snapshotReady || day === null) return;
    // Consumed BEFORE the side effect: a re-entry with a stale closure finds nothing (C-22).
    landing.current = null;
    void useHistoryListStore
      .getState()
      .ensureDay(day)
      .then((reached) => {
        // Scroll only to a day the pages now hold, and only while it is still the landed
        // day: the owner's own scroll or a pet switch while older pages read ends it, and
        // the app never yanks a list the owner has taken back.
        if (reached && useHistoryScopeStore.getState().landedDay === day) setScrollTarget(day);
      });
  }, [landingSeq, snapshotReady]);

  const retries = useRef(0);
  const aim = useCallback((sectionIndex: number) => {
    // A landing is a state, not an animation (§4 "Land on a day"; the mock's caption): it
    // jumps, with or without Reduce Motion, and the outline says where it landed.
    listRef.current?.scrollToLocation({ sectionIndex, itemIndex: 0, viewOffset: 0, animated: false });
  }, []);
  useEffect(() => {
    if (scrollTarget === null) return;
    setScrollTarget(null);
    const index = sectionIndexFor(
      sections.map((s) => s.model),
      scrollTarget,
    );
    if (index < 0) return;
    retries.current = 0;
    aim(index);
    // §4 "Land on a day": with motion on, the day draws once more where it landed; with
    // Reduce Motion, the jump and the outline are the whole landing. VoiceOver goes to the
    // day's header, or the line holding it, either way.
    if (!reducedMotionNow()) {
      ledger.land(scrollTarget);
      setLandDraw((n) => n + 1);
    }
    requestFocus(scrollTarget);
  }, [scrollTarget, sections, aim, ledger, requestFocus]);

  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    },
    [],
  );
  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      // The section is past what the list has measured: jump near it, then aim again (the
      // landing's own jump, above, in two steps).
      listRef.current?.getScrollResponder()?.scrollTo({ y: info.averageItemLength * info.index, animated: false });
      if (retries.current >= LANDING_RETRIES) return;
      retries.current += 1;
      const target = useHistoryScopeStore.getState().landedDay;
      if (retryTimer.current !== null) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => {
        retryTimer.current = null;
        // Still the landed day: the owner's scroll in between ends the landing.
        if (target === null || useHistoryScopeStore.getState().landedDay !== target) return;
        const index = sectionIndexFor(
          sections.map((s) => s.model),
          target,
        );
        if (index >= 0) aim(index);
      }, LANDING_RETRY_MS);
    },
    [sections, aim],
  );

  // The owner's own scroll clears the landed state; a scroll the app makes never does. It
  // also ends a landing's draw and a focus request that have not happened yet: the owner has
  // taken the list back, and neither may land on them later.
  const onScrollBeginDrag = useCallback(() => {
    const s = useHistoryScopeStore.getState();
    if (s.landedDay !== null && s.petId !== null) s.clearLanded(s.petId);
    ledger.seal();
    ledger.dropLanding();
    pendingFocus.current = null;
  }, [ledger]);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  }, []);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    viewport.current = e.nativeEvent.layout.height;
  }, []);

  // A second tap on the History tab: back to today (§3.1), and VoiceOver onto today's
  // header (the list's first day's, when a filter hides today).
  const sectionModels = useRef<HistorySection[]>([]);
  sectionModels.current = sections.map((s) => s.model);
  const todayRef = useRef(today);
  todayRef.current = today;
  useEffect(
    () =>
      navigation.addListener('tabPress', () => {
        if (!navigation.isFocused()) return;
        const s = useHistoryScopeStore.getState();
        if (s.petId !== null) s.returnToToday(s.petId);
        ledger.dropLanding();
        listRef.current?.getScrollResponder()?.scrollTo({
          y: 0,
          animated: scrollAnimates({ reducedMotion: reducedMotionNow(), distance: scrollY.current, viewport: viewport.current }),
        });
        requestFocus(rePressFocusDay(sectionModels.current, todayRef.current));
      }),
    [navigation, ledger, requestFocus],
  );

  // ── Drawing ─────────────────────────────────────────────────────────────────────
  const renderSectionHeader = useCallback(
    ({ section }: { section: ListSection }) => {
      if (!snapshot) return null;
      const m = section.model;
      if (m.kind !== 'day' && m.kind !== 'today-open') return null;
      return (
        <DayCardHeader
          day={m.day}
          today={snapshot.today}
          facts={dayFactsOn(snapshot.facts.days, m.day)}
          filter={snapshot.filter}
          search={snapshot.search !== null}
          landed={landedDay === m.day}
          hasItems={snapshot.items.has(m.day)}
          withCounts={m.kind === 'day'}
          focusRef={focusRefFor(section.key, m.day, m.day)}
        />
      );
    },
    [snapshot, landedDay, focusRefFor],
  );

  const renderItem = useCallback(
    ({ item: m }: { item: HistorySection }) => {
      if (!snapshot) return null;
      switch (m.kind) {
        case 'day':
        case 'today-open':
          return (
            <DayCardBody
              day={m.day}
              items={snapshot.search !== null || m.kind === 'today-open' ? [] : (snapshot.items.get(m.day) ?? [])}
              nodes={nodesByDay.get(m.day) ?? NO_NODES}
              shownRows={pageRows.get(m.day) ?? NO_ROWS}
              noticed={snapshot.filter.kind === 'noticed'}
              openRuns={openRuns}
              onToggleRun={toggleRun}
              onOpenVisit={openVisit}
              landed={landedDay === m.day}
              emptyLine={m.kind === 'today-open' ? TODAY_NOTHING_YET : null}
              drawToken={ledger.peek(m.day)}
              claimDraw={ledger.claim}
              leaving={leaving}
            />
          );
        case 'items-only': {
          const items = snapshot.items.get(m.day) ?? [];
          return (
            <ItemsLine
              text={itemsOnlyLineText(m, items, snapshot.filter, dates, courseName)}
              items={items}
              landed={landedDay === m.day}
              onOpenVisit={openVisit}
              focusRef={focusRefFor(sectionKeyOf(m), m.day, m.day)}
              testID={`history-items-${m.day}`}
            />
          );
        }
        case 'unlogged':
        case 'no-match':
          return (
            <GapLine
              text={gapLineText(m, snapshot.filter, dates, courseName) ?? ''}
              boxed={m.days > 1}
              landed={landedDay !== null && m.fromDay <= landedDay && landedDay <= m.toDay}
              focusRef={focusRefFor(sectionKeyOf(m), m.fromDay, m.toDay)}
              testID={`history-gap-${m.fromDay}`}
            />
          );
      }
    },
    // `landDraw` re-renders the cells when a landing asks its day to draw (the ledger is a
    // ref, so its answer changes without a render of its own).
    [snapshot, pageRows, nodesByDay, openRuns, toggleRun, openVisit, landedDay, dates, courseName, ledger, leaving, focusRefFor, landDraw],
  );

  const header = headerSnap ? (
    <View style={styles.header} testID="history-list-header">
      {countLine ? <CountLine line={countLine} filter={filter} /> : null}
      {showsBowlLine(filter, shownSearch)
        ? headerSnap.arrangements.map((bowl) => (
            <View key={bowl.id} style={styles.bowlLine} testID={`history-bowl-${bowl.id}`}>
              <View style={styles.bowlBar} />
              <ThemedText style={styles.bowlText}>
                <ThemedText style={styles.bowlLead}>{BOWL_LINE_LEAD}</ThemedText>
                {` · ${bowlLineText(bowl, headerSnap.today)}`}
              </ThemedText>
            </View>
          ))
        : null}
      <WeekStrip
        facts={headerSnap.facts}
        window={headerSnap.resolved}
        course={courseOf(headerSnap, filter)}
        today={headerSnap.today}
        petName={petName}
      />
    </View>
  ) : null;

  const empty = !activePet ? (
    // No pet, so no read to wait for: the first-log line, never a silhouette that never ends.
    <EmptyState title={HISTORY_EMPTY_TITLE} body={historyEmptyBody(petName)} testID="history-empty" />
  ) : !snapshot ? (
    failed ? (
      <EmptyState
        title={HISTORY_ERROR_TITLE}
        body={historyErrorBody(petName)}
        action={{ label: HISTORY_RETRY, onPress: () => void reload() }}
        testID="history-error"
      />
    ) : (
      // Under a header that stayed (a filter or search change), only the days wait.
      <ListSkeleton daysOnly={headerSnap !== null} />
    )
  ) : snapshot.facts.firsts.record === null && !noticed ? (
    <EmptyState title={HISTORY_EMPTY_TITLE} body={historyEmptyBody(petName)} testID="history-empty" />
  ) : search !== null ? (
    <EmptyState title={historyNoSearchMatchTitle(search)} body={HISTORY_SEARCH_LOOKS} testID="history-no-search-match" />
  ) : (
    <EmptyState {...filterQuietStateFor(snapshot)} testID="history-no-match" />
  );

  const moreState = more && snapshot !== null && more.of === snapshot.pages ? more.state : null;
  const footer = !snapshot || sections.length === 0 ? null : moreState === 'failed' ? (
    <View style={styles.moreFailed} testID="history-more-failed">
      <ThemedText style={styles.moreFailedText}>{historyMoreFailed(petName)}</ThemedText>
      <TouchableOpacity
        onPress={() => void useHistoryListStore.getState().loadMore()}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={HISTORY_RETRY}
        style={styles.moreRetry}
      >
        <ThemedText style={styles.moreRetryText}>{HISTORY_RETRY}</ThemedText>
      </TouchableOpacity>
    </View>
  ) : snapshot.pages.next ? (
    // The next page, a whole day at a time: one row's silhouette (§3.12).
    <View style={styles.nextPage} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="history-next-page">
      <Skeleton height={NEXT_PAGE_ROW} radius={theme.radiusMedium} />
    </View>
  ) : showsRecordStart({
      recordStart: snapshot.facts.firsts.record,
      lastSectionFromDay: sectionFromDay(sections[sections.length - 1].model),
      allLoaded: snapshot.pages.next === null,
    }) && snapshot.facts.firsts.record !== null ? (
    <RecordStartLine text={recordStartText(petName, recordWeekday(snapshot.facts.firsts.record, today) ?? snapshot.facts.firsts.record)} />
  ) : null;

  return (
    <SectionList<HistorySection, ListSection>
      ref={listRef}
      style={styles.list}
      sections={sections}
      keyExtractor={(m) => `body:${sectionKeyOf(m)}`}
      renderSectionHeader={renderSectionHeader}
      renderItem={renderItem}
      stickySectionHeadersEnabled
      // A drag through search results puts the keyboard away, as the platform's own lists do.
      keyboardDismissMode="on-drag"
      // A week of days on the first paint (a day is three cells: its header, its body, its
      // footer): the strip shows this week, so a landing from it never waits on a measure.
      initialNumToRender={INITIAL_CELLS}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      onEndReached={() => {
        if (snapshot?.pages.next) void useHistoryListStore.getState().loadMore();
      }}
      onEndReachedThreshold={0.5}
      onScrollBeginDrag={onScrollBeginDrag}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onLayout={onLayout}
      onScrollToIndexFailed={onScrollToIndexFailed}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colorTextSecondary} />
      }
      contentContainerStyle={[styles.content, sections.length === 0 && styles.contentEmpty]}
      testID="history-list"
    />
  );
}

// ── The list's silhouette (§3.12): hidden from VoiceOver, until the first read answers ──

const SKELETON_HEADLINE = 22;
const SKELETON_LINE = 12;
const SKELETON_STRIP = 40;
const SKELETON_CARD = 80;
const NEXT_PAGE_ROW = 44;
/** Seven days of cells on the first paint (header, body and footer per day). */
const INITIAL_CELLS = 7 * 3;

function ListSkeleton({ daysOnly = false }: { daysOnly?: boolean }) {
  return (
    <View
      style={styles.skeleton}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="history-skeleton"
    >
      {daysOnly ? null : (
        <>
          <Skeleton width="64%" height={SKELETON_HEADLINE} radius={theme.radiusSmall} />
          <Skeleton width="52%" height={SKELETON_LINE} />
          <Skeleton height={SKELETON_STRIP} radius={theme.radiusSmall} />
        </>
      )}
      <Skeleton height={SKELETON_CARD} radius={theme.radiusMedium} />
      <Skeleton height={SKELETON_CARD} radius={theme.radiusMedium} />
      <Skeleton height={SKELETON_CARD} radius={theme.radiusMedium} />
      <Skeleton width="64%" height={SKELETON_HEADLINE} radius={theme.radiusSmall} />
      <Skeleton height={SKELETON_CARD} radius={theme.radiusMedium} />
    </View>
  );
}

const BOWL_BAR_WIDTH = 3;
const BOWL_BAR_HEIGHT = 14;

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: theme.colorNeutralLight },
  // The last row clears the + button at scroll end (AC 14; lib/fabFootprint.ts).
  content: { paddingBottom: HISTORY_V2_SCROLL_INSET },
  contentEmpty: { flexGrow: 1 },
  header: { paddingTop: theme.space1 },
  bowlLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    paddingHorizontal: theme.space2,
    paddingBottom: theme.space1,
  },
  bowlBar: {
    width: BOWL_BAR_WIDTH,
    height: BOWL_BAR_HEIGHT,
    borderRadius: BOWL_BAR_WIDTH,
    backgroundColor: theme.colorAccent,
  },
  bowlText: {
    flex: 1,
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    fontWeight: theme.weightRegular,
    color: theme.colorTextSecondary,
  },
  bowlLead: {
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  skeleton: {
    gap: theme.space1,
    paddingHorizontal: theme.space2,
    paddingTop: theme.space1,
  },
  nextPage: {
    paddingHorizontal: theme.space2,
    paddingTop: theme.space1,
  },
  moreFailed: {
    paddingHorizontal: theme.space2,
    paddingTop: theme.space2,
    alignItems: 'flex-start',
  },
  moreFailedText: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
  },
  // Its own 44pt box (C-5), left-aligned, clear of the FAB.
  moreRetry: { minHeight: 44, justifyContent: 'center' },
  moreRetryText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
});
