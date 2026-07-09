import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { Check } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import { EventIcon } from '../event/EventIcon';
import type { EventTypeKey } from '../../constants/eventTypes';

// The three Landing value previews (B-251 PR 5, spec §3.0 / §5, mockup 01–03).
// Each is a tangible Culprit UI — a Signal insight, the quick-log, a vet summary —
// modelled on the real product's component styles (elevated surface, the
// Newsreader display headline that InsightCard uses, the EVENT_TYPES glyphs,
// theme tokens only) so a marketing preview never drifts into promising a product
// we don't ship (Eng note). They are MARKETING surfaces: they show what the owner
// GETS, and must never imply required data entry (spec §3.0 / Sam's Principle-1
// caution) — the sample values below are illustrative, not a form. The Signal
// sample states a DESCRIPTIVE trend, never a causal one ("down 60% over two weeks",
// not "since you switched to turkey") — the real engine's clinical guardrails
// forbid implied causation (generate-signal CAUSAL_RE), so the preview mustn't
// depict a voice the product would reject (code-review).
export type ValuePreviewVariant = 'signal' | 'log' | 'report';

// Copy kept as named constants so the nyx-voice pass reads them in one place.
// First-person pet / second-person owner, specific over generic, no exclamation
// marks (spec §5).
const COPY: Record<ValuePreviewVariant, { headline: string; body: string }> = {
  signal: {
    headline: "Patterns you can't see.",
    body: 'Culprit tells you what the data means — not just what happened.',
  },
  log: {
    headline: 'A couple of taps today.\nA clearer picture tomorrow.',
    body: "Log a meal or a symptom in seconds — it's what lets Culprit catch what's changing.",
  },
  report: {
    headline: 'Ready for the vet.',
    body: 'Hand your vet a clear, clinical summary in one tap. Free, always.',
  },
};

// A11y: each mock is exposed as a single described image, so a screen reader
// hears the value of the preview once, rather than reading the illustrative
// sample numbers cell-by-cell (which would sound like real, enterable data).
const A11Y_LABEL: Record<ValuePreviewVariant, string> = {
  signal: 'Preview of a Culprit insight: vomiting is down 60% over the last two weeks.',
  log: 'Preview of the Culprit quick-log: a meal or a symptom logged in a couple of taps.',
  report: 'Preview of a Culprit vet summary: a clear, clinical one-tap report.',
};

// The quick-log tiles mirror the real quick-log entry points (constants/eventTypes).
// Vomit is shown "just tapped" — the illustrative logged event the toast confirms.
const LOG_TILES: { key: EventTypeKey; label: string; hot?: boolean; symptom?: boolean }[] = [
  { key: 'meal', label: 'Meal' },
  { key: 'vomit', label: 'Vomit', hot: true, symptom: true },
  { key: 'stool_normal', label: 'Stool' },
  { key: 'other', label: 'More' },
];

const REPORT_ROWS: { k: string; v: string; down?: boolean }[] = [
  { k: 'Vomiting', v: '6 episodes', down: true },
  { k: 'Current diet', v: 'Hydrolyzed protein' },
  { k: 'Weight', v: '15.2 kg · stable' },
];

export function ValuePreview({ variant }: { variant: ValuePreviewVariant }) {
  const copy = COPY[variant];
  return (
    <View style={styles.stage}>
      <View
        style={styles.mini}
        accessible
        accessibilityRole="image"
        accessibilityLabel={A11Y_LABEL[variant]}
        testID={`value-preview-${variant}`}
      >
        {variant === 'signal' ? <SignalMock /> : variant === 'log' ? <LogMock /> : <ReportMock />}
      </View>

      <View style={styles.copy}>
        <Text style={styles.headline}>{copy.headline}</Text>
        <Text style={styles.body}>{copy.body}</Text>
      </View>
    </View>
  );
}

// ── Signal ────────────────────────────────────────────────────────────────────
// The differentiator: a computed insight in the Newsreader display face (the same
// face InsightCard's lead headline wears), over a calm declining trend line in the
// single product accent. "Tap to see why" echoes the real card's expand affordance.
function SignalMock() {
  return (
    <>
      <Text style={styles.label}>Signal</Text>
      <Text style={styles.signalHeadline}>Vomiting is down 60% over the last two weeks.</Text>
      <Svg width="100%" height={40} viewBox="0 0 220 40" style={styles.spark}>
        <Path
          d="M4 8 L44 14 L84 12 L124 24 L164 30 L212 34"
          stroke={theme.colorAccent}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Circle cx={212} cy={34} r={3.4} fill={theme.colorAccent} />
      </Svg>
      {/* Depicts the real card's expand affordance without commanding a tap — the
          mock is non-interactive, so an imperative "Tap…" would dead-end (pm-review). */}
      <Text style={styles.tapHint}>See why →</Text>
    </>
  );
}

