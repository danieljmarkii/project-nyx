import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import { Divider } from '../ui/Divider';
import { SectionLabel } from '../ui/SectionLabel';
import { InsightCard } from './InsightCard';
import { useSignal } from '../../hooks/useSignal';
import { buildingIntro, coverageCopy, noPatternIntro, staleIntro } from '../../lib/signalCopy';
import type { CachedFinding, CoverageDiagnostic } from '../../lib/signal';

// Ghosted "what insights look like" previews — kept in the building state so the
// empty moment teaches what's coming (Principle 5: empty states are features).
const PREVIEW_INSIGHTS = [
  'Vomiting dropped 60% in the two weeks after switching proteins — the diet trial appears to be working.',
  'Itching tends to follow meals containing chicken. No reaction logged after salmon.',
];

export function SignalZone() {
  const { findings, coverage, displayState, petName, isLoading } = useSignal();

  // While the first cache read is in flight, hold the warm building state rather
  // than letting the empty findings flash 'stale' for a frame.
  const state = isLoading && findings.length === 0 ? 'building' : displayState;

  return (
    // Signal is the dominant zone — one elevated container holding the ordered
    // stack of insight rows (PM-decided: rows + dividers, not separate cards, so
    // it reads as one calm intelligence surface, never a dashboard dump — §3.1).
    <Card elevated>
      <SectionLabel label="Signal" style={styles.label} />
      {state === 'live' ? (
        <LiveStack findings={findings} petName={petName} />
      ) : state === 'stale' ? (
        <Text style={styles.intro}>{staleIntro(petName)}</Text>
      ) : state === 'no_pattern' ? (
        // Substantial history, nothing cleared a floor (B-051) — honest, no ghosted
        // previews (the owner has logged enough to know the surface). B-053: when
        // the engine knows WHY there's no signal yet, surface the top coverage
        // diagnostic's one-line why + ≤1 safe action instead of the generic line.
        <NoPatternState petName={petName} coverage={coverage} />
      ) : (
        <BuildingState petName={petName} />
      )}

      {/* §8 doorway into the Patterns dashboard — a quiet footer affordance, present in
          every Signal state so the deeper surface is discoverable from Home. Navigates
          AWAY to a destination (Principle 3 — not a 4th Home zone, not a tab). */}
      <Pressable
        onPress={() => router.push('/insights')}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`See all of ${petName}'s patterns`}
        style={styles.patternsLink}
      >
        <Text style={styles.patternsLinkText}>See all of {petName}'s patterns →</Text>
      </Pressable>
    </Card>
  );
}

// no_pattern — show the top coverage diagnostic (B-053) if the engine produced one,
// else the honest generic line. The diagnostic is about DATA COVERAGE, never
// wellness; the action (if any) is a calm corrective, never a nag.
function NoPatternState({
  petName,
  coverage,
}: {
  petName: string;
  coverage: CoverageDiagnostic[];
}) {
  const top = coverage[0];
  if (!top) {
    return <Text style={styles.intro}>{noPatternIntro(petName)}</Text>;
  }
  const { why, action } = coverageCopy(top, petName);
  return (
    <View>
      <Text style={styles.intro}>{why}</Text>
      {action ? <Text style={styles.coverageAction}>{action}</Text> : null}
    </View>
  );
}

// The card stack — findings are already ranked server-side (safety leads, then
// the pet's context-lead type, then tier — §5/§8); we render in that order and
// only add the visual rhythm. Hairline dividers between rows keep one container
// reading as a quiet list, not a wall of boxes.
function LiveStack({ findings, petName }: { findings: CachedFinding[]; petName: string }) {
  const ordered = [...findings].sort((a, b) => a.rank - b.rank);
  return (
    <View>
      {ordered.map((f, i) => (
        <View key={`${f.finding.type}-${f.rank}`}>
          {i > 0 && <Divider style={styles.rowDivider} />}
          <InsightCard cached={f} petName={petName} isLead={i === 0} />
        </View>
      ))}
    </View>
  );
}

function BuildingState({ petName }: { petName: string }) {
  return (
    <>
      <Text style={styles.intro}>{buildingIntro(petName)}</Text>
      <View style={styles.previews}>
        <Text style={styles.previewsHeader}>What the signal looks like:</Text>
        {PREVIEW_INSIGHTS.map((text, i) => (
          <View key={i} style={styles.previewRow}>
            <View style={styles.previewAccentBar} />
            <Text style={styles.previewText}>{text}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: theme.space2,
  },
  // §8 quiet doorway into the dashboard — a hairline-separated footer link.
  patternsLink: {
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    paddingTop: theme.space2,
    marginTop: theme.space1,
  },
  patternsLinkText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccent,
  },
  intro: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: 22,
    marginBottom: theme.space2,
  },
  // The single corrective action under a coverage diagnostic (B-053) — calm and
  // gently actionable, never a nag. Sits just below the "why" line.
  coverageAction: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    lineHeight: 20,
    // Match the single-text states' bottom spacing so the two-line (action) variant
    // doesn't sit tighter against the card edge (code-review nit).
    marginBottom: theme.space2,
  },
  rowDivider: {
    marginHorizontal: -theme.space1,
  },
  previews: {
    gap: theme.space1,
  },
  previewsHeader: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextTertiary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWide,
    marginBottom: 4,
  },
  previewRow: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: theme.colorNeutralLight,
    borderRadius: theme.radiusSmall,
    padding: theme.space2,
  },
  previewAccentBar: {
    width: 2,
    borderRadius: 1,
    backgroundColor: theme.colorAccent,
    opacity: 0.5,
  },
  previewText: {
    flex: 1,
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
    lineHeight: 20,
    opacity: 0.65,
  },
});
