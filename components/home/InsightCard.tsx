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
import {
  confidenceTag,
  displayProteinName,
  dotLaneA11yLabel,
  dotLaneModel,
  evidenceText,
  isJointCandidate,
  isTimingFinding,
  phoneScript,
  proteinCluster,
  sampleLine,
  stackedCompareA11yLabel,
  timingCompareRows,
  timingControlDisclosure,
  timingReceiptDegrades,
} from '../../lib/signalCopy';
import { DotLane, EvidenceBox, PhoneScript, StackedCompare } from './SignalReceipts';
import type { CachedFinding, InsightType, PriorityClass, SignalFinding } from '../../lib/signal';

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
  // The lead (top-ranked) finding is the AI Signal headline — it alone wears the
  // Newsreader display face at textSignal size (v1.2 §4 / type-signal preview).
  // Subsequent findings stay in the body face so the surface reads as one calm
  // headline + supporting rows, never a column of competing serif headlines.
  isLead: boolean;
  // The Signal/Home design uplift is dark behind `signal_design_v2` (SR-1, B-721).
  // When false the body renders EXACTLY the shipped surface (byte-identical, FR-FLAG-2);
  // when true a timing finding gains its card-face evidence strip (§4).
  designV2: boolean;
}

function SentenceBody({ cached, isLead, designV2 }: InsightBodyProps) {
  const tag = confidenceTag(cached.finding);
  return (
    <View style={styles.body}>
      <Text style={[styles.sentence, isLead && styles.sentenceLead]}>{cached.text}</Text>
      {cached.finding.type === 'food_symptom_correlation' && isJointCandidate(cached.finding) && (
        <LinkedPair proteins={proteinCluster(cached.finding)} />
      )}
      <CardFaceReceipt finding={cached.finding} designV2={designV2} />
      <View style={styles.metaRow}>
        {tag && <Badge label={tag} variant="muted" />}
        <Text style={styles.sample}>{sampleLine(cached.finding)}</Text>
      </View>
    </View>
  );
}

// ── Card-face receipt (SR-1, §4) ──────────────────────────────────────────────
// Between the sentence and the sample line, a timing finding shows its glance
// evidence: Shape A (dot lane) at v1 sample sizes, degrading to Shape C (within-window
// vs outside) above the legibility cap — never bins (SD-4). Every other type stays
// sentence-only (S1 safety faces stay plain; S10 correlation/intake/reflection are
// already carried by their sample line). Returns null when the flag is off or the type
// carries no strip, so the flag-off tree is unchanged (FR-FLAG-2).
function CardFaceReceipt({ finding, designV2 }: { finding: SignalFinding; designV2: boolean }) {
  if (!designV2 || !isTimingFinding(finding)) return null;
  if (timingReceiptDegrades(finding)) {
    return <StackedCompare rows={timingCompareRows(finding)} />;
  }
  return <DotLane model={dotLaneModel(finding)} />;
}

// The card-face receipt's evidence phrased as one sentence, for the card's OWN
// accessibilityLabel — the strip Views are decorative (a self-label on them is
// swallowed by the outer Pressable and never reaches VoiceOver; see SignalReceipts).
// Null when the flag is off or the type carries no card-face strip.
function cardFaceReceiptA11y(finding: SignalFinding, designV2: boolean): string | null {
  if (!designV2 || !isTimingFinding(finding)) return null;
  return timingReceiptDegrades(finding)
    ? stackedCompareA11yLabel(timingCompareRows(finding))
    : dotLaneA11yLabel(finding);
}

// ── Expanded-state evidence (SR-1, §4) ────────────────────────────────────────
// Additive under the flag, below the unchanged "Why we're showing this" prose. Timing
// expands draw the two-sided control side + the honest un-timeable remainder (S2/S9);
// safety expands render the phone-call script — the facts to say on a vet call (§9),
// sans the active-meds line (that rides SR-4's payload). Correlation and reflection add
// nothing here in SR-1 (reflection's density-gated compare is SR-5).
function ExpandedReceipts({ finding, petName }: { finding: SignalFinding; petName: string }) {
  if (isTimingFinding(finding)) {
    const disclosure = timingControlDisclosure(finding);
    const rows = timingReceiptDegrades(finding) ? null : timingCompareRows(finding);
    // Degraded + everything timeable → the card-face compare already said it all.
    if (!rows && !disclosure) return null;
    return (
      <EvidenceBox title="The other side of the picture">
        {rows && <StackedCompare rows={rows} />}
        {disclosure ? (
          <Text style={[styles.disclosure, rows ? styles.disclosureSpaced : null]}>{disclosure}</Text>
        ) : null}
      </EvidenceBox>
    );
  }
  const facts = phoneScript(finding, petName);
  if (facts) {
    return (
      <EvidenceBox title="If you call your clinic, the facts to have ready">
        <PhoneScript facts={facts} />
      </EvidenceBox>
    );
  }
  return null;
}

