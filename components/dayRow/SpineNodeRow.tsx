// A node on the day's thread: one event, or one run of meals. The ONE row Home's spine
// and History v2's day cards draw (History v2,
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
//   • The read: *Worth a call* in rose, the grey mark with *No read yet* or *Not enough to
//     say yet* (its record's words, CUL-1234), the breathing tick, and
//     NOTHING for a calm read (a calm verdict is never a word on a list; n=1 never
//     reassures).
//   • Open in place: every member of an opened run is a full row with every fact and the
//     44pt floor (GAP-8), in the member form (CUL-1733): the meal word, format and chip on
//     line 1, the brand and product on line 2, a 9pt bead on the run's line. Where the host asks for it
//     (`openInPlace`: History v2's day cards, and Home's spine), the run opens on its OWN
//     motion (`useRunOpen`, CUL-1734, D1): the chevron turns, the line grows out of the
//     run's bead, the box opens from nothing with no bounce, and each meal lands as the
//     box's edge reaches it; under Reduce Motion the box is there at once and the line and
//     the meals fade in over 150ms. The Patterns month keeps `useOpenInPlace`; nothing
//     run-only reaches it. Without `openInPlace`, the run keeps the shipped
//     `LayoutAnimation` open, byte for byte.
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

import { useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Animated, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { router } from 'expo-router';
import { Camera, ChevronDown, ChevronUp } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { SPINE_THREAD, SpineRowFrame } from '../recap/DaySpine';
import { NODE_DOT_SIZE } from '../recap/nodeTints';
import { ThemedText } from '../ui/ThemedText';
import { useNodeArrival } from '../motion/arrivalMotion';
import { announceQueued, readLandedSpoken, useRowSpeech } from './rowSpeech';
import { FOLD_LAYOUT, UNFOLD_LAYOUT } from '../motion/foldMotion';
import { useRunOpen } from '../motion/runOpenMotion';
import { RunRevealContext } from '../motion/runRevealMotion';
import { ThreadDrawing } from '../motion/threadMotion';
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
/** The photo glyph's spoken word. */
export const PHOTOGRAPHED_LABEL = 'photographed';
/** The words under a time the owner did not witness (B-010), drawn in small caps. */
export const TIME_TAG_LABEL = { found: 'found', estimated: 'estimated' } as const;

/** Where the thread runs, from the row's left edge: the frame's own figure
 *  (`SPINE_THREAD`), never retyped, so an opened run's rail sits on the thread it belongs to. */
export const THREAD_X = SPINE_THREAD.x;
/** The opened run's rail, laid over the thread along its members. */
const RUN_RAIL_W = 4;
/** Where the run's lead starts: the foot of the run's own bead (its centre plus half the bead). */
const RUN_LEAD_TOP = SPINE_THREAD.dotCenterY + NODE_DOT_SIZE / 2;
/** A member row's floor (GAP-8, the 44pt touch floor every row keeps): the reveal's stand-in
 *  for a first meal that has not reported. Same value as `runOpenMotion`'s header floor, a
 *  different question (a member's height, not the header's), so its own constant (C-34). */
const RUN_MEMBER_FLOOR_PT = 44;

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

// The unread mark's geometry: an 8pt circle with a 1.5pt ring, hatched at 45° (round 5's
// `repeating-linear-gradient(45deg, transparent 0 2px, … 2px 3px)`). Each stripe is the
// chord of the ring's inner circle at a perpendicular offset, so the hatch ends at the ring
// without a clip.
const UNREAD_MARK_SIZE = 8;
const UNREAD_RING_W = 1.5;
const UNREAD_RING_R = (UNREAD_MARK_SIZE - UNREAD_RING_W) / 2;
const UNREAD_HATCH_PITCH = 2.5;
const UNREAD_HATCH_CHORDS = [-1, 0, 1].map((k) => {
  const c = UNREAD_MARK_SIZE / 2;
  const d = k * UNREAD_HATCH_PITCH;
  const half = Math.sqrt(UNREAD_RING_R * UNREAD_RING_R - d * d);
  // Along (1, 1)/√2, offset by d along (1, -1)/√2.
  const [ox, oy] = [c + d / Math.SQRT2, c - d / Math.SQRT2];
  const [tx, ty] = [half / Math.SQRT2, half / Math.SQRT2];
  return { x1: ox - tx, y1: oy - ty, x2: ox + tx, y2: oy + ty };
});

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
      return `. ${read.spoken}`;
    case 'unread':
      return `. ${read.label}`;
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
  member = false,
}: {
  node: SpineEventNode;
  isFirst: boolean;
  isLast: boolean;
  /** Overridable so a test drives navigation without a router mock. */
  onOpen?: (id: string) => void;
  /** An opened run's member (CUL-1733): the difference first. See `MemberLines`. */
  member?: boolean;
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
          member={member}
        >
          {member ? (
            <MemberLines node={node} chip={chip} />
          ) : (
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
          )}
          {node.carries ? (
            <ThemedText style={styles.line2} testID={`spine-carries-${node.id}`}>
              {node.carries}
            </ThemedText>
          ) : null}
          {read.state === 'pending' || read.state === 'worth_a_call' ? (
            <ReadSlot node={node} read={read} />
          ) : read.state === 'unread' ? (
            <UnreadMark nodeId={node.id} label={read.label} />
          ) : null}
        </SpineRowFrame>
      )}
    </Pressable>
  );
}