// ── Quick-log ─────────────────────────────────────────────────────────────────
function LogMock() {
  const rows = [LOG_TILES.slice(0, 2), LOG_TILES.slice(2, 4)];
  return (
    <>
      <Text style={styles.label}>Quick-log</Text>
      <View style={styles.qgrid}>
        {rows.map((row, i) => (
          <View key={i} style={styles.qrow}>
            {row.map((t) => (
              <View key={t.key} style={[styles.qtile, t.hot && styles.qtileHot]}>
                <View style={[styles.qIcon, t.symptom ? styles.qIconSymptom : styles.qIconAccent]}>
                  <EventIcon
                    type={t.key}
                    size={16}
                    color={t.symptom ? theme.colorEventSymptom : theme.colorAccent}
                  />
                </View>
                <Text style={styles.qLabel}>{t.label}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      <View style={styles.toast}>
        <View style={styles.toastCheck}>
          <Check size={11} color={theme.colorTextOnDark} strokeWidth={3} />
        </View>
        <Text style={styles.toastText}>Logged · Vomit · 2:14 PM</Text>
      </View>
    </>
  );
}

// ── Vet summary ───────────────────────────────────────────────────────────────
// Dense, scannable, no decoration (Principle 6) — the same key/value row rhythm
// the real report uses. "↓" rides the accent to read as improvement.
function ReportMock() {
  return (
    <>
      <Text style={styles.label}>Vet summary</Text>
      <Text style={styles.vMeta}>Mochi · French Bulldog · Apr 6 – Jul 5</Text>
      {REPORT_ROWS.map((r) => (
        <View key={r.k} style={styles.vRow}>
          <Text style={styles.vKey}>{r.k}</Text>
          <Text style={styles.vVal}>
            {r.v}
            {r.down ? <Text style={styles.vDown}> ↓</Text> : null}
          </Text>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  // Fills one swipe page; the mini + copy are centred so the previews sit steady
  // as the owner swipes between them.
  stage: {
    flex: 1,
    justifyContent: 'center',
    gap: theme.space2,
  },
  // The product-preview surface — mirrors Card `elevated` (surface fill + md
  // shadow) with a hairline for definition on the light canvas.
  mini: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusLarge,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    padding: theme.space2,
    ...shadows.md,
  },
  // Accent micro-label (the "Signal" / "Quick-log" / "Vet summary" tag).
  label: {
    fontSize: theme.textXS,
    fontWeight: theme.weightSemibold,
    color: theme.colorAccent,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWidest,
    marginBottom: theme.space1,
  },

  // Signal
  signalHeadline: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textLG,
    lineHeight: theme.lineHeightBody,
    letterSpacing: theme.trackingTight,
    color: theme.colorTextPrimary,
  },
  spark: {
    marginTop: theme.space1,
  },
  tapHint: {
    marginTop: theme.space1,
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },

  // Quick-log
  qgrid: {
    gap: theme.space1,
  },
  qrow: {
    flexDirection: 'row',
    gap: theme.space1,
  },
  qtile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space1,
    borderRadius: theme.radiusSmall,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    backgroundColor: theme.colorSurface,
  },
  qtileHot: {
    borderColor: theme.colorAccent,
    backgroundColor: theme.colorAccentLight,
  },
  qIcon: {
    width: theme.space3,
    height: theme.space3,
    borderRadius: theme.radiusFull,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qIconAccent: {
    backgroundColor: theme.colorAccentLight,
  },
  qIconSymptom: {
    backgroundColor: theme.colorEventSymptomLight,
  },
  qLabel: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    marginTop: theme.space2,
  },
  toastCheck: {
    width: theme.space2,
    height: theme.space2,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },

  // Vet summary
  vMeta: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: theme.spaceMicro,
    marginBottom: theme.space1,
  },
  vRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.space1,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
  },
  vKey: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  vVal: {
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    fontVariant: ['tabular-nums'],
  },
  vDown: {
    color: theme.colorAccent,
    fontWeight: theme.weightSemibold,
  },

  // Copy block beneath the mock — the display-face headline + a calm subline.
  copy: {
    gap: theme.spaceMicro,
  },
  headline: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textXL,
    lineHeight: theme.text2XL,
    letterSpacing: theme.trackingTight,
    color: theme.colorTextPrimary,
  },
  body: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },
});
