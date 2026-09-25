// A node on the day's thread: one event, or one run of meals. The ONE row Home's spine
// (behind `design_v2`) and History v2's day cards (behind `history_v2`) draw (History v2,
// spec §3.6, H-1): HV-1 / CUL-1158 lifted it here, HV-6 / CUL-1163 gave it round 3's rules.
// The contract is "node in, row out": `lib/dayNodes.ts` builds the node, `DayNodeRow` picks
// the row, and this file draws what the node says and nothing it does not.
//
// ── THE RULES THIS FILE DRAWS (§3.6) ──────────────────────────────────────────
//   • Rule D: a run carries a chevron, because it opens HERE; a single row carries none,
//     because every row is a door and a chevron on all of them says nothing.
//   • Rule K: a run names its product ("4 meals · Royal Canin · Selected Protein PR") and
//     its formats on a second line ("1 wet · 3 dry").
//   • The chips: a meal's intake (All and Most teal, Some grey, Picked and Refused rose)
//     and a dose's adherence in the shipped vocabulary (Given teal; Partial, Missed and
//     Refused rose; *Unconfirmed* in rose only for a dose in doubt). Static tags, never
//     controls: the row is the one door.
//   • The read: *Worth a call* in rose, a grey *Photo not read*, the breathing tick, and
//     NOTHING for a calm read (a calm verdict is never a word on a list; n=1 never
//     reassures).
//   • Open in place, the static half: every member of an opened run is a full row, the
//     same row a single event draws, with every fact and the 44pt floor (GAP-8). The
//     motion is HV-10's.
//
// Never an image: Home is the surface a guest sees over the owner's shoulder (T&S; R4-2
// option A), so the photo is one tap in, on the record, where the vet will ask to see it.
//
// ── THE READ ARRIVES ON THIS NODE ─────────────────────────────────────────────
// The tick that waits IS the rail that lands: one `Animated.View`, keyed once,
// `testID="spine-read-rail-<id>"` before, during and after (`useNodeArrival`, the motion
// module's own header). It recolours to the rose as a step and grows on the fold's
// numbers; the word lands behind it. A read that ends calm, or unread, ends in the resting
// row for that state (§4: "ends as the resting row"), which the suite pins.
//
// ── SILENCE ON SAFETY (C-16) ──────────────────────────────────────────────────
// This file paints `worth_a_call` in the rose ink and is named in `guards/haptics.test.ts`
// `ALWAYS_SCANNED`; it imports nothing from `lib/haptics`, and a landed escalation buzzes
// nothing. The arrival is the same on every verdict (G4): the rose rail is the whole
// difference, and it is a colour, not a beat.
//
// ── ONE SENTENCE PER ROW (VoiceOver, C-8) ─────────────────────────────────────
// A row is one accessible element whose label is the whole row in reading order: the
// type, the food or drug, the vehicle and its intake, the format, the timing,
// "photographed", the chip, the dose it carried, the time and its tag, then the read.
// The drawn name may cut at two lines; the label never does. A run carries
// `accessibilityState.expanded` and its members announce individually once opened. The
// rose's arrival is announced politely, never assertively: a verdict is not an alert.

import { useLayoutEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Camera, ChevronDown, ChevronUp } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { RAIL_W, SpineRowFrame, TIME_W } from '../recap/DaySpine';
import { ThemedText } from '../ui/ThemedText';
import { useNodeArrival } from '../motion/arrivalMotion';
import { FOLD_LAYOUT, UNFOLD_LAYOUT } from '../motion/foldMotion';
import { useAppActive } from '../../hooks/useAppActive';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { ADHERENCE_OPTIONS } from '../log/AdherenceChipRow';
import { INTAKE_OPTIONS } from '../log/IntakeChipRow';
import { adherenceChipTone, intakeChipTone, type RowChipTone } from '../../lib/rowChips';
import { DOSE_IN_DOUBT_TAG } from '../../lib/medications';
import type { NodeRead, SpineCompactNode, SpineEventNode } from '../../lib/spineNode';

