import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { NyxEvent } from '../../store/eventStore';
import { EVENT_TYPES, EventTypeKey, SYMPTOM_TYPES } from '../../constants/eventTypes';
import { EventIcon } from '../event/EventIcon';
import { theme } from '../../constants/theme';
import { IntakeChipRow, IntakeRating } from '../log/IntakeChipRow';
import { AdherenceChipRow, DoseAdherence } from '../log/AdherenceChipRow';
import {
  vehicleLabel, isComboDoseInDoubt, DOSE_IN_DOUBT_TAG,
  pairedVehicleLinkLabel, pairedDoseLinkLabel, formatDrugLabel,
} from '../../lib/medications';
import { describeOccurredAt } from '../../lib/utils';

// B-156 PR B4 — the quiet, tappable combo cross-link, shown on each side of a combo
// (the dose ↔ its vehicle meal/treat) so the "one act" is legible across the two
// History rows without merging them. Renders nothing when there's nothing to point at
// (a null label OR no target event) — which is exactly how the soft-delete drop works:
// when the other side is removed, the query nulls the label/count and the link vanishes,
// never dangling at an event gone from History. A nested TouchableOpacity captures its
// own tap (the same pattern as the row's expanded View/Edit/Remove actions), so tapping
// the link navigates while a tap elsewhere on the row still toggles.
function ComboCrossLink({
  label,
  targetEventId,
}: {
  label: string | null;
  targetEventId: string | null | undefined;
}) {
  if (!label || !targetEventId) return null;
  return (
    <TouchableOpacity
      style={styles.crossLink}
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: targetEventId } })}
      activeOpacity={0.6}
      accessibilityRole="link"
      accessibilityLabel={label}
    >
      <Text style={styles.crossLinkText} numberOfLines={1}>{label}</Text>
      <ChevronRight size={14} color={theme.colorAccent} strokeWidth={2} />
    </TouchableOpacity>
  );
}

