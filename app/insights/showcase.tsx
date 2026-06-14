import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { theme } from '../../constants/theme';
import { MetricCard } from '../../components/dashboard/MetricCard';
import { RankingCard } from '../../components/dashboard/RankingCard';
import { FrequencyCalendarCard } from '../../components/dashboard/FrequencyCalendarCard';
import { CompositionCard } from '../../components/dashboard/CompositionCard';
import { MetricDetailScreen } from '../../components/dashboard/MetricDetailScreen';
import {
  selectCardState,
  describeCountDelta,
  isEstablishedCount,
  intakeNotObservedNote,
} from '../../lib/dashboardCards';
import { notEnoughData, type DayFrequencyBucket } from '../../lib/analytics';

// ⚠️ TEMPORARY — B-023 PR 2 on-device QA harness + card catalog.
//
// PR 2 ships the dashboard's visual language (the reusable card set) but NOT the real
// dashboard screen or its Home entry — those are PR 3 (app/insights/index.tsx + the
// Signal/Trend/Today doorways). This screen exists ONLY so the card set can be seen
// and judged on a device for this PR (the Designer-lead review + the 10-second glance).
// It is reached via a clearly-marked dev row on the Profile tab. REMOVE both when PR 3
// lands the real entry. The cards are wired through the real lib/dashboardCards helpers
// exactly as PR 3 will wire them, so this doubles as an integration check.

const PET = 'Nyx';

// A month of symptom days for the frequency grid (a sprinkling of events).
function buildMonthBuckets(): DayFrequencyBucket[] {
  const counts: Record<number, number> = { 2: 1, 5: 2, 6: 1, 13: 1, 19: 3, 20: 1, 26: 1, 28: 2 };
  const base = Date.UTC(2026, 4, 16); // May 16 2026 = oldest day
  const out: DayFrequencyBucket[] = [];
  for (let i = 0; i < 30; i++) {
    const total = counts[i] ?? 0;
    out.push({
      date: new Date(base + i * 86_400_000).toISOString().slice(0, 10),
      total,
      byType: total > 0 ? { vomit: total } : {},
    });
  }
  return out;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return <Text style={styles.caption}>{children}</Text>;
}

