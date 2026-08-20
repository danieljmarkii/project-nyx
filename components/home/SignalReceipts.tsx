// Signal receipts (SR-1, B-721) — the evidence strips for the Signal/Home design
// uplift (docs/nyx-signal-home-requirements.md §4; GA'd via CUL-547, no longer flag-
// gated). Hand-rolled Views, no chart library on Home (Dir. of Eng — matches TrendZone;
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
// Decorative in context: the lane's meaning is carried as a full sentence in the
// PARENT card's own accessibilityLabel (InsightCard) — a self-label here would be
// swallowed by the outer Pressable's accessible container and never reach VoiceOver
// (the MedStrip / HomeHeader idiom). `accessible={false}` makes that intent explicit.
export function DotLane({ model }: { model: DotLaneModel }) {
  return (
    // No own margin: on the card face the parent body's `gap` spaces the lane from
    // the sentence and meta; the axis row hugs the lane via its own small top margin.
    <View accessible={false}>
      <View style={styles.lane}>
        {model.bands.map((b, i) => (
          <View
            key={`band-${i}`}
            // The dashed edge marks the window's TRUE end. A wrapping clock band's
            // pre-midnight segment ends at the lane's own right border (not a boundary),
            // so it gets the fill only — one dashed edge per window (§4), never two.
            style={[
              styles.band,
              b.end < 0.999 ? styles.bandDashedEnd : null,
              { left: `${b.start * 100}%`, width: `${(b.end - b.start) * 100}%` },
            ]}
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
// Decorative in context, like DotLane: the compare's meaning rides the parent card's
// own accessibilityLabel, so a self-label here would be swallowed by the outer
// Pressable — `accessible={false}` makes that explicit.
export function StackedCompare({ rows }: { rows: CompareRow[] }) {
  // Bars are PROPORTION only (§4 — no axis): the longest count fills the track, the
  // rest scale against it. A two-sided row (CUL-13 trial: "4 · was 8") scales its bar
  // against the max of BOTH its counts across all rows, so a REDUCTION reads as a shorter
  // bar than baseline. `flatMap` includes a row's baseline only when it has one, so a
  // single-count (timing/⑤/⑥) row set produces the identical max as before — byte-identical.
  // Guard the all-zero case so the divisor is never 0.
  const max = Math.max(1, ...rows.flatMap((r) => (r.baseline != null ? [r.count, r.baseline] : [r.count])));
  return (
    <View style={styles.compare} accessible={false}>
      {rows.map((r, i) => (
        <View key={`cmp-${i}`} style={styles.cmpRow}>
          <Text style={styles.cmpLabel} numberOfLines={1}>
            {r.label}
          </Text>
          <View style={styles.cmpTrack}>
            <View style={[styles.cmpFill, { backgroundColor: TONE_FILL[r.tone], width: `${(r.count / max) * 100}%` }]} />
          </View>
          {r.baseline != null ? (
            // Two-sided "N · was M" (G2 — the unconditional safe form; a zero is "0 · was 7", never
            // an inverted absence claim). The trial count leads (emphasised); "· was M" is the
            // quieter baseline. Wider cell than the single-count form, so both numbers fit.
            <Text style={styles.cmpCountTwoSided}>
              <Text style={styles.cmpCountLead}>{r.count}</Text>
              {` · was ${r.baseline}`}
            </Text>
          ) : (
            <Text style={styles.cmpCount}>{r.count}</Text>
          )}
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
    borderRadius: theme.radiusXS,
  },
  // The dashed right edge — applied only to the segment whose end is the window's
  // true boundary (never a wrap segment that ends at the lane border).
  bandDashedEnd: {
    borderRightWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colorAccent,
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
  // The two-sided "N · was M" count cell (CUL-13) — wider than the single-count cell so both
  // numbers fit; right-aligned like its sibling. `flexShrink: 0` keeps it from collapsing (the
  // track flexes instead). The baseline half rides the tertiary tone; the trial count leads.
  cmpCountTwoSided: {
    flexShrink: 0,
    minWidth: 64,
    textAlign: 'right',
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    fontVariant: ['tabular-nums'],
  },
  cmpCountLead: {
    color: theme.colorTextSecondary,
    fontWeight: theme.weightSemibold,
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
