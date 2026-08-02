// The Day Summary screen (B-661 PR 4 — see docs/nyx-notification-foundation-
// requirements.md §5.3). The surface the 9pm notification opens.
//
// It answers exactly ONE question — "what happened in {pet}'s record today" — and
// every row is a doorway into the existing event detail. It is NOT a rival Home:
// no AI, no verdicts, no score, no logging FAB. Multi-pet accounts get one screen,
// sectioned per pet, active pet first. The zero-log day is a DESIGNED state, and
// its copy is G2-bound — a record fact, never an all-clear over the pet.
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { theme } from '../constants/theme';
import { Header, EmptyState, PrimaryButton } from '../components/ui';
import { WhorlSpinner } from '../components/brand/WhorlSpinner';
import { EventIcon } from '../components/event/EventIcon';
import { useDaySummary } from '../hooks/useDaySummary';
import { useSyncStore } from '../store/syncStore';
import {
  DAY_SUMMARY_ZERO_LOG,
  petZeroLogLine,
  type DaySummaryRow,
  type DaySummarySection,
} from '../lib/daySummary';
import type { EventTintCategory } from '../lib/dayEvents';

// Category glyph tint — the SAME mapping the calendar day drill-in uses
// (DayEventsSheet / B-311), so a symptom/meal/dose reads in its own hue on both
// surfaces: symptom rose, meal teal, medication slate, everything else neutral.
const CATEGORY_TINT: Record<EventTintCategory, string> = {
  symptom: theme.colorEventSymptom,
  meal: theme.colorEventMeal,
  medication: theme.colorEventMedication,
  other: theme.colorTextSecondary,
};

function todayLabel(): string {
  // "Sunday, August 2" — orientation only; the screen always shows the local
  // today, so a live read of the wall clock is honest here.
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default function DaySummaryScreen() {
  const state = useDaySummary();

  // Cold-start from a notification tap can push this screen onto a fresh stack with
  // nothing behind it — fall back to Home rather than a dead back button.
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, []);

  const retry = useCallback(() => {
    // The hook re-reads on every hydration tick; bumping it is the retry.
    useSyncStore.getState().bumpHydrationTick();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Today" leading="back" onLeadingPress={goBack} />

      {state.status === 'loading' ? (
        <View style={styles.centre}>
          <WhorlSpinner size="md" ground="day" />
        </View>
      ) : state.status === 'error' ? (
        // A failed read is NEVER rendered as "nothing logged" — that reads as a
        // false all-clear (§11 #2 / clinical-guardrails). Offer a retry.
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Couldn’t load today’s record</Text>
          <Text style={styles.errorBody}>Check your connection and try again.</Text>
          <PrimaryButton label="Try again" onPress={retry} variant="secondary" />
        </View>
      ) : state.model.isEmpty ? (
        // Whole-screen (or single-pet) zero-log — a designed feature (Principle 5).
        <EmptyState
          title={DAY_SUMMARY_ZERO_LOG.title}
          body={DAY_SUMMARY_ZERO_LOG.body}
          align="fill"
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.dateLabel}>{todayLabel()}</Text>
          {state.model.sections.map((section) => (
            <PetSection
              key={section.petId}
              section={section}
              // A single-pet account needs no pet heading — the page already names
              // the day and there is no second pet to disambiguate from.
              showHeading={state.model.petCount > 1}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function PetSection({
  section,
  showHeading,
}: {
  section: DaySummarySection;
  showHeading: boolean;
}) {
  return (
    <View style={styles.section}>
      {showHeading && <Text style={styles.petHeading}>{section.petName}</Text>}
      {section.isZeroLog ? (
        // Per-pet zero-log line (multi-pet: one pet logged, this one didn't). Same
        // G2 register as the full state — a record fact about this pet's day.
        <Text style={styles.petZeroLog}>{petZeroLogLine(section.petName)}</Text>
      ) : (
        <View style={styles.rows}>
          {section.rows.map((row, i) => (
            <EventDoorway key={row.id} row={row} isLast={i === section.rows.length - 1} />
          ))}
        </View>
      )}
    </View>
  );
}

function EventDoorway({ row, isLast }: { row: DaySummaryRow; isLast: boolean }) {
  const open = useCallback(() => {
    router.push({ pathname: '/event/[id]', params: { id: row.id } });
  }, [row.id]);

  const label =
    `${row.title}` +
    `${row.formatTag ? `, ${row.formatTag.toLowerCase()}` : ''}` +
    `${row.detail ? `, ${row.detail}` : ''}` +
    `, ${row.time}. Opens details`;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, isLast && styles.rowLast, pressed && styles.rowPressed]}
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.rowIcon}>
        <EventIcon type={row.eventType} size={16} color={CATEGORY_TINT[row.category]} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {row.title}
          {row.detail ? <Text style={styles.rowDetail}> · {row.detail}</Text> : null}
        </Text>
        {/* B-568 — the wet/dry variant, a sibling of the truncating title so it
            survives a long prescription product name. */}
        {row.formatTag ? (
          <Text style={styles.rowFormatTag} numberOfLines={1}>
            {row.formatTag}
          </Text>
        ) : null}
      </View>
      <Text style={styles.rowTime}>{row.time}</Text>
      <ChevronRight size={16} color={theme.colorTextTertiary} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorNeutralLight },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: theme.space3, gap: theme.space3, paddingBottom: theme.space6 },

  // Error state — a message + a retry, never a false "nothing logged".
  errorBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space2,
    paddingHorizontal: theme.space4,
  },
  errorTitle: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    textAlign: 'center',
  },
  errorBody: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    textAlign: 'center',
    marginBottom: theme.space1,
  },

  dateLabel: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    fontWeight: theme.weightMedium,
  },

  section: { gap: theme.space2 },
  petHeading: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  petZeroLog: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },

  // A card of doorway rows, one hairline between them (the History / drill-in look).
  rows: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
    minHeight: 56, // clears the 44pt tap target comfortably
  },
  rowLast: { borderBottomWidth: 0 },
  rowPressed: { backgroundColor: theme.colorSurfaceSubtle },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colorSurfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  rowTitle: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    // flexShrink (not flex:1) so the title yields to the variant tag and the pair
    // hugs left rather than spanning to the timestamp.
    flexShrink: 1,
  },
  rowDetail: { color: theme.colorTextSecondary },
  // Matches the EventRow / drill-in tag register so the timeline surfaces name a
  // food identically. flexShrink:0 — the title truncates, never the variant.
  rowFormatTag: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    letterSpacing: theme.trackingWide,
    fontWeight: theme.weightMedium,
    flexShrink: 0,
  },
  rowTime: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
});
