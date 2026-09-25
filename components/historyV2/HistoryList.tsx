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
// the old rows under the new pill (CUL-1120).
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
//   • A new scope (a filter, a window, a search, a pet) resets the list to its top without
//     animating it.
// VoiceOver focus on a landing and on the re-tap, and every motion, are HV-10's (CUL-1167).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
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
import { eventTintCategory } from '../../lib/dayEvents';
import { HISTORY_V2_SCROLL_INSET } from '../../lib/fabFootprint';
import {
  countLineOf,
  dayFactsOn,
  gapLineText,
  listSectionsOf,
  type DayFacts,
  type HistoryCourse,
  type HistorySection,
} from '../../lib/historyDays';
import { SEARCH_READS_NOTES, type HistoryRow } from '../../lib/historyQueries';
import {
  BOWL_LINE_LEAD,
  bowlLineText,
  countLineWindowOf,
  historyDatesFor,
  itemsOnlyLineText,
  scrollAnimates,
  sectionIndexFor,
  sectionKeyOf,
  showsBowlLine,
  showsRecordStart,
  trialRangeOf,
} from '../../lib/historyScreen';
import { recordWeekday } from '../../lib/recordDates';
import { readAnalysisRows } from '../../lib/spineReads';
import { syncNow } from '../../lib/sync';
import { toLocalDayKey } from '../../lib/utils';
import { useEventStore } from '../../store/eventStore';
import {
  historyRequestKey,
  snapshotForScope,
  useHistoryListStore,
  type HistoryLoadOutcome,
  type HistorySnapshot,
} from '../../store/historyListStore';
import { useHistoryScopeStore, type HistoryScope } from '../../store/historyScopeStore';
import { usePetStore } from '../../store/petStore';
import { reducedMotionNow } from '../../store/reducedMotionStore';
import { useSnackbarStore } from '../../store/snackbarStore';
import { useSyncStore } from '../../store/syncStore';
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
export const HISTORY_NO_MATCH_TITLE = 'Nothing matches that filter';
export const historyNoMatchBody = (pet: string) => `Try clearing a filter to see more of ${pet}'s history.`;
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
const NO_OPEN: ReadonlySet<string> = new Set();
/** How many times a landing re-aims at a section the list had not measured yet. */
const LANDING_RETRIES = 3;

function courseOf(snapshot: HistorySnapshot): HistoryCourse | null {
  const filter = snapshot.filter;
  return filter.kind === 'course' ? (snapshot.courses.find((c) => c.key === filter.courseKey) ?? null) : null;
}

