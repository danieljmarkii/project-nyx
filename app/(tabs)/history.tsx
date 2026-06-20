import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../constants/theme';
import { FilterChip } from '../../components/ui/FilterChip';
import { DateScopeControl, DatePreset } from '../../components/history/DateScopeControl';
import { EVENT_TYPES, EventTypeKey } from '../../constants/eventTypes';
import { EventRow } from '../../components/history/EventRow';
import { BoundaryMarkerRow } from '../../components/history/BoundaryMarkerRow';
import { FreeFeedingStrip } from '../../components/history/FreeFeedingStrip';
import { usePetStore } from '../../store/petStore';
import { useEventStore, NyxEvent } from '../../store/eventStore';
import { useSyncStore } from '../../store/syncStore';
import { getTimeline, softDeleteEvent, TimelineRow } from '../../lib/db';
import { syncPendingEvents, syncNow } from '../../lib/sync';
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

// The event-type lens. Labels read from EVENT_TYPES so a chip can never drift
// from its row label again (it used to hardcode "Diarrhea" while the rows render
// "Loose stool"). `medication` is loggable today (B-117) but had no filter until
// now. Order keeps the two stool types adjacent for scanning.
const TYPE_FILTER_KEYS: EventTypeKey[] = [
  'meal', 'vomit', 'diarrhea', 'stool_normal', 'lethargy', 'itch', 'medication', 'other',
];

const TYPE_FILTERS: { key: EventTypeKey | null; label: string }[] = [
  { key: null, label: 'All' },
  ...TYPE_FILTER_KEYS.map((key) => ({ key, label: EVENT_TYPES[key].label })),
];

function dateAfterForPreset(preset: DatePreset): string | null {
  if (!preset) return null;
  if (preset === 'today') {
    // Start of the local calendar day — matches the Home "Today" zone's day boundary.
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  const days = preset === '7d' ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
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
    medication_item_id: row.medication_item_id,
    adherence: row.adherence as NyxEvent['adherence'],
    drug_generic_name: row.drug_generic_name,
    drug_brand_name: row.drug_brand_name,
  };
}

