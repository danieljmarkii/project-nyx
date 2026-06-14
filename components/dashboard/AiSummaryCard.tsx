import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import { summaryBuildingCopy, summaryGroundingLabel, type CachedSummary } from '../../lib/summaryCopy';

// AiSummaryCard — the "Patterns" dashboard's AI-forward centerpiece (requirements §7).
//
// Replaces ComingSoonSummary in the SAME slot (§7.1 — zero layout change): a warm narrative
// pinned at the top of the dashboard that synthesises the cards below into a few plain
// sentences. The text is read CACHE-ONLY from ai_signals.summary (useSummary) — the dashboard
// never makes a live LLM call on open. Every number in it traces to a deterministic clause
// (server validateSummary); the model only phrased it. It NEVER reassures on absence, never
// asserts a cause, never names a disease — those are enforced server-side, and the building
// copy here mirrors that restraint (summaryBuildingCopy).
//
// Grounding ("show the work", §7): the summary sits directly above the very cards it draws
// from, and the footer names + jumps to them — every claim is backed by a card the owner can
// see. (Per-claim deep-linking into a card's detail screen lands with the card→detail
// follow-up, B-093 — v1 cards are display-only.)

interface Props {
  summary: CachedSummary | null;
  petName: string;
  /** Scrolls the dashboard to the cards the summary draws from (the grounding affordance). */
  onJumpToCards?: () => void;
}

export function AiSummaryCard({ summary, petName, onJumpToCards }: Props) {
  const who = petName.trim().length > 0 ? petName : 'your pet';
  return (
    <Card>
      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>Summary</Text>
      </View>

      {summary ? (
        <>
          <Text style={styles.body}>{summary.text}</Text>
          {onJumpToCards ? (
            <Pressable
              onPress={onJumpToCards}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${summaryGroundingLabel(summary.evidence)} for ${who}`}
              style={styles.grounding}
            >
              <Text style={styles.groundingText}>{summaryGroundingLabel(summary.evidence)} ↓</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        // Cold start / pre-deploy / a pet without enough to summarise yet (§10 calibration
        // voice) — warm, forward-looking, never an all-clear.
        <Text style={styles.buildingBody}>{summaryBuildingCopy(who)}</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    marginBottom: theme.space1,
  },
  eyebrow: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWidest,
  },
  body: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    lineHeight: 24,
  },
  buildingBody: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: 22,
  },
  grounding: {
    marginTop: theme.space2,
    minHeight: 44,
    justifyContent: 'center',
  },
  groundingText: {
    fontSize: theme.textSM,
    color: theme.colorAccent,
    fontWeight: theme.weightMedium,
  },
});