interface Props {
  event: NyxEvent;
  isExpanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const FALLBACK_CONFIG = { label: 'Event', hasSeverity: false };

function formatDatePart(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function EventRow({ event, isExpanded, onToggle, onOpen, onEdit, onDelete }: Props) {
  const config = EVENT_TYPES[event.event_type as EventTypeKey] ?? FALLBACK_CONFIG;
  // Category tint comes from SYMPTOM_TYPES, not config.hasSeverity — the latter
  // is false for every type since severity left the MVP, so it silently
  // disabled the rose symptom circle in History (caught in PR-3 review). Shared
  // with TodayZone so both row surfaces agree on what reads as a symptom.
  const isSymptom = SYMPTOM_TYPES.has(event.event_type as EventTypeKey);

  // Meal events backed by a treat-typed food render as "Treat". Legacy NULL
  // and 'meal'/'other' food_type keep the "Meal" label.
  const rowLabel = event.event_type === 'meal' && event.food_type === 'treat'
    ? 'Treat'
    : config.label;

  // brand · product_name — matches how people refer to food ("Fancy Feast · Chunky Chicken")
  const foodLabel = event.food_brand && event.food_product_name
    ? `${event.food_brand} · ${event.food_product_name}`
    : event.food_product_name ?? event.food_brand ?? null;

  // Medication dose (B-117 PR 8): the drug name (generic, brand appended when it
  // adds info) + the read-only adherence chip — the dose twin of foodLabel + the
  // intake badge. AdherenceChipRow renders nothing for a NULL rating, so an unrated
  // dose stays as quiet as an unrated meal. Shared with TodayZone via formatDrugLabel
  // (B-161) so the two row surfaces agree on how a dose names its drug.
  const drugLabel = formatDrugLabel(event.drug_generic_name, event.drug_brand_name);

  // B-156 Slice B — a quiet read-only vehicle line ("In a treat"), shown only when
  // the owner recorded how the dose was given. NULL/unrecognized → nothing, so an
  // unrecorded vehicle stays as silent as an unrated dose.
  const vehicle = vehicleLabel(event.how_given);

  // B-156 PR B3 — the calm resurface tag. A combo dose whose vehicle was not finished
  // (refused/picked) and whose adherence is still unconfirmed (null) shows a quiet rose
  // "Unconfirmed" tag where the adherence badge would be — so the owner can SEE on the
  // daily scan which dose still needs confirming, without opening every one. The detail
  // screen carries the full ask + the chips to resolve it. Not an alarm; the owner
  // answering (anywhere) clears it by giving the dose an explicit adherence.
  const doseInDoubt = isComboDoseInDoubt({
    isCombo: !!event.paired_event_id,
    vehicleIntake: event.paired_vehicle_intake,
    adherence: event.adherence ?? null,
  });

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
        <EventIcon
          type={event.event_type}
          size={20}
          color={isSymptom ? theme.colorEventSymptom : theme.colorTextSecondary}
        />
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

        {/* B-156 PR B4 — vehicle → dose cross-link. On a meal/treat that carried a
            co-logged dose, a tap jumps to that dose. Null (no link) on a meal with no
            paired dose, and drops cleanly when the only paired dose is soft-deleted. */}
        <ComboCrossLink
          label={pairedDoseLinkLabel({
            count: event.paired_dose_count ?? 0,
            drugName: event.paired_dose_drug_name,
          })}
          targetEventId={event.paired_dose_event_id}
        />

        {drugLabel ? (
          <View style={styles.foodLine}>
            <Text style={styles.foodName} numberOfLines={1}>{drugLabel}</Text>
            {/* Read-only adherence badge — concern states (partial/missed/refused)
                light rose, 'given' lights accent; NULL renders nothing. An in-doubt
                combo dose (null adherence) shows the rose "Unconfirmed" tag instead. */}
            {doseInDoubt ? (
              // pointerEvents none so a tap falls through to the row's toggle/long-press
              // gesture, exactly like the read-only adherence/intake badges.
              <View style={styles.inDoubtTag} pointerEvents="none">
                <Text style={styles.inDoubtTagText}>{DOSE_IN_DOUBT_TAG}</Text>
              </View>
            ) : (
              <AdherenceChipRow value={(event.adherence ?? null) as DoseAdherence | null} />
            )}
          </View>
        ) : null}

        {/* Vehicle ("In a treat") — a quiet secondary line under the drug, only when
            recorded. Reads as a plain note, not a badge: it's descriptive context. */}
        {vehicle ? <Text style={styles.vehicleNote}>{vehicle}</Text> : null}

        {/* B-156 PR B4 — dose → vehicle cross-link. On a dose given inside a meal/treat,
            a tap jumps to that vehicle. Null (no link) on a standalone dose, and drops
            cleanly when the vehicle is soft-deleted (the join nulls paired_food_name). */}
        <ComboCrossLink
          label={pairedVehicleLinkLabel(event.paired_food_name)}
          targetEventId={event.paired_event_id}
        />

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
  },
  foodName: {
    fontSize: 13,
    color: theme.colorTextSecondary,
    // flex:1 lets the name absorb all slack and truncate, pinning the
    // read-only intake badge flush-right under the timestamp so it reads
    // as a scannable right rail instead of drifting with text length.
    flex: 1,
  },
  vehicleNote: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  // The combo cross-link (B-156 PR B4). Accent text + a chevron so it reads as a
  // navigation affordance, not a badge. alignSelf flex-start so the tap target hugs
  // the label (the chevron sits right after it) instead of spanning the row; maxWidth
  // keeps a long food name truncating at the row edge rather than overflowing.
  // minHeight 44 clears the touch-target floor (the 3am-stumbling rule) — the text line
  // alone is ~18px, so a tap relying on hitSlop would fall short; this matches the
  // detail screen's ComboLinkRow. The text centers in the taller box.
  crossLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spaceMicro,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: 44,
  },
  crossLinkText: {
    fontSize: theme.textSM,
    color: theme.colorAccent,
    fontWeight: theme.fontWeightMedium,
    flexShrink: 1,
  },
  // The in-doubt resurface tag — a quiet rose pill, the concern colour the adherence
  // chips use for partial/missed/refused, so an unconfirmed dose reads in the same
  // visual register as a flagged one without being an alarm.
  inDoubtTag: {
    paddingHorizontal: theme.space1,
    paddingVertical: theme.spaceMicro,
    borderRadius: theme.radiusFull,
    borderWidth: 1,
    borderColor: theme.colorEventSymptom,
    backgroundColor: theme.colorEventSymptomLight,
  },
  inDoubtTagText: {
    fontSize: theme.textXS,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorEventSymptom,
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
