import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { theme } from '../../constants/theme';
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
  const { removeFromToday } = useEventStore();

  const [events, setEvents] = useState<NyxEvent[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<EventTypeKey | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadEvents = useCallback(async (
    currentOffset: number,
    type: EventTypeKey | null,
    preset: DatePreset,
    replace: boolean,
  ) => {
    if (!activePet || loading) return;
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
      setLoading(false);
    }
  }, [activePet]);

  // Reload fresh on every focus (catches edits/deletes from other screens)
  useFocusEffect(
    useCallback(() => {
      setOffset(0);
      setHasMore(true);
      setExpandedId(null);
      loadEvents(0, typeFilter, datePreset, true);
    }, [activePet, typeFilter, datePreset]),
  );

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
    if (!hasMore || loading) return;
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
        severity: event.severity !== null ? String(event.severity) : '',
        notes: event.notes ?? '',
      },
    });
  }

  function handleDelete(event: NyxEvent) {
    Alert.alert(
      'Delete this log?',
      'The event will be removed from your history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Optimistic remove
            setEvents((prev: NyxEvent[]) => prev.filter((e: NyxEvent) => e.id !== event.id));
            setExpandedId(null);
            removeFromToday(event.id);
            try {
              await softDeleteEvent(event.id);
              syncPendingEvents().catch(console.error);
            } catch (e) {
              console.error('[history] soft delete failed:', e);
              // Re-insert on failure so the list stays correct
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
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
      </View>

      {/* Type filter chips */}
      <FlatList<typeof TYPE_FILTERS[0]>
        horizontal
        data={TYPE_FILTERS}
        keyExtractor={(item) => item.key ?? 'all'}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        renderItem={({ item }) => {
          const isActive = typeFilter === item.key;
          return (
            <TouchableOpacity
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => handleTypeFilter(item.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        }}
        style={styles.chipRowContainer}
      />

      {/* Date preset pills */}
      <View style={styles.presetRow}>
        {DATE_PRESETS.map((p) => {
          const isActive = datePreset === p.key;
          return (
            <TouchableOpacity
              key={p.key ?? 'all'}
              style={[styles.preset, isActive && styles.presetActive]}
              onPress={() => handleDatePreset(p.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.presetText, isActive && styles.presetTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Event list */}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  header: {
    paddingHorizontal: theme.space3,
    paddingTop: theme.space2,
    paddingBottom: theme.space1,
    backgroundColor: theme.colorSurface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  title: {
    fontSize: 28,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
  },
  chipRowContainer: {
    backgroundColor: theme.colorSurface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  chipRow: {
    paddingHorizontal: theme.space2,
    paddingVertical: 10,
    gap: 8,
  },
  chip: {
    paddingHorizontal: theme.space2,
    paddingVertical: 6,
    borderRadius: theme.radiusLarge,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    backgroundColor: theme.colorSurface,
  },
  chipActive: {
    backgroundColor: theme.colorNeutralDark,
    borderColor: theme.colorNeutralDark,
  },
  chipText: {
    fontSize: 13,
    color: theme.colorTextSecondary,
    fontWeight: theme.fontWeightMedium,
  },
  chipTextActive: {
    color: '#fff',
  },
  presetRow: {
    flexDirection: 'row',
    paddingHorizontal: theme.space3,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: theme.colorSurface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  preset: {
    paddingHorizontal: theme.space2,
    paddingVertical: 4,
    borderRadius: theme.radiusLarge,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: theme.colorNeutralLight,
  },
  presetActive: {
    borderColor: theme.colorAccent,
    backgroundColor: '#EEF5F7',
  },
  presetText: {
    fontSize: 13,
    color: theme.colorTextSecondary,
  },
  presetTextActive: {
    color: theme.colorAccent,
    fontWeight: theme.fontWeightMedium,
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
