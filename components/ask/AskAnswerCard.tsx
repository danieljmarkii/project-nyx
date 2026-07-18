import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';
import { AskAnswerComponent } from './AskAnswerComponent';
import { AskChip } from './AskChip';
import { resolveTapThrough, tapThroughLabel, type AskAnswerBody, type AskNav } from '../../lib/ask';

// One assistant answer (mock §2–§4). Answer-first anatomy (D6), top to bottom:
//   1. safetyLead — a live engine SAFETY finding, relayed verbatim, LEADING the answer
//      as its own firm-but-calm card (§7.2 / Principle 3: safety always leads, never
//      dropped). Server-attached; the client only renders it.
//   2. the main card — a GENERAL-mode answer is visibly fenced ("General guidance — not
//      from {pet}'s record", §7.5); otherwise the Newsreader headline → supporting
//      detail → the app's own component (chart/list) → the provenance row (denominator +
//      window + tap-through to source).
//   3. follow-up chips — continue the conversation in-session (D8).
//
// Every numeral shown was built server-side from a tool result; this component never
// computes one. The tap-through is the D6 interaction the whole conversation lifetime is
// built to survive (D8) — it's just an in-app navigation, so the store keeps context.
interface Props {
  body: AskAnswerBody;
  petName: string;
  /** Send a follow-up question (a tapped follow-up chip). */
  onAsk: (question: string) => void;
  /** Open a provenance tap-through target (resolved to a router nav descriptor). */
  onTapThrough: (nav: AskNav) => void;
}

export function AskAnswerCard({ body, petName, onAsk, onTapThrough }: Props) {
  const prov = body.provenance;
  const nav = resolveTapThrough(prov?.tapThrough);
  const goLabel = tapThroughLabel(prov?.tapThrough);

  return (
    <View style={styles.wrap}>
      {/* 1. Leading safety card — the relayed engine finding, VERBATIM, on its own calm
          safety surface above the answer (§7.2). No net-new label copy: the finding text
          is the engine's own validated string, and any eyebrow above a safety finding is
          safety-adjacent copy that gates on clinical-guardrails + Dr. Chen (§4, A7) — so
          the card leads with the finding itself, not a build-time label. */}
      {body.safetyLead ? (
        <View style={styles.safetyCard} accessibilityRole="alert">
          <Text style={styles.safetyText}>{body.safetyLead}</Text>
        </View>
      ) : null}

      {/* 2. The answer card. */}
      <View style={styles.card}>
        {body.generalMode ? (
          <Text style={styles.fence}>General guidance — not from {petName}'s record</Text>
        ) : null}

        {body.headline ? <Text style={styles.headline}>{body.headline}</Text> : null}
        {body.detail ? <Text style={styles.detail}>{body.detail}</Text> : null}

        {body.component ? <AskAnswerComponent descriptor={body.component} /> : null}

        {prov && (prov.denominator || goLabel) ? (
          <View style={styles.prov}>
            <Text style={styles.provText} numberOfLines={2}>
              {prov.denominator ?? prov.window ?? ''}
            </Text>
            {nav && goLabel ? (
              <TouchableOpacity
                onPress={() => onTapThrough(nav)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={goLabel}
              >
                <Text style={styles.provGo}>{goLabel} →</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* 3. Follow-up chips — continue in-session. */}
      {body.followups.length > 0 ? (
        <View style={styles.followups}>
          {body.followups.map((f, i) => (
            <AskChip key={`${f}-${i}`} label={f} onPress={() => onAsk(f)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: theme.space2,
  },
  // Safety card — the calm safety register (rose border/tint, never a klaxon), mirroring
  // the cross-pet safety banner's tokens (colorEventSymptomBorder + symptom-light).
  safetyCard: {
    backgroundColor: theme.colorEventSymptomLight,
    borderWidth: 1,
    borderColor: theme.colorEventSymptomBorder,
    borderRadius: theme.radiusMedium,
    padding: theme.space2,
  },
  safetyText: {
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextPrimary,
  },
  card: {
    backgroundColor: theme.colorSurface,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
  },
  fence: {
    fontFamily: theme.fontBodySemibold,
    fontSize: theme.textXS,
    letterSpacing: theme.trackingWide,
    textTransform: 'uppercase',
    color: theme.colorTextTertiary,
    marginBottom: theme.space1,
  },
  // The Newsreader display face — the AI Signal's voice (D6 headline).
  headline: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textLG,
    lineHeight: 24,
    letterSpacing: theme.trackingTight,
    color: theme.colorTextPrimary,
  },
  detail: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextSecondary,
    marginTop: theme.space1,
  },
  prov: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space2,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    marginTop: theme.space2,
    paddingTop: theme.space2,
  },
  provText: {
    flex: 1,
    fontFamily: theme.fontBody,
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  provGo: {
    fontFamily: theme.fontBodySemibold,
    fontSize: theme.textSM,
    color: theme.colorAccent,
  },
  followups: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space1,
  },
});
