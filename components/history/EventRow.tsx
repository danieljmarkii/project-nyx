import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NyxEvent } from '../../store/eventStore';
import { EVENT_TYPES, EventTypeKey } from '../../constants/eventTypes';
import { theme } from '../../constants/theme';

interface Props {
  event: NyxEvent;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const FALLBACK_CONFIG = { label: 'Event', emoji: '·', hasSeverity: false };

function formatOccurredAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function SeverityDots({ severity }: { severity: number }) {
  return (
    <View style={dotStyles.row}>
      {[1, 2, 3, 4, 5].map((v) => (
        <View
          key={v}
          style={[dotStyles.dot, v <= severity ? dotStyles.dotFilled : dotStyles.dotEmpty]}
        />
      ))}
    </View>
  );
}

export function EventRow({ event, isExpanded, onToggle, onEdit, onDelete }: Props) {
  const config = EVENT_TYPES[event.event_type as EventTypeKey] ?? FALLBACK_CONFIG;
  const isSymptom = config.hasSeverity;

  return (
    <TouchableOpacity
      style={[styles.row, isExpanded && styles.rowExpanded]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <View style={[styles.emojiCol, isSymptom && styles.emojiColSymptom]}>
        <Text style={styles.emoji}>{config.emoji}</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.topLine}>
          <Text style={styles.label}>{config.label}</Text>
          <Text style={styles.time}>{formatOccurredAt(event.occurred_at)}</Text>
        </View>

        {event.food_product_name ? (
          <Text style={styles.foodName} numberOfLines={1}>
            {event.food_product_name}
            {event.food_brand ? ` · ${event.food_brand}` : ''}
          </Text>
        ) : null}

        {event.severity !== null && !isExpanded ? (
          <View style={styles.dotsCollapsed}>
            <SeverityDots severity={event.severity} />
          </View>
        ) : null}

        {isExpanded ? (
          <View style={styles.expandedContent}>
            {event.severity !== null ? (
              <View style={styles.expandedRow}>
                <Text style={styles.expandedMeta}>Severity</Text>
                <SeverityDots severity={event.severity} />
              </View>
            ) : null}
            {event.notes ? (
              <Text style={styles.notes}>{event.notes}</Text>
            ) : null}
            <View style={styles.actions}>
              <TouchableOpacity onPress={onEdit} hitSlop={8} style={styles.editBtn}>
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onDelete} hitSlop={8} style={styles.deleteBtn}>
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const dotStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotFilled: {
    backgroundColor: theme.colorEventSymptom,
  },
  dotEmpty: {
    backgroundColor: theme.colorChartEmpty,
  },
});

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
    backgroundColor: '#FBF0EF',
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
  time: {
    fontSize: 13,
    color: theme.colorTextSecondary,
  },
  foodName: {
    fontSize: 13,
    color: theme.colorTextSecondary,
  },
  dotsCollapsed: {
    marginTop: 2,
  },
  expandedContent: {
    marginTop: theme.space1,
    gap: theme.space1,
  },
  expandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
  },
  expandedMeta: {
    fontSize: 13,
    color: theme.colorTextSecondary,
    width: 56,
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
