import { Fragment, useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import { SectionLabel } from '../ui/SectionLabel';
import { ThemedText } from '../ui/ThemedText';
import { EVENT_TYPES, EventTypeKey, SYMPTOM_TYPES } from '../../constants/eventTypes';
import { EventIcon } from '../event/EventIcon';
import { DayLane } from '../recap/DayLane';
import { formatDrugLabel } from '../../lib/medications';
import { foodFormatTag } from '../../lib/food';
import { NyxEvent } from '../../store/eventStore';
import { buildTodayLane, type DayCountChip } from '../../lib/todayLane';
import { useEvents } from '../../hooks/useEvents';
import { usePetStore } from '../../store/petStore';

const FALLBACK = { label: 'Event' };
const MAX_SHOWN = 3;

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// The zone's single doorway — the full-day recap (/day-summary). Replaces the old
// openHistoryToday header shortcut (DR-2 §3): History is its own tab, one tab away. Both
// the band's "Full day ›" and the capped-rows strip lead here — one destination, the full
// day, whose spine rows each open their own event.
function openFullDay() {
  router.push('/day-summary');
}

export function TodayZone() {
  const { activePet } = usePetStore();
  const { todayEvents } = useEvents();
  const petName = activePet?.name ?? 'your pet';

  // Guard against backdated events that prependEvent may have added
  const localTodayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const eventsToday = useMemo(
    () => todayEvents.filter(e => new Date(e.occurred_at) >= localTodayStart),
    [todayEvents, localTodayStart],
  );

  // The recap band — the day lane's dots + the honest count line — from the SAME pure
  // builder the night recap reads (buildTodayLane → buildCountChips), so Home's glance
  // and the evening read can never state the day differently.
  const lane = useMemo(
    () =>
      buildTodayLane(
        eventsToday.map(e => ({ id: e.id, event_type: e.event_type, occurred_at: e.occurred_at })),
      ),
    [eventsToday],
  );

  const shown = eventsToday.slice(0, MAX_SHOWN);
  const remaining = eventsToday.length - MAX_SHOWN;
  const isEmpty = eventsToday.length === 0;

  return (
    <Card>
      {/* The recap band replaces TodayZone's old header (R-5 / §3): the label, the compact
          day lane, an honest count line, and "Full day ›" into the full-day recap. No new
          card, no badge, no verdict — the Signal still leads Home (Principle 3). */}
      <View style={styles.bandTop}>
        <SectionLabel label="Today so far" header />
        <TouchableOpacity
          onPress={openFullDay}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Open the full day"
        >
          <ThemedText style={styles.door}>Full day ›</ThemedText>
        </TouchableOpacity>
      </View>

      {/* Zero-log: the lane renders empty (an honest 6a→12a track with no dots) beside the
          existing empty nudge — nothing manufactured. */}
      <DayLane dots={lane.dots} />

      {lane.counts.length > 0 && <CountLine counts={lane.counts} />}

      {isEmpty ? (
        <TouchableOpacity
          onPress={() => router.push('/log')}
          activeOpacity={0.7}
          style={styles.nudgeRow}
        >
          <ThemedText style={styles.nudge}>
            Nothing logged yet — how's {petName} doing?
          </ThemedText>
          <ThemedText style={styles.nudgeArrow}>→</ThemedText>
        </TouchableOpacity>
      ) : (
        // The capped rows continue beneath, leading to the same full-day recap as the band.
        // The band's "Full day ›" is the ONE door (CUL-529); the strip stays a silent door
        // (the pre-DR-2 behaviour, its affordance tracked separately as B-787/CUL-514).
        <TouchableOpacity testID="today-strip" onPress={openFullDay} activeOpacity={0.92} style={styles.stripWrap}>
          <View style={styles.strip}>
            {shown.map((event, i) => (
              <EventStripRow
                key={event.id}
                event={event}
                showBorder={i > 0}
              />
            ))}
          </View>

          {/* The overflow line is a quiet caption, NOT a second CTA (CUL-529). It used to be
              an accent link-with-arrow that read as a rival door to the same /day-summary the
              band's "Full day ›" already opens. Demoted to a muted footnote it keeps the one
              honest thing it carries — how many events sit below the 3-row cap — which the
              count line does not (that reports category totals, not what's hidden). */}
          {remaining > 0 && (
            <ThemedText style={styles.moreCaption}>
              {remaining} more event{remaining !== 1 ? 's' : ''} today
            </ThemedText>
          )}
        </TouchableOpacity>
      )}
    </Card>
  );
}

/** The band's honest count line — "2 meals · 1 dose logged". The SAME per-category
 *  counts the recap's C2 chips render (`buildCountChips`), laid out as one factual
 *  clause: the leading number of each segment is bolded (the mock's `<b>2</b> meals`),
 *  segments join with " · ", and the clause closes with "logged". Digit-anchored and
 *  never totalled into a score (Principle 3).
 *
 *  Register note: a symptom count renders in the SAME neutral digit as meals/doses here.
 *  The shared `DayCountChip.tone` (which the night recap paints rose) is deliberately NOT
 *  applied on Home — the lane's rose dot above already carries the symptom colour, the
 *  count line stays a calm factual summary, and a legible rose TEXT token on the light
 *  ground (the dot's #F43F5E fails AA as 13px text) is a Designer/AA call. This is
 *  REGISTER only: the counts are byte-identical to the recap's (the invariant the shared
 *  builder guarantees — same numbers, same nouns). Rose-vs-neutral is surfaced for PM
 *  ratification (CUL-25 pm-review D1); flipping it is a one-line change. */
function CountLine({ counts }: { counts: DayCountChip[] }) {
  return (
    <ThemedText testID="today-count-line" style={styles.counts}>
      {counts.map((c, i) => {
        // Split "2 meals" → bold "2" + muted " meals" (the split CountChips uses too).
        const sp = c.label.indexOf(' ');
        const head = sp === -1 ? c.label : c.label.slice(0, sp);
        const tail = sp === -1 ? '' : c.label.slice(sp);
        return (
          // A Fragment, not a wrapper span: a styleless ThemedText would inject the
          // regular Geist face here and silently override whatever weight the line
          // above it carries. Nothing needed a span — only a key.
          <Fragment key={c.key}>
            {i > 0 ? ' · ' : ''}
            <ThemedText style={styles.countNum}>{head}</ThemedText>
            {tail}
          </Fragment>
        );
      })}
      {' logged'}
    </ThemedText>
  );
}

function EventStripRow({ event, showBorder }: { event: NyxEvent; showBorder: boolean }) {
  const config = EVENT_TYPES[event.event_type as EventTypeKey] ?? FALLBACK;
  const isSymptom = SYMPTOM_TYPES.has(event.event_type as EventTypeKey);
  const isMeal = event.event_type === 'meal';
  const isMedication = event.event_type === 'medication';
  // Meal events backed by a treat-typed food render as "Treat". Legacy NULL
  // and 'meal'/'other' food_type keep the "Meal" label.
  const rowLabel = isMeal && event.food_type === 'treat' ? 'Treat' : config.label;

  // B-161 — the drug name as a subline, so a pet on two meds doesn't show two
  // identical "Medication" rows. The dose twin of the meal's food-name subline,
  // and shares EventRow's formatDrugLabel so the two surfaces never drift. NULL
  // (no drug name hydrated yet) → no subline, exactly like an unnamed meal.
  const drugLabel = isMedication
    ? formatDrugLabel(event.drug_generic_name, event.drug_brand_name)
    : null;

  // B-568 — the wet/dry variant. Today is the tightest of the three timeline surfaces:
  // it shows the product name ALONE (no brand), so two formats of one prescription line
  // were not merely hard to tell apart here, they rendered as the same string. Same
  // sibling-element treatment as EventRow — the name truncates, the tag holds.
  const formatTag = isMeal ? foodFormatTag(event.food_format, rowLabel) : null;

  // Tint the glyph to its category so meal vs. symptom vs. med reads at a glance —
  // the mid-tone sits cleanly on the light category-tinted circle (mint/rose/slate)
  // and is more legible there than a flat gray. Neutral (fg-2) otherwise. Medication
  // slate is the B-311 token — its own hue, never the reserved brand indigo (§1.3).
  const iconColor = isSymptom
    ? theme.colorEventSymptom
    : isMeal
      ? theme.colorEventMeal
      : isMedication
        ? theme.colorEventMedication
        : theme.colorTextSecondary;

  return (
    <View style={[styles.eventRow, showBorder && styles.eventRowBorder]}>
      <View style={[
        styles.iconCircle,
        isMeal && styles.iconMeal,
        isSymptom && styles.iconSymptom,
        isMedication && styles.iconMedication,
      ]}>
        <EventIcon type={event.event_type} size={16} color={iconColor} />
      </View>

      <View style={styles.eventMeta}>
        <ThemedText style={styles.eventLabel}>{rowLabel}</ThemedText>
        {isMeal && event.food_product_name ? (
          <View style={styles.eventSubLine}>
            <ThemedText style={styles.eventSub} numberOfLines={1}>
              {event.food_product_name}
            </ThemedText>
            {formatTag ? (
              <ThemedText style={styles.formatTag} numberOfLines={1}>{formatTag}</ThemedText>
            ) : null}
          </View>
        ) : drugLabel ? (
          <ThemedText style={styles.eventSub} numberOfLines={1}>
            {drugLabel}
          </ThemedText>
        ) : null}
      </View>

      <ThemedText style={styles.eventTime}>{formatEventTime(event.occurred_at)}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  // The band's top row — label + the "Full day ›" door. No marginBottom: the lane's own
  // marginTop sets the gap below.
  bandTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  door: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    // accent-INK, not colorAccent: this is ~13px accent TEXT on the white Card, where
    // bright #00C2A8 is only 2.26:1 (fails AA). colorAccentInk (#0B7B6C) is 5.17:1 and
    // is the design-lock's `--f-accent-ink` for the band door + the app convention for
    // accent text on light. The recap's OWN night links keep colorAccent — teal passes
    // on the dark ground (8:1) — this is a light-ground-only fix (CUL-27 AA pass).
    color: theme.colorAccentInk,
    // Padding + the hitSlop={8} on the touchable clear the 44pt tap-target floor.
    paddingVertical: theme.space1,
  },
  // The honest count line, beneath the lane. Muted clause, bold digits.
  counts: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
    marginTop: theme.space0_5 + theme.spaceMicro, // 6
  },
  countNum: {
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  // Separates the capped rows from the band above them.
  stripWrap: {
    marginTop: theme.space2,
  },
  nudgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.space1,
    paddingVertical: theme.space1,
  },
  nudge: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
    flex: 1,
  },
  nudgeArrow: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    marginLeft: theme.space2,
  },

  // Event strip
  strip: {
    marginTop: 4,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  eventRowBorder: {
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colorNeutralLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconMeal: {
    backgroundColor: theme.colorEventMealLight,
  },
  iconSymptom: {
    backgroundColor: theme.colorEventSymptomLight,
  },
  iconMedication: {
    backgroundColor: theme.colorEventMedicationLight,
  },
  eventMeta: {
    flex: 1,
    gap: 1,
  },
  eventLabel: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  // Row that pairs the food name with its B-568 variant tag. The name is flexShrink
  // (not flex:1) so the pair stays hugged together under the type label rather than
  // pushing the tag out to the strip edge, where it would read as a second column.
  eventSubLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  eventSub: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    flexShrink: 1,
  },
  // Matches EventRow's tag register (tracked uppercase tertiary) so a food is named
  // identically on Today and in History. flexShrink:0 — the name truncates, not the tag.
  formatTag: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    letterSpacing: theme.trackingWide,
    fontWeight: theme.fontWeightMedium,
    flexShrink: 0,
  },
  eventTime: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  // The overflow caption — a quiet footnote under the capped rows, not a CTA (CUL-529).
  // Tertiary gray (not accent) + no arrow + regular weight, so it reads as a disclosure of
  // what's below the cap rather than a second door beside "Full day ›". #737373 on the white
  // Card is ~4.7:1 — passes AA for this 13px text. The top border keeps the "shown rows |
  // note about the rest" separation the old link had.
  moreCaption: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    marginTop: 2,
  },
});
