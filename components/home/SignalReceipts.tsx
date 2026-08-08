// Signal receipts (SR-1, B-721) — the evidence strips for the Signal/Home design
// uplift, rendered dark behind `signal_design_v2` (docs/nyx-signal-home-requirements.md
// §4). Hand-rolled Views, no chart library on Home (Dir. of Eng — matches TrendZone;
// zero new dependencies). Two shapes ship:
//
//   Shape A — dot lane: one dot per timeable episode, split by the named window, the
//             out-of-window dots pale but present (the exceptions are the honesty).
//   Shape C — stacked compare: labelled rows, a proportional bar, a printed count.
//
// The card-face dot lane DEGRADES to the compare above the legibility cap (§4 / SD-4),
// never to bins. The pure geometry + copy live in lib/signalCopy.ts so this file is
// layout-only. Colours + inter-element spacing are theme tokens; the receipt's own
// fixed geometry (lane/bar height, dot size, the count column) is raw px, like the
// card rail's `width: 3` in InsightCard — component-internal dimensions, not tokens.

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../constants/theme';
import type { CompareRow, DotLaneModel, PhoneScriptFact } from '../../lib/signalCopy';

// Half a dot's width/height — used to centre a dot on its (left, 50%) anchor without
// percentage transforms (which RN doesn't support).
const DOT_SIZE = 7;
const DOT_HALF = DOT_SIZE / 2;

const TONE_FILL: Record<CompareRow['tone'], string> = {
  concern: theme.colorEventSymptom, // rose — the pattern side (the symptom hue, used descriptively)
  muted: theme.colorTextDisabled, // neutral grey — the control side
  calm: theme.colorAccent, // teal — a genuine improvement side (reserved; unused in SR-1)
};

// ── Shape A — the dot lane ────────────────────────────────────────────────────
export function DotLane({
  model,
  accessibilityLabel,
}: {
  model: DotLaneModel;
  accessibilityLabel: string;
}) {
  return (
    // No own margin: on the card face the parent body's `gap` spaces the lane from
    // the sentence and meta; the axis row hugs the lane via its own small top margin.
    <View accessible accessibilityLabel={accessibilityLabel}>
      <View style={styles.lane}>
        {model.bands.map((b, i) => (
          <View
            key={`band-${i}`}
            style={[styles.band, { left: `${b.start * 100}%`, width: `${(b.end - b.start) * 100}%` }]}
          />
        ))}
        {model.dots.map((d, i) => (
          <View
            key={`dot-${i}`}
            style={[styles.dot, d.inWindow ? styles.dotIn : styles.dotOut, { left: `${d.pos * 100}%` }]}
          />
        ))}
      </View>
      <View style={styles.axis}>
        {model.axis.map((word, i) => (
          <Text key={`ax-${i}`} style={styles.axisWord}>
            {word}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ── Shape C — the stacked compare ─────────────────────────────────────────────
// Bare rows (no container). The caller renders it inline as a card-face receipt (the
// dot-lane degradation) or inside an EvidenceBox as the expanded control side.
export function StackedCompare({
  rows,
  accessibilityLabel,
}: {
  rows: CompareRow[];
  accessibilityLabel: string;
}) {
  // Bars are PROPORTION only (§4 — no axis): the longest count fills the track, the
  // rest scale against it. Guard the all-zero case so the divisor is never 0.
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <View style={styles.compare} accessible accessibilityLabel={accessibilityLabel}>
      {rows.map((r, i) => (
        <View key={`cmp-${i}`} style={styles.cmpRow}>
          <Text style={styles.cmpLabel} numberOfLines={1}>
            {r.label}
          </Text>
          <View style={styles.cmpTrack}>
            <View style={[styles.cmpFill, { backgroundColor: TONE_FILL[r.tone], width: `${(r.count / max) * 100}%` }]} />
          </View>
          <Text style={styles.cmpCount}>{r.count}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Expanded-state box ────────────────────────────────────────────────────────
// The tinted container the expanded evidence lives in (control side, phone script),
// with an uppercase micro header. Matches the mock's `.evid` treatment.
export function EvidenceBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.evid}>
      <Text style={styles.evidTitle}>{title}</Text>
      {children}
    </View>
  );
}

// ── The safety phone-call script ──────────────────────────────────────────────
// "Scripts convert, sirens don't" — the facts to have ready for a vet call (§4/§9).
// Rendered inside an EvidenceBox by the caller so it reads as one calm panel.
export function PhoneScript({ facts }: { facts: PhoneScriptFact[] }) {
  return (
    <View style={styles.script}>
      {facts.map((f, i) => (
        <Text key={`fact-${i}`} style={styles.scriptItem}>
          <Text style={styles.scriptLabel}>{f.label}: </Text>
          {f.value}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Shape A ─────────────────────────────────────────────────────────────────
  lane: {
    position: 'relative',
    height: 22,
    backgroundColor: theme.colorNeutralLight,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusXS,
  },
  band: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: theme.colorAccentLight,
    borderRightWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colorAccent,
    borderRadius: theme.radiusXS,
  },
  dot: {
    position: 'absolute',
    top: '50%',
    marginTop: -DOT_HALF,
    marginLeft: -DOT_HALF,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: theme.radiusFull,
  },
  dotIn: {
    backgroundColor: theme.colorEventSymptom,
  },
  dotOut: {
    backgroundColor: theme.colorTextDisabled,
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spaceMicro,
  },
  axisWord: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  // Shape C ─────────────────────────────────────────────────────────────────
  // No own top margin (see `strip`); `gap` spaces the rows from each other.
  compare: {
    gap: theme.space0_5,
  },
  cmpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  cmpLabel: {
    flexShrink: 1,
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
  },
  cmpTrack: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 40,
    height: 8,
    borderRadius: theme.radiusXS,
    backgroundColor: theme.colorChartEmpty,
    overflow: 'hidden',
  },
  cmpFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: theme.radiusXS,
  },
  cmpCount: {
    width: 24,
    textAlign: 'right',
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    fontVariant: ['tabular-nums'],
  },
  // Expanded box + phone script ───────────────────────────────────────────────
  evid: {
    marginTop: theme.space1,
    padding: theme.space1,
    backgroundColor: theme.colorNeutralLight,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
  },
  evidTitle: {
    fontSize: theme.textMicro,
    fontWeight: theme.weightSemibold,
    letterSpacing: theme.trackingWide,
    textTransform: 'uppercase',
    color: theme.colorTextTertiary,
    marginBottom: theme.space0_5,
  },
  script: {
    gap: theme.spaceMicro,
  },
  scriptItem: {
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightSM,
  },
  scriptLabel: {
    color: theme.colorTextTertiary,
  },
});