/** The waiting tick — the fold's own resting rail, 3pt × 16pt. */
export const SPINE_RAIL_WIDTH = 3;
export const SPINE_TICK_HEIGHT = 16;
/** The read slot's copy while the server works — the incident card's own line. */
export const SPINE_READ_PENDING_LABEL = 'Reading the photo…';
/** H-4b: a read was expected and no check happened. Grey, never rose. */
export const PHOTO_NOT_READ_LABEL = 'Photo not read';
/** The photo glyph's spoken word. */
export const PHOTOGRAPHED_LABEL = 'photographed';
/** The words under a time the owner did not witness (B-010), drawn in small caps. */
export const TIME_TAG_LABEL = { found: 'found', estimated: 'estimated' } as const;

/** Where the thread runs, from the row's left edge: the time column, the frame's gap, then
 *  the middle of the rail (`SpineRowFrame`). Derived from the exported widths, never
 *  retyped, so an opened run's rail sits on the thread it belongs to. */
export const THREAD_X = TIME_W + theme.space1 + RAIL_W / 2;
/** The opened run's rail, laid over the thread along its members. */
const RUN_RAIL_W = 4;

// ── The chips ─────────────────────────────────────────────────────────────────────

interface Chip {
  label: string;
  tone: RowChipTone;
  /** How the row's one label says it ("refused", "partial dose"). */
  spoken: string;
}

const INTAKE_SPOKEN: Record<string, string> = {
  all: 'all eaten',
  most: 'most eaten',
  some: 'some eaten',
  picked: 'picked at',
  refused: 'refused',
};
const ADHERENCE_SPOKEN: Record<string, string> = {
  given: 'given',
  partial: 'partial dose',
  missed: 'missed',
  refused: 'refused',
};

/** The picked rating's chip on a ROW, where the log sheet's own chip says *Picked*. Spec
 *  §3.6 and round 5 draw *Picked at*: the sheet's chip is a choice among five, tapped by the
 *  owner who saw the bowl, while a row is read cold by someone who did not log it, beside a
 *  dose line that says "picked at" (the HV-6 PM pass counted three spellings of one rating
 *  in one glance). */
export const PICKED_AT_CHIP = 'Picked at';

/** A meal's intake chip: the log sheet's words (`INTAKE_OPTIONS`) but for *Picked at*. A
 *  rating this build does not know shows as recorded, in the rose. */
function intakeChipOf(rating: string | null): Chip | null {
  if (rating === null) return null;
  const label = rating === 'picked' ? PICKED_AT_CHIP : INTAKE_OPTIONS.find((o) => o.value === rating)?.label ?? rating;
  return { label, tone: intakeChipTone(rating), spoken: INTAKE_SPOKEN[rating] ?? rating };
}

/** A dose's chip: its adherence in the shipped vocabulary, or *Unconfirmed* for a dose in
 *  doubt, or nothing for any other unrated dose (GAP-2). */
function doseChipOf(node: SpineEventNode): Chip | null {
  const dose = node.dose;
  if (dose === null) return null;
  if (dose.adherence !== null) {
    const label = ADHERENCE_OPTIONS.find((o) => o.value === dose.adherence)?.label ?? dose.adherence;
    return { label, tone: adherenceChipTone(dose.adherence), spoken: ADHERENCE_SPOKEN[dose.adherence] };
  }
  if (dose.inDoubt) return { label: DOSE_IN_DOUBT_TAG, tone: 'attn', spoken: DOSE_IN_DOUBT_TAG.toLowerCase() };
  return null;
}

function chipOf(node: SpineEventNode): Chip | null {
  if (node.category === 'meal') return intakeChipOf(node.intake);
  if (node.category === 'medication') return doseChipOf(node);
  return null;
}

// The unread mark's geometry: an 8pt circle, hatched at a 3pt pitch (round 5's
// `repeating-linear-gradient(45deg, transparent 0 2px, … 2px 3px)`).
const UNREAD_MARK_SIZE = 8;
const UNREAD_HATCH_GAP = 2;
const UNREAD_HATCH_LINES = [0, 1, 2, 3, 4] as const;

const CHIP_GROUND = { ok: 'chipOk', mid: 'chipMid', attn: 'chipAttn' } as const;
const CHIP_INK = { ok: 'chipInkOk', mid: 'chipInkMid', attn: 'chipInkAttn' } as const;
const PHRASE_INK = { ok: 'phraseOk', mid: 'phraseMid', attn: 'phraseAttn' } as const;