export default function DashboardShowcaseScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Card preview (dev)', headerShown: true }} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.note}>
          Dev preview of the B-023 dashboard cards. Not the real dashboard (that&apos;s PR 3).
        </Text>

        <Section title="MetricCard — the §13 #6 colour ruling">
          <Caption>Adverse rising → concern (the one &quot;bad&quot; colour)</Caption>
          <MetricCard
            label="Vomiting"
            value="5"
            polarity="adverse"
            established={isEstablishedCount(5, 2)}
            delta={5 - 2}
            deltaLabel={describeCountDelta(5, 2, 'month')}
            sparkData={[1, 0, 2, 1, 0, 3, 2, 5]}
            petName={PET}
          />

          <Caption>Adverse falling → calm/muted, never a green &quot;win&quot;</Caption>
          <MetricCard
            label="Loose stool"
            value="1"
            polarity="adverse"
            established={isEstablishedCount(1, 4)}
            delta={1 - 4}
            deltaLabel={describeCountDelta(1, 4, 'month')}
            sparkData={[4, 3, 4, 2, 1, 1]}
            petName={PET}
          />

          <Caption>Single observation (n=1) → neutral, in either direction</Caption>
          <MetricCard
            label="Lethargy"
            value="1"
            polarity="adverse"
            established={isEstablishedCount(1, 0)}
            delta={1 - 0}
            deltaLabel={describeCountDelta(1, 0, 'month')}
            sparkData={[0, 0, 1]}
            petName={PET}
          />

          <Caption>Positive metric rising → the one quiet win colour (+ free-feeding note)</Caption>
          {/* `established` is hard-coded here because this is a static preview. PR 3,
              wiring live data, MUST derive it from the analytics result — for a RATE,
              "the result was not the notEnoughData sentinel"; for a COUNT,
              isEstablishedCount(current, prior) — so n=1 can never earn a verdict colour
              (adversarial-review INSUFFICIENT note). */}
          <MetricCard
            label="Meals finished"
            value="88%"
            polarity="positive"
            established
            delta={+0.12}
            deltaLabel="up from 76% last month"
            sparkData={[0.6, 0.7, 0.72, 0.8, 0.88]}
            note={intakeNotObservedNote()}
            petName={PET}
          />

          <Caption>Neutral metric → never a verdict colour, even when established</Caption>
          <MetricCard
            label="Meals logged"
            value="62"
            polarity="neutral"
            established
            delta={62 - 58}
            deltaLabel={describeCountDelta(62, 58, 'month')}
            sparkData={[12, 14, 13, 11, 12]}
            petName={PET}
          />

          <Caption>Below the sample floor → calibration state (never a fabricated number)</Caption>
          <MetricCard
            label="Meals finished"
            value=""
            polarity="positive"
            state={selectCardState(notEnoughData(2, 4))}
            calibrationUnit="meal"
            petName={PET}
          />

          <Caption>Genuinely nothing logged → warm empty state (never an all-clear)</Caption>
          <MetricCard
            label="Vomiting"
            value="0"
            polarity="adverse"
            state={{ kind: 'empty' }}
            emptyMessage="No vomiting logged this month."
            petName={PET}
          />
        </Section>

        <Section title="RankingCard — descriptive intake, not preference">
          <Caption>Top food (a treat tops the list → tagged honestly)</Caption>
          <RankingCard
            title="Top food"
            entries={[
              { key: 'a', label: 'Tiki Cat Tuna', value: '12 meals' },
              { key: 'b', label: 'Temptations', value: '6 logs', tag: 'treat' },
              { key: 'c', label: 'Wellness Pâté', value: '5 meals' },
            ]}
            petName={PET}
          />
          <Caption>Top protein (canonicalized, meal-based)</Caption>
          <RankingCard
            title="Top protein"
            entries={[
              { key: 'tuna', label: 'tuna', value: '14×' },
              { key: 'chicken', label: 'chicken', value: '9×' },
              { key: 'turkey', label: 'turkey', value: '4×' },
            ]}
          />
          <Caption>Below the ranking floor → calibration state</Caption>
          <RankingCard
            title="Top protein"
            entries={[]}
            state={selectCardState(notEnoughData(3, 4))}
            calibrationUnit="meal"
            petName={PET}
          />
        </Section>

        <Section title="FrequencyCalendarCard — how often, which days">
          <FrequencyCalendarCard title="Vomiting" buckets={buildMonthBuckets()} symptomType="vomit" />
          <Caption>Nothing logged → warm empty state</Caption>
          <FrequencyCalendarCard
            title="Loose stool"
            buckets={buildMonthBuckets().map((b) => ({ ...b, total: 0, byType: {} }))}
            emptyMessage="No loose stool logged this month."
          />
        </Section>

        <Section title="CompositionCard — meals vs treats (descriptive)">
          <CompositionCard composition={{ meal: 18, treat: 6, other: 0, unclassified: 0, total: 24 }} />
        </Section>

        <Section title="MetricDetailScreen — Week / Month / 3-Month">
          <MetricDetailScreen
            title="Vomiting"
            polarity="adverse"
            petName={PET}
            calibrationUnit="day"
            windows={{
              week: {
                value: '1',
                series: [0, 1, 0, 0],
                established: false,
                baselineRead: 'One episode this week — too few to read against a baseline yet.',
                state: selectCardState(notEnoughData(1, 4)),
              },
              month: {
                value: '9',
                series: [1, 0, 2, 1, 0, 3, 2],
                established: true,
                delta: 9 - 6,
                deltaLabel: describeCountDelta(9, 6, 'month'),
                baselineRead: 'A little more vomiting than a usual month for Nyx — worth keeping an eye on.',
              },
              '3month': {
                value: '21',
                series: [4, 6, 5, 3, 3],
                established: true,
                delta: 21 - 26,
                deltaLabel: describeCountDelta(21, 26, '3month'),
                baselineRead: 'Calmer over three months than the stretch before it.',
              },
            }}
          />
        </Section>

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  scroll: {
    padding: theme.space3,
    gap: theme.space3,
  },
  note: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    fontStyle: 'italic',
  },
  section: {
    gap: theme.space2,
  },
  sectionTitle: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWidest,
  },
  caption: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: theme.space1,
  },
  bottomPad: {
    height: theme.space5,
  },
});