// The joint-candidate linked pair (B-351 D5, mock §3). Two proteins the engine cannot
// separate, shown as linked chips with a three-word note — NOT a wrapping text pill,
// which is what an earlier draft used and what the mock review rejected.
//
// Why a visual row and not just more sentence: the honesty here is a STANDING PROPERTY
// of the finding ("these two travel together"), and a property reads better as structure
// than as another clause the eye has to parse. The sentence keeps the action; this row
// keeps the caveat. It renders for every member, at any cluster size — a cluster of four
// shows four chips rather than silently truncating, because dropping a member from the
// display is the exact false exoneration the joint candidate exists to prevent.
function LinkedPair({ proteins }: { proteins: string[] }) {
  return (
    <View
      style={styles.pairRow}
      accessibilityLabel={`${proteins.map(displayProteinName).join(' and ')} — always fed together`}
    >
      {proteins.map((protein, i) => (
        <View key={protein} style={styles.pairItem}>
          {i > 0 && <Text style={styles.pairLink}>+</Text>}
          <View style={styles.pairChip}>
            <Text style={styles.pairChipText}>{displayProteinName(protein)}</Text>
          </View>
        </View>
      ))}
      <Text style={styles.pairNote}>always fed together</Text>
    </View>
  );
}

const INSIGHT_RENDERERS: Record<InsightType, (p: InsightBodyProps) => ReactElement> = {
  food_symptom_correlation: SentenceBody,
  intake_decline: SentenceBody,
  // Reflection (③, B-051) — a descriptive count, rendered as a calm sentence like
  // the other types; it rides the benign 'insight' rail, never the safety rail.
  reflection: SentenceBody,
  // Symptom-frequency worsening (④) — also a calm sentence, but a SAFETY finding, so
  // it rides the safety rail (via priorityClass) and leads the surface.
  symptom_worsening: SentenceBody,
  // Symptom chronicity / persistence (⑦, B-182) — a calm sentence on the SAFETY rail: the
  // "this has been going on for weeks and isn't resolving" statement. No confidence tag (a
  // deterministic count shows its sample size); leads the surface below intake-decline.
  symptom_chronicity: SentenceBody,
  // Per-incident visual red flag (B-340) — a calm sentence on the SAFETY rail: what a logged photo
  // showed (blood / foreign material), routed to the vet. Leads the whole surface (top of the
  // safety band). No confidence tag; the sentence itself carries the unconfirmed-AI-read framing.
  incident_red_flag: SentenceBody,
  // Postprandial timing (⑤, B-078) — a descriptive timing count, rendered as a calm
  // sentence on the benign 'insight' rail; no confidence tag (it shows its sample size).
  postprandial_timing: SentenceBody,
  // Time-of-day clustering (⑥, B-079) — a descriptive clock-band count, also a calm
  // sentence on the 'insight' rail; no confidence tag (it shows its sample size).
  timeofday_clustering: SentenceBody,
};

interface Props {
  cached: CachedFinding;
  petName: string;
  // True for the top-ranked row only — gates the display-face headline.
  isLead?: boolean;
  // Signal/Home design uplift, dark behind `signal_design_v2` (SR-1, B-721). Default
  // false so every non-uplift caller (and the flag-off path) renders the shipped card
  // byte-identical; SignalZone resolves the allowlist flag and passes the real value.
  designV2?: boolean;
}

export function InsightCard({ cached, petName, isLead = false, designV2 = false }: Props) {
  const [expanded, setExpanded] = useState(false);

  const Body = INSIGHT_RENDERERS[cached.finding.type];
  // Unknown future type with no registered renderer: skip the card rather than
  // crash the whole surface (forward-compatible with new detectors).
  if (!Body) return null;

  const rail = RAIL_COLOR[cached.finding.priorityClass];

  // The card is one accessible button (the whole row), so its label must carry the
  // card-face glance evidence too — a self-label on the receipt Views would be swallowed
  // by this container and never reach VoiceOver (code-review / MedStrip idiom). Flag-off
  // (or a non-timing type) → null → the label stays exactly the shipped `cached.text`.
  const receiptA11y = cardFaceReceiptA11y(cached.finding, designV2);
  const accessibilityLabel = receiptA11y ? `${cached.text}. ${receiptA11y}` : cached.text;

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
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Shows the evidence behind this insight"
      style={styles.row}
    >
      <View style={[styles.rail, { backgroundColor: rail }]} />
      <View style={styles.content}>
        <Body cached={cached} isLead={isLead} designV2={designV2} />
        {expanded && (
          <>
            <Text style={styles.evidence}>{evidenceText(cached.finding, petName)}</Text>
            {designV2 && <ExpandedReceipts finding={cached.finding} petName={petName} />}
          </>
        )}
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
    lineHeight: theme.lineHeightBody,
  },
  // AI Signal headline — Newsreader display at 26 / 1.3, tracking −0.3, weight
  // 400 (the only Newsreader face loaded; never set fontWeight here or RN will
  // request an unloaded bold and fall back). Mirrors type-signal preview.
  sentenceLead: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textSignal,
    lineHeight: theme.lineHeightSignal,
    letterSpacing: theme.trackingTight,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.space1,
  },
  // Linked pair (B-351 D5). Wraps rather than scrolls — a cluster member must never be
  // hidden off-screen (the B-146 rule, and here it would also be a false exoneration).
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.space1,
    marginTop: theme.spaceMicro,
  },
  pairItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  pairLink: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  pairChip: {
    paddingHorizontal: theme.space1,
    paddingVertical: theme.spaceMicro,
    borderRadius: theme.radiusFull,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    backgroundColor: theme.colorSurfaceSubtle,
  },
  pairChipText: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  pairNote: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  sample: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  evidence: {
    marginTop: theme.space1,
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },
  // The honest un-timeable remainder inside the expanded control-side box (§4).
  disclosure: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
  },
  disclosureSpaced: {
    marginTop: theme.space0_5,
  },
  expandHint: {
    marginTop: theme.space1,
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorAccent,
  },
});
