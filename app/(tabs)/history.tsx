import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { theme } from '../../constants/theme';
import { EmptyState, ThemedText } from '../../components/ui';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { DateScopeControl } from '../../components/history/DateScopeControl';
import { TypeScopeControl } from '../../components/history/TypeScopeControl';
import { DAY_KEY_RE, effectiveRange, coerceDatePreset } from '../../lib/historyDateFilter';
import type { DatePreset } from '../../lib/historyDateFilter';
import { EVENT_TYPES, EventTypeKey } from '../../constants/eventTypes';
import { EventRow } from '../../components/history/EventRow';
import { BoundaryMarkerRow } from '../../components/history/BoundaryMarkerRow';
import { FreeFeedingStrip } from '../../components/history/FreeFeedingStrip';
import { usePetStore } from '../../store/petStore';
import { useWidgetPetLink } from '../../hooks/useWidgetPetLink';
import { useEventStore, NyxEvent } from '../../store/eventStore';
import { useSyncStore } from '../../store/syncStore';
import { useSnackbarStore } from '../../store/snackbarStore';
import { getTimeline, TimelineRow } from '../../lib/db';
import { syncNow } from '../../lib/sync';
import { reverseLoggedEvent } from '../../lib/undoLog';
import { destructiveConfirm, pullThreshold } from '../../lib/haptics';
import { formatUtcDayShort } from '../../lib/utils';
import { isLookRow } from '../../lib/lookDisplay';
import { useAllowlistFlag } from '../../hooks/useAppConfig';
import { useBetaOptIn } from '../../lib/betaFeatures';
import { readVisitsForHistory, HistoryVisitRow } from '../../lib/vetVisits';
import { VisitTimelineRow } from '../../components/vetvisits/VisitTimelineRow';
import { ListItem, mergeTimelineItems } from '../../lib/historyTimeline';
import {
  getActiveArrangementsForPet, getBoundaryMarkers,
  ActiveArrangementView, BoundaryMarker,
} from '../../lib/feedingArrangements';

const PAGE_SIZE = 50;

type LoadEvents = (
  currentOffset: number,
  type: EventTypeKey | null,
  preset: DatePreset,
  day: string | null,
  replace: boolean,
) => Promise<void>;

function rowToEvent(row: TimelineRow): NyxEvent {
  return {
    id: row.id,
    pet_id: row.pet_id,
    event_type: row.event_type as EventTypeKey | 'other',
    occurred_at: row.occurred_at,
    occurred_at_confidence: row.occurred_at_confidence as NyxEvent['occurred_at_confidence'],
    occurred_at_earliest: row.occurred_at_earliest,
    occurred_at_latest: row.occurred_at_latest,
    severity: row.severity,
    notes: row.notes,
    source: row.source as NyxEvent['source'],
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    food_item_id: row.food_item_id,
    food_brand: row.food_brand,
    food_product_name: row.food_product_name,
    food_type: row.food_type,
    // B-568. This mapper is explicit, and food_format is OPTIONAL on NyxEvent — so
    // omitting it here compiles clean and silently drops the variant, leaving History
    // rendering the collision it is meant to fix. Any new TimelineRow field needs a
    // line here; the type will not tell you.
    food_format: row.food_format,
    quantity: row.quantity,
    intake_rating: row.intake_rating as NyxEvent['intake_rating'],
    weight_kg: row.weight_kg,
    medication_item_id: row.medication_item_id,
    adherence: row.adherence as NyxEvent['adherence'],
    how_given: row.how_given as NyxEvent['how_given'],
    paired_event_id: row.paired_event_id,
    paired_vehicle_intake: row.paired_vehicle_intake as NyxEvent['paired_vehicle_intake'],
    paired_food_name: row.paired_food_name,
    drug_generic_name: row.drug_generic_name,
    drug_brand_name: row.drug_brand_name,
    paired_dose_count: row.paired_dose_count,
    paired_dose_event_id: row.paired_dose_event_id,
    paired_dose_drug_name: row.paired_dose_drug_name,
    // CUL-869 — the look's child. Same trap as food_format above: these are
    // OPTIONAL on NyxEvent, so omitting them compiles clean and silently renders
    // every look as a bare "Noticed" with no words and no note marker.
    look_outcome: row.look_outcome,
    look_words: row.look_words,
    look_note: row.look_note,
  };
}

