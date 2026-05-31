import { useState, type ReactElement } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { theme } from '../../constants/theme';
import { Badge } from '../ui/Badge';
import { confidenceTag, evidenceText, sampleLine } from '../../lib/signalCopy';
import type { CachedFinding, InsightType, PriorityClass } from '../../lib/signal';

// Enable the height animation on Android (off by default there).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Priority rail colour (the designed "this one matters more" cue, read before a
// word is). Safety leads in warm terracotta — clear, not alarm-red (Principle 4 /
// Dr. Chen); everything benign rides the single product accent.
const RAIL_COLOR: Record<PriorityClass, string> = {
  safety: theme.colorEventSymptom,
  insight: theme.colorAccent,
};

// ── Per-type renderer registry (§3.2 / §11f) ──────────────────────────────────
// Detection is decoupled from presentation: each insight type owns how its body
// renders. v1 ships the sentence renderer used by both v1 types (correlation,
// intake-decline). A stat or sparkline renderer (preference ④, trend ③) plugs in
// here by type — without touching the card frame, rail, or expand behaviour —
// keyed by InsightType so mixed formats still read as one calm surface.
interface InsightBodyProps {
  cached: CachedFinding;
}

function SentenceBody({ cached }: InsightBodyProps) {
  const tag = confidenceTag(cached.finding);
  return (
    <View style={styles.body}>
      <Text style={styles.sentence}>{cached.text}</Text>
      <View style={styles.metaRow}>
        {tag && <Badge label={tag} variant="muted" />}
        <Text style={styles.sample}>{sampleLine(cached.finding)}</Text>
      </View>
    </View>
  );
}

const INSIGHT_RENDERERS: Record<InsightType, (p: InsightBodyProps) => ReactElement> = {
  food_symptom_correlation: SentenceBody,
  intake_decline: SentenceBody,
};

interface Props {
  cached: CachedFinding;
  petName: string;
}

export function InsightCard({ cached, petName }: Props) {
  const [expanded, setExpanded] = useState(false);

  const Body = INSIGHT_RENDERERS[cached.finding.type];
  // Unknown future type with no registered renderer: skip the card rather than
  // crash the whole surface (forward-compatible with new detectors).
  if (!Body) return null;

  const rail = RAIL_COLOR[cached.finding.priorityClass];

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.create(theme.durationMedium, 'easeInEaseOut', 'opacity'));
    setExpanded((e) => !e);
  }

  return (
    // Whole row is the tap target (≥44pt with hitSlop) — the 3am-stumbling rule.
    <Pressable
      onPress={toggle}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={cached.text}
      accessibilityHint="Shows the evidence behind this insight"
      style={styles.row}
    >
      <View style={[styles.rail, { backgroundColor: rail }]} />
      <View style={styles.content}>
        <Body cached={cached} />
        {expanded && <Text style={styles.evidence}>{evidenceText(cached.finding, petName)}</Text>}
        <Text style={styles.expandHint}>{expanded ? 'Hide details' : "Why we're showing this"}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: theme.space2,
    minHeight: 44,
    paddingVertical: theme.space2,
  },
  rail: {
    width: 3,
    borderRadius: 2,
    opacity: 0.85,
  },
  content: {
    flex: 1,
  },
  body: {
    gap: theme.space1,
  },
  sentence: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.space1,
  },
  sample: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  evidence: {
    marginTop: theme.space1,
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: 20,
  },
  expandHint: {
    marginTop: theme.space1,
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorAccent,
  },
});