function RowChip({ chip, testID }: { chip: Chip; testID: string }) {
  return (
    <View style={[styles.chip, styles[CHIP_GROUND[chip.tone]]]} testID={testID}>
      <ThemedText style={[styles.chipText, styles[CHIP_INK[chip.tone]]]}>{chip.label}</ThemedText>
    </View>
  );
}

// ── The row's one sentence ───────────────────────────────────────────────────────

function readSpoken(read: NodeRead): string {
  switch (read.state) {
    case 'worth_a_call':
      return `. ${read.label}`;
    case 'unread':
      return `. ${PHOTO_NOT_READ_LABEL}`;
    case 'pending':
      return `. ${SPINE_READ_PENDING_LABEL}`;
    case 'calm':
    case 'none':
      return '';
  }
}

/** A part of a row as VoiceOver says it: the middle dot the row draws between a brand and
 *  its product, or between a run's format counts, is a comma (a pause), since a voice may
 *  read "·" aloud (the HV-6 PM pass). */
const spokenPart = (part: string): string => part.replace(/\s·\s/g, ', ');

/** The row's accessible label: the whole row in reading order (C-8). Exported so a test
 *  reads the sentence without re-typing its order. */
export function eventRowLabel(node: SpineEventNode): string {
  const chip = chipOf(node);
  const parts = [
    node.title,
    node.detail,
    node.dose?.vehicleIntake?.phrase ?? null,
    node.formatTag ? node.formatTag.toLowerCase() : null,
    node.timing,
    node.photo ? PHOTOGRAPHED_LABEL : null,
    chip ? chip.spoken : null,
    node.carries,
    node.time,
    node.timeTag ? TIME_TAG_LABEL[node.timeTag] : null,
  ].filter((p): p is string => !!p);
  return `${parts.map(spokenPart).join(', ')}${readSpoken(node.read)}. Opens details`;
}

// ── The event node ───────────────────────────────────────────────────────────────

export function SpineEventRow({
  node,
  isFirst,
  isLast,
  onOpen,
}: {
  node: SpineEventNode;
  isFirst: boolean;
  isLast: boolean;
  /** Overridable so a test drives navigation without a router mock. */
  onOpen?: (id: string) => void;
}) {
  const open = () => {
    if (onOpen) onOpen(node.id);
    else router.push({ pathname: '/event/[id]', params: { id: node.id } });
  };
  const read = node.read;
  const chip = chipOf(node);
  const vehicleIntake = node.dose?.vehicleIntake ?? null;
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={eventRowLabel(node)}
      testID={`spine-node-${node.id}`}
    >
      {({ pressed }) => (
        <SpineRowFrame
          ground="day"
          category={node.category}
          isFirst={isFirst}
          isLast={isLast}
          time={node.time}
          timeTag={node.timeTag ? TIME_TAG_LABEL[node.timeTag] : null}
          pressed={pressed}
        >
          <View style={styles.titleLine}>
            {/* The name takes two lines at most and never cuts inside the tags beside it:
                the tags and the chip are siblings that follow it or wrap under it (BRK-12). */}
            <ThemedText style={styles.title} numberOfLines={2}>
              {node.title}
              {node.detail || node.timing || vehicleIntake ? (
                <ThemedText style={styles.detail}>
                  {node.detail ? ` · ${node.detail}` : null}
                  {vehicleIntake ? (
                    // geist-ok: nested span — differs from its parent only in colour (the vehicle's
                    // intake in the meal chip's ink, GAP-3), so it stays a raw <Text> and inherits
                    // the parent's resolved Geist face; a ThemedText here would break the cascade.
                    <Text style={styles[PHRASE_INK[vehicleIntake.tone]]}> · {vehicleIntake.phrase}</Text>
                  ) : null}
                  {node.timing ? ` · ${node.timing}` : null}
                </ThemedText>
              ) : null}
            </ThemedText>
            {node.formatTag ? (
              <ThemedText style={styles.formatTag} numberOfLines={1}>
                {node.formatTag}
              </ThemedText>
            ) : null}
            {node.photo ? (
              // A glyph, never the picture (R4-2 option A). Spoken as "photographed" through
              // the row's one label.
              <View
                style={styles.photoGlyph}
                testID={`spine-photo-${node.id}`}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Camera size={11} color={theme.colorTextTertiary} strokeWidth={2} />
              </View>
            ) : null}
            {chip ? <RowChip chip={chip} testID={`spine-chip-${node.id}`} /> : null}
          </View>
          {node.carries ? (
            <ThemedText style={styles.line2} testID={`spine-carries-${node.id}`}>
              {node.carries}
            </ThemedText>
          ) : null}
          {read.state === 'pending' || read.state === 'worth_a_call' ? (
            <ReadSlot nodeId={node.id} read={read} />
          ) : read.state === 'unread' ? (
            <UnreadMark nodeId={node.id} />
          ) : null}
        </SpineRowFrame>
      )}
    </Pressable>
  );
}