/**
 * An opened run's member, two lines (CUL-1733; History v2 §3.6, D2 ruled on CUL-1715): the
 * run above it already names the product, so a member LEADS with what tells it from its
 * neighbours (the meal word, its format, its rating) and carries the brand and product on
 * line 2 in the run's own second-line register. Every fact stays (GAP-8); only the order
 * moves. The spoken label is the row's, unchanged (`eventRowLabel`, C-8), so VoiceOver still
 * names the product. A run holds meals only (rule B), so a dose's vehicle never lands here;
 * a timing line, should one, stays with the meal word on line 1.
 */
function MemberLines({ node, chip }: { node: SpineEventNode; chip: Chip | null }) {
  return (
    <>
      <View style={styles.titleLine} testID={`spine-member-line1-${node.id}`}>
        <ThemedText style={styles.title} numberOfLines={2}>
          {node.title}
          {node.timing ? <ThemedText style={styles.detail}> · {node.timing}</ThemedText> : null}
        </ThemedText>
        {node.formatTag ? (
          <ThemedText style={styles.formatTag} numberOfLines={1}>
            {node.formatTag}
          </ThemedText>
        ) : null}
        {node.photo ? (
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
      {node.detail ? (
        <ThemedText style={styles.line2} testID={`spine-member-food-${node.id}`}>
          {node.detail}
        </ThemedText>
      ) : null}
    </>
  );
}

// ── The read slot: the tick, then the rose ───────────────────────────────────────

function ReadSlot({
  node,
  read,
}: {
  node: SpineEventNode;
  read: Extract<NodeRead, { state: 'pending' } | { state: 'worth_a_call' }>;
}) {
  const nodeId = node.id;
  const speech = useRowSpeech();
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

  // The rose that lands while the owner watches is announced once; a read that was
  // already in the record when the row mounted is simply there. CUL-1224 (BRK-28): it is
  // said with its subject (the pet, the row, the time), queued behind what VoiceOver is
  // reading, and only when the screen the row sits on says so (focused, app in front:
  // `rowSpeech.ts`). The slot carries no live region, so it is said once on Android too.
  const wasPending = useRef(pending);
  useLayoutEffect(() => {
    const was = wasPending.current;
    wasPending.current = pending;
    if (was && !pending && landed && appActive && speech.mayAnnounce()) {
      announceQueued(readLandedSpoken({ petName: speech.petName, title: node.title, time: node.time, verdict: read.spoken }));
    }
  }, [pending, landed, read, appActive, speech, node.title, node.time]);

  const railOut = railHeight != null;
  return (
    <View
      style={[
        styles.readSlot,
        heldHeight != null ? { height: heldHeight, overflow: 'hidden' } : null,
        inFlight ? styles.readSlotClip : null,
      ]}
      testID={`spine-read-${nodeId}`}
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
 *  the absence of a check, not a finding, and it never looks like a calm read either. The
 *  words are the node's (`nodeReadOf`): *No read yet*, or the record's *Not enough to say
 *  yet* for a read that finished unable to say. */
function UnreadMark({ nodeId, label }: { nodeId: string; label: string }) {
  return (
    <View style={styles.unread} testID={`spine-unread-${nodeId}`}>
      {/* Hatched, as round 5 draws it: a filled-in "missing", where a plain ring read as an
          unchecked radio button (the HV-6 PM pass). Each stripe is drawn as its own chord of
          the circle, so nothing is clipped: a rotated child inside a rounded `overflow:
          hidden` view does not clip reliably on Android (the HV-6 code review). */}
      <Svg width={UNREAD_MARK_SIZE} height={UNREAD_MARK_SIZE} testID={`spine-unread-mark-${nodeId}`}>
        {UNREAD_HATCH_CHORDS.map((c, i) => (
          <Line key={i} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke={theme.colorBorderStrong} strokeWidth={1} />
        ))}
        <Circle
          cx={UNREAD_MARK_SIZE / 2}
          cy={UNREAD_MARK_SIZE / 2}
          r={UNREAD_RING_R}
          stroke={theme.colorTextTertiary}
          strokeWidth={UNREAD_RING_W}
          fill="none"
        />
      </Svg>
      <ThemedText style={styles.unreadText}>{label}</ThemedText>
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
  openInPlace = false,
}: {
  node: SpineCompactNode;
  isFirst: boolean;
  isLast: boolean;
  expanded: boolean;
  onToggle: (id: string) => void;
  onOpen?: (id: string) => void;
  /** Open on the shared open-in-place choreography (HV-10). Off: the shipped open. */
  openInPlace?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();
  // The reveal (CUL-1735, D3): on a fresh open the run tells the list where its first meal
  // will rest, and the list moves just far enough to show it. The run measures; the list
  // owns the scroll. No host (the Patterns month, a test): nobody is asked.
  const requestReveal = useContext(RunRevealContext);
  const headerRef = useRef<View>(null);
  /** The first meal's foot below the box's top, once the meals have laid out. */
  const firstMealFoot = useRef<number | null>(null);
  const cancelReveal = useRef<(() => void) | null>(null);
  const dropReveal = () => {
    cancelReveal.current?.();
    cancelReveal.current = null;
  };
  const onFreshOpen = () => {
    if (!requestReveal) return;
    dropReveal();
    cancelReveal.current = requestReveal((done) =>
      headerRef.current?.measureInWindow((_x, y, _w, h) =>
        // Before the meals report (a frame can beat them), a member's 44pt floor stands in.
        done({ runTop: y, mealBottom: y + h + (firstMealFoot.current ?? RUN_MEMBER_FLOOR_PT) }),
      ),
    );
  };
  // Called either way (the rules of hooks) and held closed when the host did not ask for it,
  // so the shipped path runs no timer, no beat and no `configureNext` of this machine's.
  // A tap while the day's thread draws waits for it to settle (CUL-1757).
  const threadDrawing = useContext(ThreadDrawing);
  const motion = useRunOpen({
    shown: openInPlace && expanded,
    identity: node.id,
    count: node.rows.length,
    beadCenterY: SPINE_THREAD.dotCenterY,
    leadTop: RUN_LEAD_TOP,
    reducedMotion,
    appActive,
    held: threadDrawing,
    onFreshOpen: openInPlace ? onFreshOpen : undefined,
  });
  // Every other way an open ends (a host's reset, a settle to closed, the run re-keyed under
  // it) drops a reveal not yet landed, as the close tap does: the list never moves for a run
  // that is no longer opening.
  const revealPhase = motion.phase;
  useEffect(() => {
    if (revealPhase === 'closed' || revealPhase === 'closing') dropReveal();
  }, [revealPhase]);
  useEffect(() => dropReveal, [node.id]);
  const toggle = () => {
    // A close (or a reversal) never scrolls: a reveal not yet fired is dropped.
    if (expanded) dropReveal();
    // The shipped open: geometry on `LayoutAnimation`, nothing else moves; under reduced
    // motion the rows appear. The open-in-place machine drives its own layout commits.
    if (!openInPlace && !reducedMotion) LayoutAnimation.configureNext(expanded ? FOLD_LAYOUT : UNFOLD_LAYOUT);
    onToggle(node.id);
  };
  const Chevron = expanded ? ChevronUp : ChevronDown;
  // Whether the members are on screen under the run: the host's state for the shipped open;
  // the machine's slot for open in place, which yields the row's edge back on the close's
  // configured commit (so the last node's padding never changes on a bare one, CUL-1721).
  const membersOut = openInPlace ? motion.membersBelow : expanded;
  const members = node.rows.map((row, i) => (
    <SpineEventRow
      key={row.id}
      node={row}
      isFirst={false}
      isLast={isLast && i === node.rows.length - 1}
      onOpen={onOpen}
      member
    />
  ));
  // Open in place: the chevron TURNS (one glyph, rotated 180°, so the turn reverses from
  // where it is); the shipped open swaps the glyph.
  const chevron = openInPlace ? (
    <Animated.View
      testID={`spine-run-chevron-${node.id}`}
      style={{
        transform: [{ rotate: motion.values.chevron.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }],
      }}
    >
      <ChevronDown size={15} color={theme.colorAccentInk} strokeWidth={2} />
    </Animated.View>
  ) : (
    <Chevron size={15} color={theme.colorAccentInk} strokeWidth={2} />
  );
  return (
    <View>
      <Pressable
        ref={headerRef}
        onPress={toggle}
        onLayout={openInPlace ? (e) => motion.onHeaderLayout(e.nativeEvent.layout.height) : undefined}
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
            isLast={isLast && !membersOut}
            time={node.timeRange}
            pressed={pressed}
            // The chevron rides the row's edge, not the title's end, so a long food name
            // wraps under it and the arrow never moves. It points the way the run opens:
            // here, downward (rule D).
            trailing={chevron}
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
      {openInPlace && motion.slotMounted ? (
        // The lead: out of the run's own bead, down the header's thread segment. Drawn over
        // the header (so the grey thread never stripes it) from the bead's foot (so it never
        // covers the bead). An explicit top and height, so no layout commit ever touches its
        // frame; its scaleY is native.
        <Animated.View
          pointerEvents="none"
          testID={`spine-run-lead-${node.id}`}
          style={[
            styles.runLead,
            {
              height: motion.leadHeight,
              opacity: motion.values.line,
              transform: [{ scaleY: motion.values.lead }],
            },
          ]}
        />
      ) : null}
      {openInPlace ? (
        <RunInPlace
          nodeId={node.id}
          motion={motion}
          memberIds={node.rows.map((r) => r.id)}
          onFirstMealFoot={(foot) => {
            firstMealFoot.current = foot;
          }}
        >
          {members}
        </RunInPlace>
      ) : expanded ? (
        // Every member, each a full row in the member form: uncapped, unclipped, every
        // fact (GAP-8). The run's rail lies over the thread along them.
        <View style={styles.members} testID={`spine-members-${node.id}`}>
          <View style={styles.runRail} pointerEvents="none" testID={`spine-run-rail-${node.id}`} />
          {members}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The members opening in place, on the run's own motion (CUL-1734). The slot is the box:
 * mounted SHUT at zero height, let go on one configured commit, clipped while it moves.
 * The rail inside it is a plain line with no transform, anchored top and bottom, so the
 * box's own keyframe carries it along the edge. Each meal sits in its own animated wrapper
 * and lands as the edge reaches it.
 *
 * ONE ELEMENT TYPE PER NODE ACROSS EVERY PHASE (CUL-1721): the rail, the stage and every
 * meal's wrapper are the same elements from the box's mount to its unmount, so nothing
 * remounts at either end: a member VoiceOver is on keeps its focus, and a press lands.
 */
function RunInPlace({
  nodeId,
  motion,
  memberIds,
  onFirstMealFoot,
  children,
}: {
  nodeId: string;
  motion: ReturnType<typeof useRunOpen>;
  memberIds: string[];
  /** The first meal's foot below the box's top, at rest (the reveal's measure, CUL-1735). */
  onFirstMealFoot: (foot: number) => void;
  children: ReactNode[];
}) {
  const stageY = useRef(0);
  if (!motion.slotMounted) return null;
  return (
    <View
      style={[styles.members, motion.boxHeight === 0 && styles.membersShut, motion.clipped && styles.membersClip]}
      testID={`spine-members-${nodeId}`}
    >
      <Animated.View
        pointerEvents="none"
        testID={`spine-run-rail-${nodeId}`}
        style={[
          styles.runLine,
          motion.railBottom != null ? { bottom: motion.railBottom } : null,
          { opacity: motion.values.line },
        ]}
      />
      <View
        testID={`spine-members-stage-${nodeId}`}
        onLayout={(e) => {
          stageY.current = e.nativeEvent.layout.y;
          motion.onStageLayout(e.nativeEvent.layout.height);
        }}
      >
        {children.map((child, i) => {
          const v = motion.values.members[i];
          return (
            <Animated.View
              key={memberIds[i]}
              testID={`spine-member-wrap-${memberIds[i]}`}
              onLayout={(e) => {
                const { y, height } = e.nativeEvent.layout;
                motion.onMemberLayout(i, y);
                if (i === 0) onFirstMealFoot(stageY.current + y + height);
              }}
              style={{ opacity: v.opacity, transform: [{ translateY: v.shift }] }}
            >
              {child}
            </Animated.View>
          );
        })}
      </View>
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

  // The chips: the app's small-caps tag register (the retired IntakeBadge's geometry), three inks.
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

  // No read yet / Not enough to say yet: a hatched grey mark and grey words. Never rose.
  unread: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space0_5,
    marginTop: theme.space0_5,
  },
  unreadText: {
    // Up to "Not enough to say yet" (CUL-1234): wraps beside the mark at large text,
    // never overflows the row.
    flexShrink: 1,
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
  },

  // An opened run: its members are full rows on the thread; the run's rail lies over it.
  members: { position: 'relative' },
  // In flight only: a rail holding the open box's height never spills past a closing box.
  membersClip: { overflow: 'hidden' },
  runRail: {
    position: 'absolute',
    left: THREAD_X - RUN_RAIL_W / 2,
    top: 0,
    bottom: theme.space2,
    width: RUN_RAIL_W,
    borderRadius: RUN_RAIL_W / 2,
    backgroundColor: theme.colorEventMeal,
  },
  // Open in place (CUL-1734): the box shut at zero while it waits for its configured commit.
  membersShut: { height: 0 },
  // The lead, from the run's bead to the header's foot. `colorAccentGlyph` (3.27:1, a
  // glyph on the light card, C-1); square at both ends: the bead caps its top, and the
  // box's line takes over at its foot.
  runLead: {
    position: 'absolute',
    left: THREAD_X - RUN_RAIL_W / 2,
    top: RUN_LEAD_TOP,
    width: RUN_RAIL_W,
    backgroundColor: theme.colorAccentGlyph,
    transformOrigin: 'top',
  },
  // The box's line: plain, no transform, the box's keyframe carries it. Square at its top,
  // where it meets the lead; down to the last meal's bead once the meals have measured.
  runLine: {
    position: 'absolute',
    left: THREAD_X - RUN_RAIL_W / 2,
    top: 0,
    bottom: theme.space2,
    width: RUN_RAIL_W,
    borderBottomLeftRadius: RUN_RAIL_W / 2,
    borderBottomRightRadius: RUN_RAIL_W / 2,
    backgroundColor: theme.colorAccentGlyph,
  },
});
