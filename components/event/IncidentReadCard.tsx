// The per-incident read card (CUL-803 · incident spec §5.2; design authority
// `docs/culprit-incident-screen-mockups.html` round 2, frames S-A / S-A2).
//
// ONE component for the vomit and stool sections, for two reasons. The obvious one is
// that they were 90% identical presentation and drifted apart every time one was
// touched. The load-bearing one is §7: PR 3 hangs the read's ARRIVAL motion off the rail,
// and a motion that must look the same on both surfaces belongs in the one place both
// render — not in two files that agree today.
//
// WHAT THE RAIL SAYS, AND WHAT IT MUST NOT. The rail is the severity signal and the
// arrival's continuous thread: rose on `worth_a_call`, a neutral grey otherwise. That is
// the WHOLE difference — G4: a worth_a_call arrives no louder and no harder, with no
// glyph and no haptic (both call sites are on `guards/haptics.test.ts`'s scanned list, and
// nothing here imports the module). Plainness is what makes the colour legible.
//
// The verdict label is the section's own enum copy, passed in verbatim — this component
// never maps a recommendation to words, so neither section's clinical copy can be edited
// from here (clinical-guardrails Pattern 1: the enum has no reassuring value, and there is
// no path through this file that adds one).
import { Animated, View, StyleSheet, TouchableOpacity, type LayoutChangeEvent } from 'react-native';
import { theme } from '../../constants/theme';
import { type ArrivalRail } from '../motion/arrivalMotion';
import { WhorlSpinner } from '../brand/WhorlSpinner';
import { ThemedText } from '../ui/ThemedText';

/** The shipped recommendation enum. Named here only to pick a tone. */
export type IncidentVerdict = 'worth_a_call' | 'monitor' | 'not_enough_to_say';

export const INCIDENT_READ_DISCLAIMER =
  'This is a quick read of a single moment, not a diagnosis.';
/** §5.5 — replaces the shipped bare `✕`, which named nothing to a screen reader. */
export const INCIDENT_READ_HIDE_LABEL = 'Hide this note';
/** §5.5 — "Reading the photo…" on the photographed path (was "Reading this one…"). */
export const INCIDENT_READ_PENDING_LABEL = 'Reading the photo…';

/** The rail's width, and the height of its pending TICK (§5.2). Exported because PR 3's
 *  arrival animates the tick to the card's height and needs the same two numbers. */
export const RAIL_WIDTH = 3;
export const RAIL_TICK_HEIGHT = 16;

/**
 * The pending state: a 16pt tick of rail beside the whorl and the copy. The tick is what
 * PR 3 grows into the card's rail, so the read does not arrive from nowhere — it arrives
 * from the mark that was already standing there.
 */
export function IncidentReadPending({ onLayout }: { onLayout?: (e: LayoutChangeEvent) => void }) {
  return (
    <View style={styles.pendingBox} onLayout={onLayout}>
      <View style={styles.pendingTick} />
      <WhorlSpinner size="sm" ground="day" />
      <ThemedText style={styles.pendingText}>{INCIDENT_READ_PENDING_LABEL}</ThemedText>
    </View>
  );
}

/**
 * The two verdicts that may render CALM. Deliberately an allowlist, not
 * `verdict === 'worth_a_call'`: a value outside the shipped enum — a server that gains a
 * fourth recommendation before this build does — would otherwise take the grey rail, and
 * a grey rail is a positive claim that this is not an escalation. Absence of a known
 * escalation is not calm (Pattern 1's shape, applied to the presentation layer), so the
 * unknown case fails toward the rose. It costs a false alarm at worst; the other
 * direction costs a missed one.
 */
const CALM_VERDICTS: readonly string[] = ['monitor', 'not_enough_to_say'];

