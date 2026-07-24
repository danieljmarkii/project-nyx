import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { theme } from '../../constants/theme';
import { DateScopeControl } from '../../components/history/DateScopeControl';
import { TypeScopeControl } from '../../components/history/TypeScopeControl';
import { DAY_KEY_RE, effectiveRange } from '../../lib/historyDateFilter';
import type { DatePreset } from '../../lib/historyDateFilter';
import { EVENT_TYPES, EventTypeKey } from '../../constants/eventTypes';
import { EventRow } from '../../components/history/EventRow';
import { BoundaryMarkerRow } from '../../components/history/BoundaryMarkerRow';
import { FreeFeedingStrip } from '../../components/history/FreeFeedingStrip';
import { usePetStore } from '../../store/petStore';
import { useEventStore, NyxEvent } from '../../store/eventStore';
import { useSyncStore } from '../../store/syncStore';
import { getTimeline, softDeleteEvent, TimelineRow } from '../../lib/db';
import { syncPendingEvents, syncNow } from '../../lib/sync';
import { formatUtcDayShort } from '../../lib/utils';
import {
  getActiveArrangementsForPet, getBoundaryMarkers,
  ActiveArrangementView, BoundaryMarker,
} from '../../lib/feedingArrangements';

const PAGE_SIZE = 50;

// History renders two kinds of timeline row: discrete events, and the quiet
// free-feeding lifecycle boundary markers (§6a). They're merged into one desc
// stream so a "Started free-feeding" sits at the foot of its calendar day.
type ListItem =
  | { kind: 'event'; event: NyxEvent }
  | { kind: 'marker'; marker: BoundaryMarker };

function itemSortMs(item: ListItem): number {
  return item.kind === 'event'
    ? new Date(item.event.occurred_at).getTime()
    : item.marker.sortMs;
}

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
  };
}