// ── The read slot: the tick, then the rose ───────────────────────────────────────

function ReadSlot({
  nodeId,
  read,
}: {
  nodeId: string;
  read: Extract<NodeRead, { state: 'pending' } | { state: 'worth_a_call' }>;
}) {
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();
  const pending = read.state === 'pending';
  const landed = read.state === 'worth_a_call';
  const arrival = useNodeArrival({
    awaitingRead: pending,
    landed,
    reducedMotion,
    appActive,
    identity: nodeId,
    tickHeight: SPINE_TICK_HEIGHT,
  });
  const { values, heldHeight, railHeight, inFlight, breathing } = arrival;

  // The rose that lands while the owner watches is announced once, politely; a read that
  // was already in the record when the row mounted is simply there.
  const wasPending = useRef(pending);
  useLayoutEffect(() => {
    const was = wasPending.current;
    wasPending.current = pending;
    if (was && !pending && landed) AccessibilityInfo.announceForAccessibility(read.label);
  }, [pending, landed, read]);

  const railOut = railHeight != null;
  return (
    <View
      style={[
        styles.readSlot,
        heldHeight != null ? { height: heldHeight, overflow: 'hidden' } : null,
        inFlight ? styles.readSlotClip : null,
      ]}
      testID={`spine-read-${nodeId}`}
      accessibilityLiveRegion="polite"
    >
      {/* THE ONE NODE. Same element in every state (the identity test pins it). Its style
          changes; its key does not. */}
      <Animated.View
        testID={`spine-read-rail-${nodeId}`}
        style={[
          styles.rail,
          landed ? styles.railRose : styles.railWaiting,
          railOut
            ? {
                position: 'absolute',
                left: 0,
                top: 0,
                height: railHeight,
                transform: [{ translateY: values.railShift }, { scaleY: values.railScale }],
              }
            : pending
              ? styles.railTick
              : styles.railFull,
          breathing ? { opacity: values.tickOpacity } : null,
        ]}
      />
      <View
        style={[styles.readBody, railOut ? styles.readBodyRailOut : null]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (pending) arrival.onPendingLayout(h);
          else arrival.onContentLayout(h);
        }}
      >
        {pending ? (
          <ThemedText style={styles.pendingText}>{SPINE_READ_PENDING_LABEL}</ThemedText>
        ) : (
          <Animated.View style={{ opacity: values.bodyOpacity, transform: [{ translateY: values.bodyShift }] }}>
            <ThemedText style={styles.verdict} testID={`spine-verdict-${nodeId}`}>
              {read.label}
            </ThemedText>
          </Animated.View>
        )}
        {inFlight ? (
          // The waiting line, leaving in the rail's own window: an overlay out of the flow,
          // so the landed word can already be in it at opacity 0.
          <Animated.View pointerEvents="none" style={[styles.pendingOverlay, { opacity: values.pendingOpacity }]}>
            <ThemedText style={styles.pendingText}>{SPINE_READ_PENDING_LABEL}</ThemedText>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

/** H-4b: a read was expected and no check happened. Grey and quiet, never the rose: it is
 *  the absence of a check, not a finding, and it never looks like a calm read either. */
function UnreadMark({ nodeId }: { nodeId: string }) {
  return (
    <View style={styles.unread} testID={`spine-unread-${nodeId}`}>
      {/* Hatched, as round 5 draws it: a filled-in "missing", where a plain ring read as an
          unchecked radio button (the HV-6 PM pass). The ring is drawn last, over the hatch. */}
      <View style={styles.unreadMark} testID={`spine-unread-mark-${nodeId}`}>
        <View style={styles.unreadHatch}>
          {UNREAD_HATCH_LINES.map((i) => (
            <View key={i} style={styles.unreadHatchLine} />
          ))}
        </View>
        <View style={styles.unreadRing} />
      </View>
      <ThemedText style={styles.unreadText}>{PHOTO_NOT_READ_LABEL}</ThemedText>
    </View>
  );
}

// ── The run ───────────────────────────────────────────────────────────────────────

/** The run's one sentence: "4 meals, Royal Canin, Selected Protein PR, 1 wet, 3 dry,
 *  12:41 – 5:07 PM. Shows each one". */
export function runRowLabel(node: SpineCompactNode, expanded: boolean): string {
  const parts = [node.title, node.detail, node.formats, node.timeRange].filter((p): p is string => !!p);
  return `${parts.map(spokenPart).join(', ')}. ${expanded ? 'Hides' : 'Shows'} each one`;
}

export function SpineCompactRow({
  node,
  isFirst,
  isLast,
  expanded,
  onToggle,
  onOpen,
}: {
  node: SpineCompactNode;
  isFirst: boolean;
  isLast: boolean;
  expanded: boolean;
  onToggle: (id: string) => void;
  onOpen?: (id: string) => void;
}) {
  const reducedMotion = useReducedMotion();
  const toggle = () => {
    // The fold's physics, in place: geometry on `LayoutAnimation`, nothing else moves.
    // Under reduced motion the rows appear: no keyframe, no drift. (HV-10 moves this onto
    // the shared open-in-place module.)
    if (!reducedMotion) LayoutAnimation.configureNext(expanded ? FOLD_LAYOUT : UNFOLD_LAYOUT);
    onToggle(node.id);
  };
  const Chevron = expanded ? ChevronUp : ChevronDown;
  return (
    <View>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={runRowLabel(node, expanded)}
        accessibilityState={{ expanded }}
        testID={`spine-node-${node.id}`}
      >
        {({ pressed }) => (
          <SpineRowFrame
            ground="day"
            category="meal"
            isFirst={isFirst}
            isLast={isLast && !expanded}
            time={node.timeRange}
            pressed={pressed}
            // The chevron rides the row's edge, not the title's end, so a long food name
            // wraps under it and the arrow never moves. It points the way the run opens:
            // here, downward (rule D).
            trailing={<Chevron size={15} color={theme.colorAccentInk} strokeWidth={2} />}
          >
            <ThemedText style={styles.title} numberOfLines={2}>
              {node.title}
              <ThemedText style={styles.detail}> · {node.detail}</ThemedText>
            </ThemedText>
            {node.formats ? (
              <ThemedText style={styles.line2} testID={`spine-formats-${node.id}`}>
                {node.formats}
              </ThemedText>
            ) : null}
          </SpineRowFrame>
        )}
      </Pressable>
      {expanded ? (
        // Every member, each the same full row a single event draws: uncapped, unclipped,
        // every fact (GAP-8). The run's rail lies over the thread along them.
        <View style={styles.members} testID={`spine-members-${node.id}`}>
          <View style={styles.runRail} pointerEvents="none" testID={`spine-run-rail-${node.id}`} />
          {node.rows.map((row, i) => (
            <SpineEventRow
              key={row.id}
              node={row}
              isFirst={false}
              isLast={isLast && i === node.rows.length - 1}
              onOpen={onOpen}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: theme.space0_5,
    rowGap: theme.spaceMicro,
  },
  title: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    flexShrink: 1,
  },
  detail: {
    fontWeight: theme.weightRegular,
    color: theme.colorTextSecondary,
  },
  // The tertiary grey, a step lighter than a chip's ink: a tag is a fact about the food and
  // a chip is the owner's rating, and in one grey the two read as one phrase ("DRY SOME";
  // round 5 draws the tag lighter, the HV-6 PM pass). 4.74:1 on the white card.
  formatTag: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    letterSpacing: theme.trackingWide,
    fontWeight: theme.weightMedium,
    flexShrink: 0,
  },
  photoGlyph: { paddingTop: 1, flexShrink: 0 },
  line2: {
    marginTop: theme.spaceMicro,
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
  },

  // The chips: the app's small-caps tag register (IntakeBadge's geometry), three inks.
  chip: {
    paddingHorizontal: theme.space1,
    paddingVertical: theme.spaceMicro,
    borderRadius: theme.radiusFull,
    flexShrink: 0,
  },
  chipText: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWide,
  },
  chipOk: { backgroundColor: theme.colorAccentLight },
  chipMid: { backgroundColor: theme.colorSurfaceSubtle },
  chipAttn: { backgroundColor: theme.colorEventSymptomLight },
  // Text on a light ground takes the INK, never the glyph tint (C-1).
  chipInkOk: { color: theme.colorAccentInk },
  chipInkMid: { color: theme.colorTextSecondary },
  chipInkAttn: { color: theme.colorEventSymptomInk },
  phraseOk: { color: theme.colorAccentInk },
  phraseMid: { color: theme.colorTextSecondary },
  phraseAttn: { color: theme.colorEventSymptomInk },

  // The read slot: the rail and the rose word, under the title line.
  readSlot: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: theme.space1,
    marginTop: theme.space0_5,
  },
  readSlotClip: { overflow: 'hidden' },
  rail: {
    width: SPINE_RAIL_WIDTH,
    borderRadius: 2,
  },
  railWaiting: { backgroundColor: theme.colorBorderStrong },
  railRose: { backgroundColor: theme.colorEventSymptom },
  railTick: { height: SPINE_TICK_HEIGHT, alignSelf: 'center' },
  railFull: { alignSelf: 'stretch' },
  readBody: { flex: 1, minWidth: 0, paddingVertical: theme.spaceMicro },
  readBodyRailOut: { marginLeft: SPINE_RAIL_WIDTH + theme.space1 },
  pendingOverlay: { position: 'absolute', left: 0, top: theme.spaceMicro, right: 0 },
  pendingText: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
  },
  // The rose INK, never the bright rose, for text on the white card (C-1).
  verdict: {
    fontSize: theme.textXS,
    fontWeight: theme.weightSemibold,
    color: theme.colorEventSymptomInk,
  },

  // Photo not read: a hollow grey mark and grey words. Never rose.
  unread: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space0_5,
    marginTop: theme.space0_5,
  },
  unreadMark: {
    width: UNREAD_MARK_SIZE,
    height: UNREAD_MARK_SIZE,
    borderRadius: UNREAD_MARK_SIZE / 2,
    overflow: 'hidden',
  },
  // A square twice the mark's side, turned 45°, its stripes vertical: diagonal hatching
  // across the circle that clips it.
  unreadHatch: {
    position: 'absolute',
    left: -UNREAD_MARK_SIZE / 2,
    top: -UNREAD_MARK_SIZE / 2,
    width: UNREAD_MARK_SIZE * 2,
    height: UNREAD_MARK_SIZE * 2,
    flexDirection: 'row',
    justifyContent: 'center',
    columnGap: UNREAD_HATCH_GAP,
    transform: [{ rotate: '45deg' }],
  },
  unreadHatchLine: { width: 1, alignSelf: 'stretch', backgroundColor: theme.colorBorderStrong },
  unreadRing: {
    ...StyleSheet.absoluteFill,
    borderRadius: UNREAD_MARK_SIZE / 2,
    borderWidth: 1.5,
    borderColor: theme.colorTextTertiary,
  },
  unreadText: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
  },

  // An opened run: its members are full rows on the thread; the run's rail lies over it.
  members: { position: 'relative' },
  runRail: {
    position: 'absolute',
    left: THREAD_X - RUN_RAIL_W / 2,
    top: 0,
    bottom: theme.space2,
    width: RUN_RAIL_W,
    borderRadius: RUN_RAIL_W / 2,
    backgroundColor: theme.colorEventMeal,
  },
});
