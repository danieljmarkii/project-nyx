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
import { useDesignV2 } from '../../hooks/useDesignV2';
import { WhorlSpinner } from '../brand/WhorlSpinner';
import { Tick } from '../designV2/waits/Tick';
import { ThemedText } from '../ui/ThemedText';
import { isQuietVerdict } from '../../lib/incidentVerdict';
import { type TierTone } from '../../lib/incidentTierWords';

/** The verdict the record holds, named here only to pick a tone. Text, not the shipped
 *  three-value union: a server may hold a verdict this build has never seen (CUL-1277),
 *  and the tone below is decided by the quiet list, never by the literal. */
export type IncidentVerdict = string;

export const INCIDENT_READ_DISCLAIMER =
  'This is a quick read of a single moment, not a diagnosis.';
/** §5.5 — replaces the shipped bare `✕`, which named nothing to a screen reader. */
export const INCIDENT_READ_HIDE_LABEL = 'Hide this note';
/** §5.5 — "Reading the photo…" on the photographed path (was "Reading this one…"). */
export const INCIDENT_READ_PENDING_LABEL = 'Reading the photo…';
/** CUL-827 — a re-read running beside an escalation that stays on screen: the in-place
 *  sibling of the pending line, in the Re-run control's slot. The photoless line is for a
 *  contextual escalation (repeated vomiting, a concurrent symptom) that has no photo to read. */
export const INCIDENT_RE_READING_PHOTO_LINE = 'Reading the photo again…';
export const INCIDENT_RE_READING_LINE = 'Reading this one again…';
/** The failed read's line, and the no-recommendation read's. Named here (CUL-1275) because
 *  each is now said twice — on screen, and to a screen reader when it lands — and both
 *  sections say them, so one string per line keeps the two channels and the two surfaces
 *  from drifting apart. */
export const INCIDENT_READ_FAILED_LINE = "Couldn't finish reading this one.";
export const INCIDENT_READ_NOT_ENOUGH_LINE = 'Not enough to say about this one yet.';

/** The rail's width, and the height of its pending TICK (§5.2). Exported because PR 3's
 *  arrival animates the tick to the card's height and needs the same two numbers. */
export const RAIL_WIDTH = 3;
export const RAIL_TICK_HEIGHT = 16;

/**
 * The pending state: a 16pt tick of rail beside the whorl and the copy. The tick is what
 * PR 3 grows into the card's rail, so the read does not arrive from nowhere — it arrives
 * from the mark that was already standing there.
 *
 * Behind `design_v2` (D2-7 / CUL-1068) the whorl goes and the tick itself breathes —
 * "the photo is the hero, the tick breathes" (round 2 §06) — in the same 3×16 slot, so
 * the arrival grows out of exactly the mark it did before. `working` is the section's
 * own fact (the server has been asked, or the row says it is being read): the breathing
 * tick renders only then. The other pending case — a local row being READ off storage
 * when an old incident is opened — is a fetch, not a request (arrivalMotion's own
 * distinction), and keeps the still tick, flag-on and flag-off alike.
 */
export function IncidentReadPending({
  onLayout,
  working = false,
}: {
  onLayout?: (e: LayoutChangeEvent) => void;
  /** A read is being produced — the section's `working || status === 'pending'`. */
  working?: boolean;
}) {
  const designV2 = useDesignV2();
  return (
    <View style={styles.pendingBox} onLayout={onLayout}>
      {designV2 && working ? <Tick working={working} /> : <View style={styles.pendingTick} />}
      {!designV2 && <WhorlSpinner size="sm" ground="day" />}
      <ThemedText style={styles.pendingText}>{INCIDENT_READ_PENDING_LABEL}</ThemedText>
    </View>
  );
}

// The verdicts that may render with a grey rail are an ALLOWLIST, not
// `verdict === 'worth_a_call'`: a value outside the shipped enum — a server that gains a
// fourth recommendation before this build does — would otherwise take the grey rail, and
// a grey rail is a positive claim that this is not an escalation. Absence of a known
// escalation is not calm (Pattern 1's shape, applied to the presentation layer), so the
// unknown case fails toward the rose. It costs a false alarm at worst; the other
// direction costs a missed one. The list is `QUIET_VERDICTS` in `lib/incidentVerdict.ts`
// since CUL-1277, the one the sections' fold, the failure rescue and the server read too.

export function IncidentReadCard({
  verdict,
  label,
  tone,
  action,
  disclosure,
  readText,
  onHide,
  arrival,
  onMeasure,
}: {
  verdict: IncidentVerdict;
  /** The words, from the tier-word map (`lib/incidentTierWords.ts`) — never mapped here. */
  label: string;
  /** The tier's tone from the map (EN-3). Absent, the tone is decided from the verdict as
   *  it always was, so an earlier-rule read draws today's card to the byte. A value off the
   *  quiet list is never drawn grey whatever tone is passed: the rose is decided first. */
  tone?: TierTone;
  /** A call's action line from the map (the service, and what to do if it is closed). */
  action?: string | null;
  /** CUL-819 (a): the latest read did not finish, said beside the call it left standing. */
  disclosure?: string | null;
  readText?: string | null;
  onHide: () => void;
  /** Beat 1 of the arrival (CUL-804), while it is running; null every other moment —
   *  including a read that was already here on open, which never animates at all. */
  arrival?: ArrivalRail | null;
  /** The card's own height, for the arrival's rail. Taken here rather than off the section
   *  block because the rail is painted inside this box and clipped by it — and the block
   *  is taller on an escalation, whose facts never fold (§5.3a), which would make the
   *  rail's apparent growth rate depend on the verdict. G4 says it must not. */
  onMeasure?: (height: number) => void;
}) {
  const attn = !isQuietVerdict(verdict) || tone === 'call_filled' || tone === 'call_outline';
  // Fill against outline tells call now from call today beside the words (GAP-32). An
  // earlier-rule call, and any call drawn without a tone, keeps today's filled card.
  const outline = attn && tone === 'call_outline';
  const quietTone = tone === 'neutral' || tone === 'muted' ? tone : verdict === 'monitor' ? 'neutral' : 'muted';
  return (
    <View
      testID="incident-read-card"
      onLayout={onMeasure ? (e) => onMeasure(e.nativeEvent.layout.height) : undefined}
      style={[
        styles.card,
        attn ? (outline ? styles.cardAttnOutline : styles.cardAttn)
        : quietTone === 'neutral' ? styles.cardNeutral : styles.cardMuted,
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
            : quietTone === 'neutral' ? styles.verdictNeutral
            : styles.verdictMuted,
          ]}
        >
          {label}
        </ThemedText>
        {attn && action ? <ThemedText style={styles.action}>{action}</ThemedText> : null}
        {readText ? <ThemedText style={styles.readText}>{readText}</ThemedText> : null}
        {attn && disclosure ? (
          <ThemedText testID="incident-read-disclosure" style={styles.disclosure}>{disclosure}</ThemedText>
        ) : null}
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
  // Call today: the rose outline on the plain surface. The rail and the words carry the
  // rose too, so the tier never rests on the border's hue alone.
  cardAttnOutline: {
    backgroundColor: theme.colorSurface,
    borderColor: theme.colorEventSymptom,
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
  action: {
    fontSize: theme.textMD,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightBody,
  },
  disclosure: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },
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
