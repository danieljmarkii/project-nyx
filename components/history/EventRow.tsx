import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NyxEvent } from '../../store/eventStore';
import { EVENT_TYPES, EventTypeKey } from '../../constants/eventTypes';
import { theme } from '../../constants/theme';
import { IntakeChipRow, IntakeRating } from '../log/IntakeChipRow';
import { describeOccurredAt } from '../../lib/utils';

interface Props {
  event: NyxEvent;
  isExpanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const FALLBACK_CONFIG = { label: 'Event', emoji: '·', hasSeverity: false };

function formatDatePart(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function EventRow({ event, isExpanded, onToggle, onOpen, onEdit, onDelete }: Props) {
  const config = EVENT_TYPES[event.event_type as EventTypeKey] ?? FALLBACK_CONFIG;
  const isSymptom = config.hasSeverity;

  // Meal events backed by a treat-typed food render as "Treat". Legacy NULL
  // and 'meal'/'other' food_type keep the "Meal" label.
  const rowLabel = event.event_type === 'meal' && event.food_type === 'treat'
    ? 'Treat'
    : config.label;

  // brand · product_name — matches how people refer to food ("Fancy Feast · Chunky Chicken")
  const foodLabel = event.food_brand && event.food_product_name
    ? `${event.food_brand} · ${event.food_product_name}`
    : event.food_product_name ?? event.food_brand ?? null;

  // B-010 — read-only confidence marker so the timeline stops implying false
  // precision on found/estimated events. Witnessed and legacy (null) rows keep
  // the plain time and show no tag.
  const timeDisplay = describeOccurredAt({
    confidence: event.occurred_at_confidence,
    occurredAt: event.occurred_at,
    earliest: event.occurred_at_earliest,
    latest: event.occurred_at_latest,
  });

  return (
    <TouchableOpacity
      style={[styles.row, isExpanded && styles.rowExpanded]}
      onPress={onToggle}
      onLongPress={onOpen}
      delayLongPress={300}
      activeOpacity={0.7}
    >
      <View style={[styles.emojiCol, isSymptom && styles.emojiColSymptom]}>
        <Text style={styles.emoji}>{config.emoji}</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.topLine}>
          <Text style={styles.label}>{rowLabel}</Text>
          <View style={styles.timeCol}>
            <Text style={styles.time}>
              {formatDatePart(event.occurred_at)}, {timeDisplay.compact}
            </Text>
            {timeDisplay.tag ? (
              <Text style={styles.timeTag}>{timeDisplay.tag}</Text>
            ) : null}
          </View>
        </View>

        {foodLabel ? (
          <View style={styles.foodLine}>
            <Text style={styles.foodName} numberOfLines={1}>{foodLabel}</Text>
            {/* Read-only intake badge — IntakeChipRow returns null when value
                is null, so unrated meals stay visually quiet. */}
            <IntakeChipRow value={(event.intake_rating ?? null) as IntakeRating | null} />
          </View>
        ) : null}

        {isExpanded ? (
          <View style={styles.expandedContent}>
            {event.notes ? (
              <Text style={styles.notes}>{event.notes}</Text>
            ) : null}
            <View style={styles.actions}>
              <TouchableOpacity onPress={onOpen} hitSlop={8} style={styles.editBtn}>
                <Text style={styles.editBtnText}>View</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onEdit} hitSlop={8} style={styles.editBtn}>
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onDelete} hitSlop={8} style={styles.deleteBtn}>
                <Text style={styles.deleteBtnText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space3,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
    backgroundColor: theme.colorSurface,
  },
  rowExpanded: {
    backgroundColor: theme.colorNeutralLight,
  },
  emojiCol: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colorNeutralLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.space2,
    marginTop: 2,
  },
  emojiColSymptom: {
    backgroundColor: theme.colorEventSymptomLight,
  },
  emoji: {
    fontSize: 16,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 15,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextPrimary,
  },
  timeCol: {
    alignItems: 'flex-end',
  },
  time: {
    fontSize: 13,
    color: theme.colorTextSecondary,
  },
  timeTag: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    letterSpacing: theme.trackingWide,
    textTransform: 'uppercase',
    marginTop: 1,
  },
  foodLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    flexWrap: 'wrap',
  },
  foodName: {
    fontSize: 13,
    color: theme.colorTextSecondary,
    flexShrink: 1,
  },
  expandedContent: {
    marginTop: theme.space1,
    gap: theme.space1,
  },
  notes: {
    fontSize: 14,
    color: theme.colorTextPrimary,
    lineHeight: 20,
    paddingVertical: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.space2,
    marginTop: theme.space1,
    paddingTop: theme.space1,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
  },
  editBtn: {
    paddingVertical: 4,
    paddingHorizontal: theme.space1,
  },
  editBtnText: {
    fontSize: 14,
    color: theme.colorAccent,
    fontWeight: theme.fontWeightMedium,
  },
  deleteBtn: {
    paddingVertical: 4,
    paddingHorizontal: theme.space1,
  },
  deleteBtnText: {
    fontSize: 14,
    color: theme.colorEventSymptom,
  },
});
