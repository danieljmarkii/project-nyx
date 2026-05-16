import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { theme } from '../../constants/theme';
import { FilterChip } from '../../components/ui/FilterChip';
import { EVENT_TYPES, EventTypeKey } from '../../constants/eventTypes';
import { EventRow } from '../../components/history/EventRow';
import { usePetStore } from '../../store/petStore';
import { useEventStore, NyxEvent } from '../../store/eventStore';
import { getTimeline, softDeleteEvent, TimelineRow } from '../../lib/db';
import { syncPendingEvents } from '../../lib/sync';

const PAGE_SIZE = 50;

type DatePreset = '7d' | '30d' | null;

const TYPE_FILTERS: { key: EventTypeKey | null; label: string }[] = [
  { key: null, label: 'All' },
  { key: 'meal', label: 'Meal' },
  { key: 'vomit', label: 'Vomit' },
  { key: 'diarrhea', label: 'Diarrhea' },
  { key: 'stool_normal', label: 'Stool' },
  { key: 'lethargy', label: 'Lethargy' },
  { key: 'itch', label: 'Itch' },
  { key: 'other', label: 'Other' },
];

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: null, label: 'All time' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
];

function dateAfterForPreset(preset: DatePreset): string | null {
  if (!preset) return null;
  const days = preset === '7d' ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function rowToEvent(row: TimelineRow): NyxEvent {
  return {
    id: row.id,
    pet_id: row.pet_id,
    event_type: row.event_type as EventTypeKey | 'other',
    occurred_at: row.occurred_at,
    severity: row.severity,
    notes: row.notes,
    source: row.source as NyxEvent['source'],
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    food_item_id: row.food_item_id,
    food_brand: row.food_brand,
    food_product_name: row.food_product_name,
    quantity: row.quantity,
  };
}

export default function HistoryScreen() {
  const { activePet } = usePetStore();
  const { removeFromToday, todayEvents } = useEventStore();

  const [events, setEvents] = useState<NyxEvent[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<EventTypeKey | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Ref-based guard prevents concurrent loads even when the callback is stale
  const loadingRef = useRef(false);

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

  // Reload fresh on every focus so edits/deletes from the edit modal are reflected
  useFocusEffect(
    useCallback(() => {
      setOffset(0);
      setHasMore(true);
      setExpandedId(null);
      loadEvents(0, typeFilter, datePreset, true);
    }, [activePet, typeFilter, datePreset]),
  );

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

  const isEmpty = events.length === 0 && !loading;

  return (
    <SafeAreaView style={styles.container}>

      {/* Unified filter section — one surface, one border at the bottom */}
      <View style={styles.filterSection}>
        {/* Title + date presets */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>History</Text>
          <View style={styles.datePresets}>
            {DATE_PRESETS.map((p) => (
              <FilterChip
                key={p.key ?? 'all'}
                label={p.label}
                active={datePreset === p.key}
                onPress={() => handleDatePreset(p.key)}
                variant="default"
              />
            ))}
          </View>
        </View>

        {/* Type filter chips — View wrapper gives reliable height; FlatList alone does not */}
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
                variant="filled"
              />
            )}
          />
        </View>
      </View>

      {/* Event list — flex: 1 so it fills remaining space regardless of event count */}
      <View style={styles.listContainer}>
        <FlatList<NyxEvent>
          data={events}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <EventRow
              event={item}
              isExpanded={expandedId === item.id}
              onToggle={() => handleToggle(item.id)}
              onEdit={() => handleEdit(item)}
              onDelete={() => handleDelete(item)}
            />
          )}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
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
            hasMore && events.length > 0 ? (
              <TouchableOpacity style={styles.loadMore} onPress={handleLoadMore} activeOpacity={0.7}>
                <Text style={styles.loadMoreText}>Load more</Text>
              </TouchableOpacity>
            ) : null
          }
          contentContainerStyle={events.length === 0 ? styles.listEmpty : undefined}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
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
  datePresets: {
    flexDirection: 'row',
    gap: 6,
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
  listContainer: {
    flex: 1,
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
    lineHeight: 22,
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