/** The loaded symptom rows' ids: the rows a read can sit on. */
function symptomIdsOf(snapshot: HistorySnapshot | null): string {
  if (!snapshot) return '';
  const ids: string[] = [];
  for (const rows of snapshot.wholeDays.values()) {
    for (const r of rows) if (eventTintCategory(r.event_type) === 'symptom') ids.push(r.id);
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

  // ── Today: the screen's one clock (the store shares it with the pinned row and strip) ──
  const [today, setToday] = useState(() => toLocalDayKey(new Date()));
  const refreshToday = useCallback(() => setToday(toLocalDayKey(new Date())), []);
  useEffect(() => {
    useHistoryListStore.getState().setToday(today);
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

  // A new scope: read it, close every run, and start at the top without a glide (§4).
  const [openRuns, setOpenRuns] = useState<ReadonlySet<string>>(NO_OPEN);
  useEffect(() => {
    setOpenRuns(NO_OPEN);
    // A new scope REPLACES the list's content, so the viewport goes back to its top in the
    // same instant, with nothing to glide across (§4: "resets the list without animating
    // the viewport").
    listRef.current?.getScrollResponder()?.scrollTo({ y: 0, animated: false });
    void reload();
  }, [request, reload]);

  // Focus: a removal or an edit on the record screen lands here. The mount's own focus is
  // the request effect's read, so the first is skipped.
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        return;
      }
      refreshToday();
      void reload();
    }, [reload, refreshToday]),
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
    refreshToday();
    const outcome = await reload();
    setRefreshing(false);
    if (outcome === 'failed') useSnackbarStore.getState().show({ message: HISTORY_REFRESH_FAILED });
  }, [reload, refreshToday]);

  // ── Reads in flight (C-30): the tick while a chain is outstanding, then the landing ──
  const symptomIds = useMemo(() => symptomIdsOf(snapshot), [snapshot]);
  const [working, setWorking] = useState<ReadonlySet<string>>(NO_OPEN);
  useEffect(() => {
    const ids = symptomIds ? symptomIds.split('|') : [];
    const outstanding = ids.filter((id) => analysisChainOutstanding(id));
    setWorking(outstanding.length > 0 ? new Set(outstanding) : NO_OPEN);
    let cancelled = false;
    for (const id of outstanding) {
      void awaitAnalysisChain(id).then(() => {
        if (cancelled) return;
        setWorking((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        void useHistoryListStore.getState().refreshReads();
      });
    }
    return () => {
      cancelled = true;
    };
  }, [symptomIds, hydrationTick]);

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
    () => new Map(snapshot ? snapshot.pages.days.map((d) => [d.day, d.rows] as const) : []),
    [snapshot],
  );

  const countLine = useMemo(() => {
    if (!snapshot) return null;
    const c = courseOf(snapshot);
    return countLineOf({
      filter: snapshot.filter,
      search: snapshot.search,
      window: countLineWindowOf(snapshot.resolved, snapshot.windowFacts),
      facts: snapshot.facts,
      course: c ? { name: c.name, days: c.days } : null,
      trialRange: trialRangeOf(snapshot.windowFacts),
      today: snapshot.today,
      dates: historyDatesFor(snapshot.today),
    });
  }, [snapshot]);

  const stripDays = useMemo<DayFacts[]>(
    () => (snapshot ? [...snapshot.facts.days.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)) : []),
    [snapshot],
  );

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
      .then(() => setScrollTarget(day));
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
  }, [scrollTarget, sections, aim]);

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      // The section is past what the list has measured: jump near it, then aim again (the
      // landing's own jump, above, in two steps).
      listRef.current?.getScrollResponder()?.scrollTo({ y: info.averageItemLength * info.index, animated: false });
      if (retries.current >= LANDING_RETRIES) return;
      retries.current += 1;
      const target = useHistoryScopeStore.getState().landedDay;
      setTimeout(() => {
        if (target === null) return;
        const index = sectionIndexFor(
          sections.map((s) => s.model),
          target,
        );
        if (index >= 0) aim(index);
      }, 50);
    },
    [sections, aim],
  );

  // The owner's own scroll clears the landed state; a scroll the app makes never does.
  const onScrollBeginDrag = useCallback(() => {
    const s = useHistoryScopeStore.getState();
    if (s.landedDay !== null && s.petId !== null) s.clearLanded(s.petId);
  }, []);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  }, []);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    viewport.current = e.nativeEvent.layout.height;
  }, []);

  // A second tap on the History tab: back to today (§3.1).
  useEffect(
    () =>
      navigation.addListener('tabPress', () => {
        if (!navigation.isFocused()) return;
        const s = useHistoryScopeStore.getState();
        if (s.petId !== null) s.returnToToday(s.petId);
        listRef.current?.getScrollResponder()?.scrollTo({
          y: 0,
          animated: scrollAnimates({ reducedMotion: reducedMotionNow(), distance: scrollY.current, viewport: viewport.current }),
        });
      }),
    [navigation],
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
          withCounts={m.kind === 'day'}
        />
      );
    },
    [snapshot, landedDay],
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
              wholeDay={snapshot.wholeDays.get(m.day) ?? NO_ROWS}
              shownRows={pageRows.get(m.day) ?? NO_ROWS}
              noticed={snapshot.filter.kind === 'noticed'}
              analysis={snapshot.analysis}
              working={working}
              timing={snapshot.timing}
              openRuns={openRuns}
              onToggleRun={toggleRun}
              onOpenVisit={openVisit}
              landed={landedDay === m.day}
              emptyLine={m.kind === 'today-open' ? TODAY_NOTHING_YET : null}
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
              testID={`history-gap-${m.fromDay}`}
            />
          );
      }
    },
    [snapshot, pageRows, working, openRuns, toggleRun, openVisit, landedDay, dates, courseName],
  );

  const header = snapshot ? (
    <View style={styles.header} testID="history-list-header">
      {countLine ? <CountLine line={countLine} filter={snapshot.filter} /> : null}
      {showsBowlLine(snapshot.filter, snapshot.search)
        ? snapshot.arrangements.map((bowl) => (
            <View key={bowl.id} style={styles.bowlLine} testID={`history-bowl-${bowl.id}`}>
              <View style={styles.bowlBar} />
              <ThemedText style={styles.bowlText}>
                <ThemedText style={styles.bowlLead}>{BOWL_LINE_LEAD}</ThemedText>
                {` · ${bowlLineText(bowl, snapshot.today)}`}
              </ThemedText>
            </View>
          ))
        : null}
      <WeekStrip days={stripDays} />
    </View>
  ) : null;

  const empty = !snapshot ? (
    failed ? (
      <EmptyState
        title={HISTORY_ERROR_TITLE}
        body={historyErrorBody(petName)}
        action={{ label: HISTORY_RETRY, onPress: () => void reload() }}
        testID="history-error"
      />
    ) : (
      <ListSkeleton />
    )
  ) : snapshot.facts.firsts.record === null && !noticed ? (
    <EmptyState title={HISTORY_EMPTY_TITLE} body={historyEmptyBody(petName)} testID="history-empty" />
  ) : search !== null ? (
    <EmptyState title={historyNoSearchMatchTitle(search)} body={HISTORY_SEARCH_LOOKS} testID="history-no-search-match" />
  ) : (
    <EmptyState title={HISTORY_NO_MATCH_TITLE} body={historyNoMatchBody(petName)} testID="history-no-match" />
  );

  const moreState = more && rawSnapshot !== null && more.of === rawSnapshot ? more.state : null;
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
      windowFromDay: snapshot.resolved.bounds.fromDay,
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

function ListSkeleton() {
  return (
    <View
      style={styles.skeleton}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="history-skeleton"
    >
      <Skeleton width="64%" height={SKELETON_HEADLINE} radius={theme.radiusSmall} />
      <Skeleton width="52%" height={SKELETON_LINE} />
      <Skeleton height={SKELETON_STRIP} radius={theme.radiusSmall} />
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