// Coerce a `?type=` deep-link value onto a real EventTypeKey (B-378), or null when it isn't
// one the UI can represent (a stale/foreign type, or one valid in the schema but not exposed
// here — e.g. `scratch`). hasOwnProperty, not `in`, so an inherited key like `toString` can't
// masquerade as an event type. A bad value degrades to "no type filter", never a crash.
function coerceEventTypeKey(value: string | undefined | null): EventTypeKey | null {
  return value && Object.prototype.hasOwnProperty.call(EVENT_TYPES, value)
    ? (value as EventTypeKey)
    : null;
}

export default function HistoryScreen() {
  const { activePet } = usePetStore();
  // Two doorways deep-link here with ?date=…&ts=<nonce>: the Home "Today" doorway (§8,
  // ?date=today) and the Calendar v3 drill-in (B-308, ?date=YYYY-MM-DD → a single UTC
  // day). `ts` is a nonce so the filter re-applies even when this tab is already mounted (a
  // doorway tap is not a remount). Either filter is fully clearable — picking any date
  // scope clears it.
  // W5 adds a third: the widget's status column deep-links here with
  // ?date=YYYY-MM-DD&pet=<id> — the day AND whose day it is.
  // B-378 adds a fourth: Ask's answer-card provenance deep-links here with
  // ?type=<event_type>&window=<preset>&ts=<nonce> to open the filtered list an answer's count
  // was drawn from ("audit the whole count at its source") instead of a single event. A
  // type/window link and a date link are mutually exclusive — Ask sends one shape or the other.
  const params = useLocalSearchParams<{
    date?: string; ts?: string; pet?: string; type?: string; window?: string;
  }>();
  useWidgetPetLink(params.pet);
  // A type/window deep-link (B-378) and a date deep-link are separate doorways; whichever the
  // navigation carried seeds the initial filter. `hasFilterLink` distinguishes a fresh
  // type/window arrival from an ordinary mount so the date-based seeds don't fight it.
  const hasFilterLink = !!(params.type || params.window);
  const initialTypeFilter: EventTypeKey | null = coerceEventTypeKey(params.type);
  const initialWindowPreset: DatePreset = coerceDatePreset(params.window);
  const initialDatePreset: DatePreset = hasFilterLink
    ? initialWindowPreset
    : params.date === 'today' ? 'today' : null;
  const initialDay: string | null =
    !hasFilterLink && params.date && DAY_KEY_RE.test(params.date) ? params.date : null;
  const { removeFromToday, restoreToToday, todayEvents } = useEventStore();
  // The `vet_visits` rollout flag (G0). Dark means dark: it gates the READ as well
  // as the row, so flag-off this screen issues no query against the table and
  // `visits` stays empty — which is what makes the rendered tree identical to an
  // app without the companion (AC 0, guards/vetVisitsFlagOff.test.tsx).
  const vetVisitsEnabled = useAllowlistFlag('vet_visits') && useBetaOptIn('vet_visits');
  // B-054 §6 — reactive refresh-after-hydrate: re-read the timeline when a sync
  // cycle finishes while this tab is open, so another device's writes appear
  // without a manual pull-to-refresh.
  const hydrationTick = useSyncStore((s) => s.hydrationTick);

  const [events, setEvents] = useState<NyxEvent[]>([]);
  // B-040 R1 §6a — free-feeding standing facts: the pinned ambient strip
  // (currently-active arrangements) + the inline lifecycle boundary markers.
  const [arrangements, setArrangements] = useState<ActiveArrangementView[]>([]);
  const [markers, setMarkers] = useState<BoundaryMarker[]>([]);
  // Vet visits on the timeline (CUL-904 VV-6), behind the rollout flag. Held as its
  // own list rather than mapped into `events`: see the ListItem union above.
  const [visits, setVisits] = useState<HistoryVisitRow[]>([]);
  // C-12 for the SECOND source. `loaded` / `loadError` below are driven by
  // `loadEvents` alone, which was complete while every row in the stream came from
  // the timeline query. It is not any more: a pet whose only record is a vet visit
  // has `events = []` the moment the timeline answers, so the screen would render
  // "Nothing logged yet" over a record that has a visit in it — for a frame while
  // the visit read is in flight, and PERMANENTLY if that read fails. That is the
  // exact sentence CUL-575 built this state machine to stop, arriving through a
  // source the machine did not know about.
  //
  // Set once and never reset, matching `loaded`: a later refresh keeps the rows on
  // screen rather than flashing a skeleton over them.
  const [visitsAnswered, setVisitsAnswered] = useState(false);
  const [visitsError, setVisitsError] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  // CUL-575 — a failed timeline read is a STATE, not a console line. Without it the
  // screen falls through to "Nothing logged yet", i.e. the app asserts an empty record
  // over a read it never completed. The day-summary screen refuses to do this
  // (day-summary.tsx: "A failed read is NEVER rendered as 'nothing logged'"); History
  // holds the same line.
  const [loadError, setLoadError] = useState(false);
  // Whether a read has ever ANSWERED for this screen. `loading` alone can't carry the
  // first paint: it starts false and only flips inside the focus effect, so the very
  // first frame had merged=[] + loading=false and rendered "Nothing logged yet" for a
  // beat before the rows landed. (Foods gates its empty state on the same flag.)
  const [loaded, setLoaded] = useState(false);
  const [typeFilter, setTypeFilter] = useState<EventTypeKey | null>(initialTypeFilter);
  const [datePreset, setDatePreset] = useState<DatePreset>(initialDatePreset);
  // A single-day filter from the Calendar v3 drill-in (B-308). Mutually exclusive with
  // datePreset — whichever the owner picked last wins; picking a preset clears the day.
  const [dayFilter, setDayFilter] = useState<string | null>(initialDay);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Ref-based guard prevents concurrent loads even when the callback is stale
  const loadingRef = useRef(false);

  // Keep the current filters reachable from the hydration-tick effect without
  // making them its deps (which would re-fire it on every filter change, where
  // the explicit handlers already reload).
  const typeFilterRef = useRef(typeFilter);
  const datePresetRef = useRef(datePreset);
  const dayFilterRef = useRef(dayFilter);
  typeFilterRef.current = typeFilter;
  datePresetRef.current = datePreset;
  dayFilterRef.current = dayFilter;

  // The "Try again" on a failed APPEND re-runs the same call, so the catch below has
  // to reach loadEvents from inside its own definition. A ref keeps that legal and
  // always points at the current closure (a captured binding would go stale).
  const loadEventsRef = useRef<LoadEvents | null>(null);

  const loadEvents = useCallback<LoadEvents>(async (
    currentOffset: number,
    type: EventTypeKey | null,
    preset: DatePreset,
    day: string | null,
    replace: boolean,
  ) => {
    if (!activePet || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    // Cleared per attempt, not per mount: a retry that succeeds must take the error
    // state down, and a retry that fails must leave it up.
    setLoadError(false);
    try {
      const { after, before } = effectiveRange(preset, day);
      const rows = await getTimeline(
        activePet.id,
        PAGE_SIZE,
        currentOffset,
        type,
        after,
        before,
      );
      const mapped = rows.map(rowToEvent);
      setEvents((prev: NyxEvent[]) => {
        if (replace) return mapped;
        // Dedupe by id on append (B-198). getTimeline is OFFSET-paginated, so a
        // live insert while History is mounted (logging an event — e.g. a
        // weigh-in — via the FAB) shifts the DB ordering down by one and "Load
        // more" re-fetches a row already held from an earlier page. Without this
        // guard the same id renders twice → React "two children with the same key
        // e:<id>" (and may duplicate/omit rows). The realtime prepend above
        // already dedupes; this closes the append path.
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...mapped.filter((e) => !seen.has(e.id))];
      });
      setHasMore(rows.length === PAGE_SIZE);
      setOffset(currentOffset + rows.length);
    } catch (e) {
      console.error('[history] load failed:', e);
      setLoadError(true);
      // An APPEND failure can't use the error state below — there are rows on screen,
      // so the list isn't empty and the owner would just see "Load more" do nothing.
      // (`replace` is false only after a first page already landed.) Same defect, the
      // other half: no silent failures.
      if (!replace) {
        useSnackbarStore.getState().show({
          message: "Couldn't load more history.",
          actionLabel: 'Try again',
          onAction: () => { void loadEventsRef.current?.(currentOffset, type, preset, day, false); },
        });
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setLoaded(true);
    }
  }, [activePet]);
  loadEventsRef.current = loadEvents;

  // Free-feeding standing facts (§6a): the active arrangements for the pinned
  // strip + the lifecycle boundary markers for the stream. Cheap reads (few
  // rows); re-run on focus and after a hydrate so another device's toggle shows.
  const loadFreeFeeding = useCallback(async () => {
    if (!activePet) {
      setArrangements([]);
      setMarkers([]);
      return;
    }
    try {
      const [active, bm] = await Promise.all([
        getActiveArrangementsForPet(activePet.id),
        getBoundaryMarkers(activePet.id),
      ]);
      setArrangements(active);
      setMarkers(bm);
    } catch (e) {
      // No silent failures (house rule). Leave prior state; focus re-runs this.
      console.warn('[history] free-feeding load failed:', e);
    }
  }, [activePet]);

  // Vet visits on the timeline (CUL-904 VV-6). A cheap local read of a handful of
  // rows, deliberately unbounded — the scope filter is applied in `merged` beside
  // the markers', because `visited_at` is a calendar DATE and the scope bounds are
  // ISO instants, which cannot be compared as text (C-40; see readVisitsForHistory).
  // Monotonic load id — `AppointmentStrip`'s `loadIdRef`, for the same reason and
  // against a failure the pet check below cannot see. `loadVisits` is reachable from
  // five triggers (mount, focus, the hydration tick, pull-to-refresh, retry), so two
  // reads for the SAME pet can overlap: an owner edits a visit and navigates back
  // (focus) while a hydration-tick read is still open, and if the older one resolves
  // last its `setVisits` silently clobbers the fresher rows. The pet check catches a
  // switch; this catches an out-of-order write. They protect different things and
  // the file needs both.
  const visitLoadIdRef = useRef(0);

  const loadVisits = useCallback(async () => {
    const myId = ++visitLoadIdRef.current;
    if (!vetVisitsEnabled || !activePet) {
      setVisits([]);
      // Nothing to wait for, so the empty state must not be held behind a read that
      // is never going to happen — flag-off this screen would skeleton forever.
      setVisitsAnswered(true);
      setVisitsError(false);
      return;
    }
    const petId = activePet.id;
    // Cleared per attempt, not per mount: a retry that succeeds takes the error
    // state down, and one that fails leaves it up (the `loadEvents` rule).
    setVisitsError(false);
    try {
      const rows = await readVisitsForHistory(petId);
      // The read is async and the owner can switch pets while it is in flight, so
      // the result is checked against whoever is active NOW rather than trusted
      // because it was asked for. Putting pet A's visits under pet B's history is
      // the CUL-574 class arriving by staleness (the shape AppointmentStrip's
      // `loadedFor` exists for) — and unlike the strip, this list is merged into a
      // stream with no pet name on it, so a wrong row would be unattributable.
      if (myId !== visitLoadIdRef.current) return;
      if (usePetStore.getState().activePet?.id !== petId) return;
      setVisits(rows);
    } catch (e) {
      // No silent failures (house rule). With rows already on screen this leaves
      // prior state and lets the next focus retry — the posture `loadFreeFeeding`
      // holds one function up. What it must NOT do is let the screen fall through
      // to "Nothing logged yet": that is a claim about the record, over a read that
      // failed. The flag below is what the empty-state gate reads.
      console.warn('[history] load vet visits failed:', e);
      if (myId === visitLoadIdRef.current) setVisitsError(true);
    } finally {
      if (myId === visitLoadIdRef.current) setVisitsAnswered(true);
    }
  }, [vetVisitsEnabled, activePet?.id]);

  // Its own effect, keyed on the loader's identity, because the FLAG is the thing
  // that changes after mount: `useAllowlistFlag` re-resolves on foreground and on
  // sign-in, so an owner allowlisted mid-session would otherwise wait for a
  // re-focus to see their visits — and one dropped from the allowlist would keep
  // seeing them. The `!enabled` branch above is what makes the second half true.
  useEffect(() => { void loadVisits(); }, [loadVisits]);

  // Reached from the hydration effect below, whose deps are deliberately narrow —
  // the loadEventsRef precedent. Adding `loadVisits` to those deps would re-fire a
  // full timeline reload every time the flag resolved.
  const loadVisitsRef = useRef(loadVisits);
  loadVisitsRef.current = loadVisits;

  // Pull-to-refresh: run a full sync cycle (push local writes up + hydrate
  // remote rows down — B-054), then re-read the timeline. This is the deliberate
  // "sync now" gesture; it surfaces another device's writes without the
  // foreground/reload dance, and ships as the gesture real users expect on a
  // health timeline. (The automatic refresh-after-hydrate is the §6-gated UI.)
  const onRefresh = useCallback(async () => {
    // See the Home surface: onRefresh IS the committed-pull threshold.
    pullThreshold();
    setRefreshing(true);
    try {
      await syncNow();
    } catch (e) {
      console.warn('[history] manual sync failed:', e);
    } finally {
      // Re-read from local regardless of sync success (offline still refreshes
      // the local view), and await it so the spinner stays up until the list
      // repaints — no drop-then-fill flicker.
      await Promise.all([
        loadEvents(0, typeFilter, datePreset, dayFilter, true),
        loadFreeFeeding(),
        loadVisits(),
      ]);
      setRefreshing(false);
    }
  }, [loadEvents, loadFreeFeeding, loadVisits, typeFilter, datePreset, dayFilter]);

  // Reload fresh on every focus so edits/deletes from the edit modal are reflected
  useFocusEffect(
    useCallback(() => {
      setOffset(0);
      setHasMore(true);
      setExpandedId(null);
      loadEvents(0, typeFilter, datePreset, dayFilter, true);
      loadFreeFeeding();
      // Through the ref, and the flag is deliberately NOT in the deps below — the
      // same rule the hydration effect follows, which this first got wrong.
      // `useFocusEffect` re-runs its outer effect whenever the memoized callback's
      // identity changes and calls it IMMEDIATELY when the screen is focused
      // (expo-router/build/useFocusEffect.js: `if (navigation.isFocused())`, deps
      // `[effect, navigation, optionalNavigation]`) — it is not gated on a real
      // focus event. So a flag resolving on foreground or sign-in, with History on
      // screen, would run this whole body: offset reset to 0, the expanded card
      // collapsed under the owner's finger, and the entire timeline re-queried.
      // The standalone effect above already re-runs `loadVisits` on a flag change.
      void loadVisitsRef.current();
    }, [activePet, typeFilter, datePreset, dayFilter]),
  );

  // Reactive refresh-after-hydrate (B-054 §6): when a background sync cycle
  // completes, re-read the timeline so hydrated rows surface immediately. Skip
  // the mount run — useFocusEffect already loads on focus; this only fires on
  // subsequent tick changes (a cycle finishing while the tab is open).
  const firstTick = useRef(true);
  useEffect(() => {
    if (firstTick.current) {
      firstTick.current = false;
      return;
    }
    loadEvents(0, typeFilterRef.current, datePresetRef.current, dayFilterRef.current, true);
    loadFreeFeeding();
    void loadVisitsRef.current();
  }, [hydrationTick, loadEvents, loadFreeFeeding]);

  // Re-apply a doorway filter on a fresh navigation (the tab persists across switches, so a
  // doorway tap doesn't remount). The `ts` nonce changes per tap; the ref guards against
  // re-applying on unrelated re-renders. Setting the filter state re-runs the focus effect
  // (which reloads). First mount is handled by the initial* seeds above, so the ref is seeded
  // to that ts to avoid a redundant re-apply. Handles the Home "Today" doorway (?date=today),
  // the Calendar drill-in (?date=YYYY-MM-DD, B-308), AND Ask's provenance link
  // (?type=&window=, B-378).
  const appliedDateTsRef = useRef<string | null>(
    initialDatePreset || initialDay || hasFilterLink ? params.ts ?? null : null,
  );
  useEffect(() => {
    if (!params.ts || params.ts === appliedDateTsRef.current) return;
    // B-378 — a type/window provenance link. Checked first because Ask sends this shape OR a
    // date shape, never both; it sets the type filter + window and clears any day drill-in.
    if (params.type || params.window) {
      appliedDateTsRef.current = params.ts;
      setDayFilter(null);
      setTypeFilter(coerceEventTypeKey(params.type));
      setDatePreset(coerceDatePreset(params.window));
      return;
    }
    if (!params.date) return;
    if (params.date === 'today') {
      appliedDateTsRef.current = params.ts;
      setTypeFilter(null);
      setDayFilter(null);
      setDatePreset('today');
    } else if (DAY_KEY_RE.test(params.date)) {
      appliedDateTsRef.current = params.ts;
      setTypeFilter(null);
      setDatePreset(null);
      setDayFilter(params.date);
    }
  }, [params.date, params.ts, params.type, params.window]);

  // Real-time: prepend new events logged via FAB while this tab is visible
  const latestTodayId = todayEvents[0]?.id;
  useEffect(() => {
    if (!latestTodayId) return;
    setEvents((prev: NyxEvent[]) => {
      if (prev.some((e: NyxEvent) => e.id === latestTodayId)) return prev;
      const newEvent = todayEvents[0];
      if (!newEvent) return prev;
      if (typeFilter && newEvent.event_type !== typeFilter) return prev;
      // Respect BOTH the preset cutoff and a single-day filter's upper bound — a freshly
      // logged event outside the current scope shouldn't jump into a filtered view.
      const { after, before } = effectiveRange(datePreset, dayFilter);
      if (after && newEvent.occurred_at < after) return prev;
      if (before && newEvent.occurred_at >= before) return prev;
      return [newEvent, ...prev];
    });
  }, [latestTodayId]);

  function handleTypeFilter(key: EventTypeKey | null) {
    setTypeFilter(key);
    setOffset(0);
    setHasMore(true);
    setExpandedId(null);
    loadEvents(0, key, datePreset, dayFilter, true);
  }

  function handleDatePreset(preset: DatePreset) {
    // Picking a preset from the scope menu clears any single-day drill-in filter (the two
    // are mutually exclusive — last pick wins).
    setDatePreset(preset);
    setDayFilter(null);
    setOffset(0);
    setHasMore(true);
    setExpandedId(null);
    loadEvents(0, typeFilter, preset, null, true);
  }

  function handleLoadMore() {
    if (!hasMore || loadingRef.current) return;
    loadEvents(offset, typeFilter, datePreset, dayFilter, false);
  }

  function handleToggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleEdit(event: NyxEvent) {
    router.push({
      pathname: '/edit-event',
      params: {
        id: event.id,
        type: event.event_type,
        occurredAt: event.occurred_at,
        notes: event.notes ?? '',
      },
    });
  }

  function handleOpen(event: NyxEvent) {
    router.push({ pathname: '/event/[id]', params: { id: event.id } });
  }

  // A visit opens the visit, not an event screen. Its Edit and (when CUL-19 has
  // deployed the reader that honours `deleted_at`) its Delete live there, which is
  // why this row carries neither — a record's controls belong on the record.
  function handleOpenVisit(visit: HistoryVisitRow) {
    router.push({ pathname: '/vet-visits/[id]', params: { id: visit.id } });
  }

  function handleDelete(event: NyxEvent) {
    // CUL-869 — two things, both the record screen's confirm one surface over.
    //
    // The SUBJECT is named per type: the sentence template was written for noun
    // labels and `check_in`'s is "Noticed", so it read "the Noticed". Every other
    // type's string is unchanged.
    //
    // The NOTE is named when there is one (C-21). A look's note is the owner's own
    // words and nothing recreates it — and this is the likeliest door to a week-old
    // look, so it is the one that could least afford to stay silent. The fact rides
    // on the row itself (`look_note`, joined in the same SELECT), so unlike the
    // record screen's photo there is no read that might not have answered yet.
    const isLook = isLookRow(event);
    const label = EVENT_TYPES[event.event_type as EventTypeKey]?.label ?? 'event';
    const subject = isLook ? 'what you noticed' : `the ${label}`;
    const hasNote = isLook && !!event.look_note?.trim();
    Alert.alert(
      'Remove this log?',
      hasNote
        ? `This will remove ${subject} from history. The note you wrote will be removed with it.`
        : `This will remove ${subject} from history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            // CUL-604 §5.6 — rigid, on the CONFIRM. Never on the button that opens this
            // alert: a haptic beside a live Cancel would say something was destroyed
            // while the owner can still back out.
            destructiveConfirm();
            // Whether Today was carrying this event BEFORE the optimistic removal —
            // captured here because the rollback below must put it back only if it
            // was there. Restoring unconditionally would inject a three-week-old
            // event into Home's Today list (CUL-575).
            const wasInToday = useEventStore
              .getState()
              .todayEvents.some((e: NyxEvent) => e.id === event.id);
            setEvents((prev: NyxEvent[]) => prev.filter((e: NyxEvent) => e.id !== event.id));
            setExpandedId(null);
            removeFromToday(event.id);
            try {
              // CUL-641 — the shared reversal, not a bare softDeleteEvent: it queues
              // the tombstone (as this line always did) AND settles the side-effects
              // removal implies, so Remove and the card's Undo cannot drift apart.
              // Removing a weigh-in re-points pets.weight_kg at whatever reading
              // remains; with none left it is deliberately left alone rather than
              // nulled, because this path cannot know what the reading displaced
              // (lib/weight.ts, delete side).
              await reverseLoggedEvent(event.id);
            } catch (e) {
              console.error('[history] soft delete failed:', e);
              setEvents((prev: NyxEvent[]) => {
                const idx = prev.findIndex(
                  (e: NyxEvent) => new Date(e.occurred_at) < new Date(event.occurred_at),
                );
                const next = [...prev];
                next.splice(idx === -1 ? prev.length : idx, 0, event);
                return next;
              });
              // Home reloads Today on mount and on a hydration tick, not on focus — so
              // without this the app goes on hiding an event that is still in the
              // record, on the one surface the owner checks most (CUL-575).
              //
              // Read the active pet FRESH rather than from this closure: the write can
              // fail after the owner has switched pets, and Today is one global list
              // scoped to whoever was active when it loaded (hooks/useEvents). Putting
              // pet A's meal back into pet B's Today is the wrong-pet class, so the
              // rollback is skipped in that window — the next load restores it anyway,
              // for the right pet.
              const stillActive = usePetStore.getState().activePet?.id === event.pet_id;
              if (wasInToday && stillActive) restoreToToday(event);
              // ...and SAY so. The row reappearing under the owner's finger, with no
              // message, is the app looking broken at the exact moment it is being
              // careful. No provider string here — the copy guard's B-399 rule.
              useSnackbarStore.getState().show({
                message: "Couldn't remove that log. It's still in history.",
              });
            }
          },
        },
      ],
    );
  }

  // The merged stream. The rule itself lives in `lib/historyTimeline.ts`, pure, so
  // it can be asserted over data — its effect is at the TAIL of a virtualized list,
  // which a rendered-tree test cannot see (measured; the file's header has it).
  const merged = useMemo<ListItem[]>(() => {
    const { after, before } = effectiveRange(datePreset, dayFilter);
    return mergeTimelineItems({
      events, markers, visits, typeFilter, after, before, hasMore,
    });
  }, [events, markers, visits, typeFilter, datePreset, dayFilter, hasMore]);

  // The three "nothing on screen" states, kept mutually exclusive and in priority
  // order (CUL-575). Before this, the screen had ONE of them: an empty list, which a
  // failed read and an unfinished read both fell into.
  const nothingToShow = merged.length === 0;
  // Tier-1 loading (§5): a local SQLite read, so skeleton rows — never a spinner, and
  // never a blank screen that reflows once the rows land. Only while there is nothing
  // to show: a filter change keeps the previous rows up until the new ones replace
  // them, so it must not flash skeletons over a list that is already populated.
  // `!loaded` covers the first frame, before the focus effect has even started the
  // read. Gated on activePet: with no pet there is no read to wait for, so the screen
  // must not skeleton forever — it falls through to the designed empty state.
  const showSkeleton = nothingToShow && !loadError && !visitsError && !!activePet
    && (loading || !loaded || !visitsAnswered);
  const showError = nothingToShow && (loadError || visitsError);
  const isEmpty = nothingToShow && !showSkeleton && !loadError && !visitsError;

  // The error state's retry, and the same reset the filter handlers do.
  const handleRetry = useCallback(() => {
    setOffset(0);
    setHasMore(true);
    setVisitsError(false);
    loadEvents(0, typeFilter, datePreset, dayFilter, true);
    loadFreeFeeding();
    void loadVisits();
  }, [loadEvents, loadFreeFeeding, loadVisits, typeFilter, datePreset, dayFilter]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>

      {/* Unified filter section — one surface, one border at the bottom.
          Both filters are single mutually-exclusive choices, so both are quiet
          pill + sheet controls (the same ScopeMenu): every option is a
          full-width sheet row and none can hide off-screen. This retires the
          app's last h-scroll chip rail — its edge-fade peek wasn't enough of a
          cue, and the Medication filter sat undiscoverable past the fold. */}
      <View style={styles.filterSection}>
        <View style={styles.headerRow}>
          <ThemedText style={styles.title}>History</ThemedText>
          <View style={styles.scopeRow}>
            <TypeScopeControl value={typeFilter} onChange={handleTypeFilter} />
            <DateScopeControl
              value={datePreset}
              onChange={handleDatePreset}
              dayLabel={dayFilter ? formatUtcDayShort(dayFilter) : null}
            />
          </View>
        </View>
      </View>

      {/* §6a ambient strip — pinned above the list (not in the scroll) so a
          free-fed bowl stays visible every time the tab opens, never out of
          sight / out of mind. Standing context, not an event row.
          B-137: it's a FOOD standing fact, so it only belongs under the "All"
          and "Meal" lenses — showing a bowl while the list is filtered to e.g.
          Vomit reads incongruously. Hidden under any other type filter; the
          markers in the stream are already type-gated the same way (§6a). */}
      {(typeFilter === null || typeFilter === 'meal') && (
        <FreeFeedingStrip arrangements={arrangements} />
      )}

      {/* Event list — flex: 1 so it fills remaining space regardless of event count */}
      <View style={styles.listContainer}>
        <FlatList<ListItem>
          data={merged}
          keyExtractor={(item) =>
            item.kind === 'event' ? `e:${item.event.id}`
              : item.kind === 'marker' ? `m:${item.marker.id}`
                : `v:${item.visit.id}`
          }
          renderItem={({ item }) =>
            item.kind === 'marker' ? (
              <BoundaryMarkerRow marker={item.marker} />
            ) : item.kind === 'visit' ? (
              <VisitTimelineRow row={item.visit} onPress={() => handleOpenVisit(item.visit)} />
            ) : (
              <EventRow
                event={item.event}
                isExpanded={expandedId === item.event.id}
                onToggle={() => handleToggle(item.event.id)}
                onOpen={() => handleOpen(item.event)}
                onEdit={() => handleEdit(item.event)}
                onDelete={() => handleDelete(item.event)}
              />
            )
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colorTextSecondary}
            />
          }
          ListEmptyComponent={
            showSkeleton ? (
              <SkeletonRows count={7} testID="history-skeleton" />
            ) : showError ? (
              // NOT "Nothing logged yet". A read that failed says so and offers a way
              // back; it never renders as a record fact about the pet.
              <EmptyState
                title="Couldn't load history"
                body={
                  activePet
                    ? `Something went wrong loading ${activePet.name}'s history.`
                    : 'Something went wrong loading your history.'
                }
                action={{ label: 'Try again', onPress: handleRetry }}
                testID="history-error"
              />
            ) : isEmpty ? (
              typeFilter || datePreset || dayFilter ? (
                <EmptyState
                  title="Nothing matches that filter"
                  body={
                    activePet
                      ? `Try clearing a filter to see more of ${activePet.name}'s history.`
                      : 'Try clearing a filter to see more history.'
                  }
                />
              ) : (
                <EmptyState
                  title="Nothing logged yet"
                  body={
                    activePet
                      ? `Tap + anywhere to log ${activePet.name}'s first food or symptom. Everything you log builds up here.`
                      : 'Tap + anywhere to log a first food or symptom. Everything you log builds up here.'
                  }
                />
              )
            ) : null
          }
          ListFooterComponent={
            hasMore && merged.length > 0 ? (
              <TouchableOpacity style={styles.loadMore} onPress={handleLoadMore} activeOpacity={0.7}>
                <ThemedText style={styles.loadMoreText}>Load more</ThemedText>
              </TouchableOpacity>
            ) : null
          }
          contentContainerStyle={merged.length === 0 ? styles.listEmpty : undefined}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // White so the top safe-area inset blends with the white filter header
  // instead of showing a grey band under the status bar
  container: {
    flex: 1,
    backgroundColor: theme.colorSurface,
  },
  // Single white surface for title + chips, border only at the bottom
  filterSection: {
    backgroundColor: theme.colorSurface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space3,
    paddingTop: 14,
    paddingBottom: 12,
    gap: theme.space2,
  },
  title: {
    // Shared with the Foods tab's page title (B-107) — one token so the two tab
    // headers can't drift apart the way a pair of hard-coded 24s eventually does.
    fontSize: theme.textPageTitle,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
  },
  // The two scope pills share the row's remaining width; each pill flexShrinks
  // (ellipsizing its label) rather than pushing the other off-screen.
  scopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    flexShrink: 1,
  },
  listContainer: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  listEmpty: {
    flexGrow: 1,
  },
  loadMore: {
    alignItems: 'center',
    paddingVertical: theme.space3,
  },
  loadMoreText: {
    fontSize: 14,
    color: theme.colorAccentInk,
    fontWeight: theme.fontWeightMedium,
  },
});