export default function HistoryScreen() {
  const { activePet } = usePetStore();
  // The Home "Today" doorway (§8) deep-links here with ?date=today; `ts` is a nonce so
  // the filter re-applies even when this tab is already mounted (a doorway tap is not a
  // remount). The filter is fully clearable — tapping any other date chip clears it.
  const params = useLocalSearchParams<{ date?: string; ts?: string }>();
  const initialDatePreset: DatePreset = params.date === 'today' ? 'today' : null;
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Ref-based guard prevents concurrent loads even when the callback is stale
  const loadingRef = useRef(false);

  // Keep the current filters reachable from the hydration-tick effect without
  // making them its deps (which would re-fire it on every filter change, where
  // the explicit handlers already reload).
  const typeFilterRef = useRef(typeFilter);
  const datePresetRef = useRef(datePreset);
  typeFilterRef.current = typeFilter;
  datePresetRef.current = datePreset;

  const loadEvents = useCallback(async (
    currentOffset: number,
    type: EventTypeKey | null,
    preset: DatePreset,
    replace: boolean,
  ) => {
    if (!activePet || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const rows = await getTimeline(
        activePet.id,
        PAGE_SIZE,
        currentOffset,
        type,
        dateAfterForPreset(preset),
      );
      const mapped = rows.map(rowToEvent);
      setEvents((prev: NyxEvent[]) => replace ? mapped : [...prev, ...mapped]);
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
        loadEvents(0, typeFilter, datePreset, true),
        loadFreeFeeding(),
      ]);
      setRefreshing(false);
    }
  }, [loadEvents, loadFreeFeeding, typeFilter, datePreset]);

  // Reload fresh on every focus so edits/deletes from the edit modal are reflected
  useFocusEffect(
    useCallback(() => {
      setOffset(0);
      setHasMore(true);
      setExpandedId(null);
      loadEvents(0, typeFilter, datePreset, true);
      loadFreeFeeding();
    }, [activePet, typeFilter, datePreset]),
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
    loadEvents(0, typeFilterRef.current, datePresetRef.current, true);
    loadFreeFeeding();
  }, [hydrationTick, loadEvents, loadFreeFeeding]);

  // Re-apply the Home-doorway date filter on a fresh navigation (the tab persists across
  // switches, so a doorway tap doesn't remount). The `ts` nonce changes per tap; the ref
  // guards against re-applying on unrelated re-renders. Setting datePreset re-runs the
  // focus effect (which reloads). First mount is handled by initialDatePreset above, so
  // the ref is seeded to that ts to avoid a redundant re-apply.
  const appliedDateTsRef = useRef<string | null>(initialDatePreset ? params.ts ?? null : null);
  useEffect(() => {
    if (params.date === 'today' && params.ts && params.ts !== appliedDateTsRef.current) {
      appliedDateTsRef.current = params.ts;
      setTypeFilter(null);
      setDatePreset('today');
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
      if (datePreset) {
        const cutoff = dateAfterForPreset(datePreset);
        if (cutoff && newEvent.occurred_at < cutoff) return prev;
      }
      return [newEvent, ...prev];
    });
  }, [latestTodayId]);

  function handleTypeFilter(key: EventTypeKey | null) {
    setTypeFilter(key);
    setOffset(0);
    setHasMore(true);
    setExpandedId(null);
    loadEvents(0, key, datePreset, true);
  }

  function handleDatePreset(preset: DatePreset) {
    setDatePreset(preset);
    setOffset(0);
    setHasMore(true);
    setExpandedId(null);
    loadEvents(0, typeFilter, preset, true);
  }

  function handleLoadMore() {
    if (!hasMore || loadingRef.current) return;
    loadEvents(offset, typeFilter, datePreset, false);
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

    const cutoff = dateAfterForPreset(datePreset);
    const cutoffMs = cutoff ? new Date(cutoff).getTime() : null;
    const oldestEventMs = events.length > 0
      ? new Date(events[events.length - 1].occurred_at).getTime()
      : null;

    const markerItems: ListItem[] = markers
      .filter((m) => {
        if (cutoffMs !== null && m.sortMs < cutoffMs) return false;
        if (oldestEventMs !== null && hasMore && m.sortMs < oldestEventMs) return false;
        return true;
      })
      .map((m) => ({ kind: 'marker' as const, marker: m }));

    return [...eventItems, ...markerItems].sort((a, b) => itemSortMs(b) - itemSortMs(a));
  }, [events, markers, typeFilter, datePreset, hasMore]);

  const isEmpty = merged.length === 0 && !loading;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>

      {/* Unified filter section — one surface, one border at the bottom */}
      <View style={styles.filterSection}>
        {/* Title + time-scope menu. Scope is a single choice with long labels,
            so it's a quiet pill + sheet (DateScopeControl), not a chip rail —
            this is what kills the old clipped, unscrollable date row. */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>History</Text>
          <DateScopeControl value={datePreset} onChange={handleDatePreset} />
        </View>

        {/* Event-type lens — one scrollable row, one visual language (teal), with
            a right edge fade so "there's more →" reads at a glance. The View
            wrapper enforces a reliable height; a FlatList alone does not. */}
        <View style={styles.chipWrapper}>
          <FlatList<typeof TYPE_FILTERS[0]>
            horizontal
            data={TYPE_FILTERS}
            keyExtractor={(item) => item.key ?? 'all'}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            renderItem={({ item }) => (
              <FilterChip
                label={item.label}
                active={typeFilter === item.key}
                onPress={() => handleTypeFilter(item.key)}
                variant="default"
              />
            )}
          />
          {/* Fades the row's right edge to the header surface (#FFFFFF). The
              0-alpha stop is white's zero-alpha form, NOT 'transparent' — RN
              fades 'transparent' through black and would dirty the edge. Keep in
              sync with filterSection's backgroundColor. */}
          <LinearGradient
            colors={['rgba(255,255,255,0)', theme.colorSurface]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.lensFade}
            pointerEvents="none"
          />
        </View>
      </View>

      {/* §6a ambient strip — pinned above the list (not in the scroll) so a
          free-fed bowl stays visible every time the tab opens, never out of
          sight / out of mind. Standing context, not an event row. */}
      <FreeFeedingStrip arrangements={arrangements} />

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
                {typeFilter || datePreset ? (
                  <>
                    <Text style={styles.emptyTitle}>No events found</Text>
                    <Text style={styles.emptyBody}>
                      Try removing a filter to see more history.
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.emptyTitle}>Nothing logged yet</Text>
                    <Text style={styles.emptyBody}>
                      {activePet
                        ? `Tap + anywhere to log ${activePet.name}'s first event.`
                        : 'Tap + anywhere to start logging.'}
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
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
  },
  // View wrapper enforces height; setting height directly on FlatList is unreliable
  chipWrapper: {
    height: 44,
  },
  chipRow: {
    paddingHorizontal: theme.space2,
    paddingBottom: 8,
    gap: 6,
    alignItems: 'center',
    height: 44,
  },
  // Right-edge scroll affordance for the lens row. Fixed overlay (chips scroll
  // under it); pointerEvents none so taps reach the chips beneath.
  lensFade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 28,
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