export default function HistoryScreen() {
  const { activePet } = usePetStore();
  // Two doorways deep-link here with ?date=…&ts=<nonce>: the Home "Today" doorway (§8,
  // ?date=today) and the Calendar v3 drill-in (B-308, ?date=YYYY-MM-DD → a single UTC
  // day). `ts` is a nonce so the filter re-applies even when this tab is already mounted (a
  // doorway tap is not a remount). Either filter is fully clearable — picking any date
  // scope clears it.
  const params = useLocalSearchParams<{ date?: string; ts?: string }>();
  const initialDatePreset: DatePreset = params.date === 'today' ? 'today' : null;
  const initialDay: string | null =
    params.date && DAY_KEY_RE.test(params.date) ? params.date : null;
  const { removeFromToday, todayEvents } = useEventStore();
  // B-054 §6 — reactive refresh-after-hydrate: re-read the timeline when a sync
  // cycle finishes while this tab is open, so another device's writes appear
  // without a manual pull-to-refresh.
  const hydrationTick = useSyncStore((s) => s.hydrationTick);

  const [events, setEvents] = useState<NyxEvent[]>([]);
  // B-040 R1 §6a — free-feeding standing facts: the pinned ambient strip
  // (currently-active arrangements) + the inline lifecycle boundary markers.
  const [arrangements, setArrangements] = useState<ActiveArrangementView[]>([]);
  const [markers, setMarkers] = useState<BoundaryMarker[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<EventTypeKey | null>(null);
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

  const loadEvents = useCallback(async (
    currentOffset: number,
    type: EventTypeKey | null,
    preset: DatePreset,
    day: string | null,
    replace: boolean,
  ) => {
    if (!activePet || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
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
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [activePet]);

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

  // Pull-to-refresh: run a full sync cycle (push local writes up + hydrate
  // remote rows down — B-054), then re-read the timeline. This is the deliberate
  // "sync now" gesture; it surfaces another device's writes without the
  // foreground/reload dance, and ships as the gesture real users expect on a
  // health timeline. (The automatic refresh-after-hydrate is the §6-gated UI.)
  const onRefresh = useCallback(async () => {
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
      ]);
      setRefreshing(false);
    }
  }, [loadEvents, loadFreeFeeding, typeFilter, datePreset, dayFilter]);

  // Reload fresh on every focus so edits/deletes from the edit modal are reflected
  useFocusEffect(
    useCallback(() => {
      setOffset(0);
      setHasMore(true);
      setExpandedId(null);
      loadEvents(0, typeFilter, datePreset, dayFilter, true);
      loadFreeFeeding();
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
  }, [hydrationTick, loadEvents, loadFreeFeeding]);

  // Re-apply a doorway date filter on a fresh navigation (the tab persists across switches,
  // so a doorway tap doesn't remount). The `ts` nonce changes per tap; the ref guards
  // against re-applying on unrelated re-renders. Setting datePreset/dayFilter re-runs the
  // focus effect (which reloads). First mount is handled by initialDatePreset/initialDay
  // above, so the ref is seeded to that ts to avoid a redundant re-apply. Handles BOTH the
  // Home "Today" doorway (?date=today) and the Calendar drill-in (?date=YYYY-MM-DD, B-308).
  const appliedDateTsRef = useRef<string | null>(
    initialDatePreset || initialDay ? params.ts ?? null : null,
  );
  useEffect(() => {
    if (!params.date || !params.ts || params.ts === appliedDateTsRef.current) return;
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
  }, [params.date, params.ts]);

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

  function handleDelete(event: NyxEvent) {
    Alert.alert(
      'Remove this log?',
      `This will remove the ${EVENT_TYPES[event.event_type as EventTypeKey]?.label ?? 'event'} from history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setEvents((prev: NyxEvent[]) => prev.filter((e: NyxEvent) => e.id !== event.id));
            setExpandedId(null);
            removeFromToday(event.id);
            try {
              await softDeleteEvent(event.id);
              syncPendingEvents().catch(console.error);
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
            }
          },
        },
      ],
    );
  }

  // Merge boundary markers into the event stream (§6a). Markers are not a
  // NyxEvent type, so they only appear when the list isn't type-filtered (a
  // "Vomit" filter shouldn't surface feeding boundaries). They respect the date
  // preset, and — while more events remain unpaginated — are withheld if older
  // than the oldest loaded event, so they never render above events that should
  // sit below them. Once fully loaded (or with no events at all) all qualifying
  // markers show.
  const merged = useMemo<ListItem[]>(() => {
    const eventItems: ListItem[] = events.map((e) => ({ kind: 'event', event: e }));
    if (typeFilter !== null) return eventItems;

    const { after, before } = effectiveRange(datePreset, dayFilter);
    const cutoffMs = after ? new Date(after).getTime() : null;
    const beforeMs = before ? new Date(before).getTime() : null;
    const oldestEventMs = events.length > 0
      ? new Date(events[events.length - 1].occurred_at).getTime()
      : null;

    const markerItems: ListItem[] = markers
      .filter((m) => {
        if (cutoffMs !== null && m.sortMs < cutoffMs) return false;
        // Single-day filter: drop markers past the day's upper bound too (B-308).
        if (beforeMs !== null && m.sortMs >= beforeMs) return false;
        if (oldestEventMs !== null && hasMore && m.sortMs < oldestEventMs) return false;
        return true;
      })
      .map((m) => ({ kind: 'marker' as const, marker: m }));

    return [...eventItems, ...markerItems].sort((a, b) => itemSortMs(b) - itemSortMs(a));
  }, [events, markers, typeFilter, datePreset, dayFilter, hasMore]);

  const isEmpty = merged.length === 0 && !loading;

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
          <Text style={styles.title}>History</Text>
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
          keyExtractor={(item) => item.kind === 'event' ? `e:${item.event.id}` : `m:${item.marker.id}`}
          renderItem={({ item }) =>
            item.kind === 'marker' ? (
              <BoundaryMarkerRow marker={item.marker} />
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
            isEmpty ? (
              <View style={styles.emptyState}>
                {typeFilter || datePreset || dayFilter ? (
                  <>
                    <Text style={styles.emptyTitle}>Nothing matches that filter</Text>
                    <Text style={styles.emptyBody}>
                      {activePet
                        ? `Try clearing a filter to see more of ${activePet.name}'s history.`
                        : 'Try clearing a filter to see more history.'}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.emptyTitle}>Nothing logged yet</Text>
                    <Text style={styles.emptyBody}>
                      {activePet
                        ? `Tap + anywhere to log ${activePet.name}'s first food or symptom. Everything you log builds up here.`
                        : 'Tap + anywhere to log a first food or symptom. Everything you log builds up here.'}
                    </Text>
                  </>
                )}
              </View>
            ) : null
          }
          ListFooterComponent={
            hasMore && merged.length > 0 ? (
              <TouchableOpacity style={styles.loadMore} onPress={handleLoadMore} activeOpacity={0.7}>
                <Text style={styles.loadMoreText}>Load more</Text>
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
    fontSize: 24,
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
  emptyState: {
    paddingHorizontal: theme.space4,
    paddingTop: theme.space6,
    alignItems: 'center',
    gap: theme.space1,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 15,
    color: theme.colorTextSecondary,
    textAlign: 'center',
    lineHeight: theme.lineHeightBody,
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
    color: theme.colorAccent,
    fontWeight: theme.fontWeightMedium,
  },
});