export function IncidentReadCard({
  verdict,
  label,
  readText,
  onHide,
  arrival,
}: {
  verdict: IncidentVerdict;
  /** The enum's copy, verbatim from the section's own REC_LABEL map. */
  label: string;
  readText?: string | null;
  onHide: () => void;
  /** Beat 1 of the arrival (CUL-804), while it is running; null every other moment —
   *  including a read that was already here on open, which never animates at all. */
  arrival?: ArrivalRail | null;
}) {
  const attn = !CALM_VERDICTS.includes(verdict);
  return (
    <View
      style={[
        styles.card,
        attn ? styles.cardAttn : verdict === 'monitor' ? styles.cardNeutral : styles.cardMuted,
      ]}
    >
      {/* The rail LEAVES the row's flow for the commit that animates layout, and takes an
          explicit height: a layout keyframe re-applies a view's committed props when it
          ends, so a view that is both layout-animated and carrying an in-flight
          native-driver transform snaps back on Fabric (foldMotion's header, verbatim).
          The card already clips, so a rail taller than the opening box is hidden by it
          until the box catches up. */}
      {arrival ? (
        <Animated.View
          testID="incident-read-rail"
          style={[
            styles.rail,
            attn ? styles.railAttn : styles.railQuiet,
            styles.railOut,
            {
              height: arrival.height,
              transform: [{ translateY: arrival.shift }, { scaleY: arrival.scale }],
            },
          ]}
        />
      ) : (
        <View
          testID="incident-read-rail"
          style={[styles.rail, attn ? styles.railAttn : styles.railQuiet]}
        />
      )}
      <View style={arrival ? [styles.body, styles.bodyRailOut] : styles.body}>
        <ThemedText
          style={[
            styles.verdict,
            attn ? styles.verdictAttn
            : verdict === 'monitor' ? styles.verdictNeutral
            : styles.verdictMuted,
          ]}
        >
          {label}
        </ThemedText>
        {readText ? <ThemedText style={styles.readText}>{readText}</ThemedText> : null}
        <ThemedText style={styles.disclaimer}>{INCIDENT_READ_DISCLAIMER}</ThemedText>
        {/* The visible text IS the accessible name — never a label that differs from it
            (C-7). This replaces the shipped `✕`, which announced nothing at all. */}
        <TouchableOpacity
          onPress={onHide}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.hideRow}
          accessibilityRole="button"
        >
          <ThemedText style={styles.hideText}>{INCIDENT_READ_HIDE_LABEL}</ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // `overflow: hidden` is what lets a full-bleed rail sit inside a rounded, bordered box
  // without squaring its corners — the rail is a child, not a borderLeft, because PR 3
  // has to animate its height independently of the card's.
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: theme.radiusMedium,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardAttn: {
    backgroundColor: theme.colorEventSymptomLight,
    borderColor: theme.colorEventSymptomBorder,
  },
  cardNeutral: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderColor: theme.colorBorder,
  },
  cardMuted: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderColor: theme.colorBorder,
    borderStyle: 'dashed',
  },
  rail: {
    width: RAIL_WIDTH,
  },
  // Out of the flow for the arrival only. The body takes the width back as a margin so
  // nothing moves sideways on the frame the rail leaves or rejoins the row.
  railOut: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  railAttn: { backgroundColor: theme.colorEventSymptom },
  railQuiet: { backgroundColor: theme.colorBorderStrong },
  body: {
    flex: 1,
    padding: theme.space2,
    gap: 6,
  },
  bodyRailOut: {
    marginLeft: RAIL_WIDTH,
  },
  verdict: {
    fontSize: theme.textXS,
    fontWeight: theme.fontWeightMedium,
    letterSpacing: theme.trackingWidest,
  },
  // C-1 / CUL-744: a category colour is a GLYPH tint (the rail); TEXT on the tinted ground
  // takes the ink. The rose is 2.5:1 on its own light fill — the ink is 6.68:1, pinned in
  // `constants/theme.contrast.test.ts`. This is the label that asks an owner to phone a vet.
  verdictAttn: { color: theme.colorEventSymptomInk },
  verdictNeutral: { color: theme.colorTextSecondary },
  verdictMuted: { color: theme.colorTextTertiary },
  readText: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightBody,
  },
  disclaimer: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    lineHeight: 15,
  },
  hideRow: {
    alignSelf: 'flex-start',
    paddingVertical: theme.spaceMicro,
  },
  hideText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    fontWeight: theme.fontWeightMedium,
  },
  pendingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    padding: theme.space2,
    minHeight: 48,
  },
  pendingTick: {
    width: RAIL_WIDTH,
    height: RAIL_TICK_HEIGHT,
    borderRadius: 2,
    backgroundColor: theme.colorBorderStrong,
  },
  pendingText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
});
