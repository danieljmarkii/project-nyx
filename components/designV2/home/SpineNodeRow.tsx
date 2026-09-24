// A node on Home's spine — one event, or one compact run of meals (Design v2 — the
// whole day, D2-4 / CUL-1066; the round-4 page §01 / §02, R4-2 option A).
//
// Draws the model `lib/spineNode.ts` hands over and nothing it does not: the type and
// its detail, "N min after eating" as the lane timed it, a PHOTO GLYPH where the row has
// a picture, and beneath a photographed symptom the READ — a breathing tick while the
// server is working, then the verdict in the record's own words. Never an image: Home
// is the surface a guest sees over the owner's shoulder (T&S; R4-2 ruled option A), so
// the photo is one tap in, on the record, where the vet will ask to see it.
//
// ── THE READ ARRIVES ON THIS NODE ─────────────────────────────────────────────
// The tick that waits IS the rail that lands — one `Animated.View`, keyed once,
// `testID="spine-read-rail-<id>"` before, during and after (`useNodeArrival`, the
// motion module's own header). It recolours to the verdict's tone as a step and grows on
// the fold's numbers; the slot opens 80ms behind it; the sentence lands last. Reduced
// motion is a crossfade with the tick still. The trigger is the model's `pending` fact —
// a chain outstanding or a `pending` row (C-30) — never "the waiting line is drawn".
//
// ── SILENCE ON SAFETY (C-16) ──────────────────────────────────────────────────
// This file paints `worth_a_call` in the rose ink and is named in `guards/haptics.test.ts`
// `ALWAYS_SCANNED`; it imports nothing from `lib/haptics`, and a landed escalation buzzes
// nothing. The arrival is the same on every verdict (G4): the rose rail is the whole
// difference, and it is a colour, not a beat.
//
// ── ONE SENTENCE PER NODE (VoiceOver) ─────────────────────────────────────────
// The row is one accessible element whose label is the node in reading order — the type,
// the detail, the timing, "photographed", the time, then the verdict if one has landed —
// so a screen reader hears the fact and its read together. A compact node carries
// `accessibilityState.expanded` and its rows announce individually once opened. The
// read's arrival is announced politely (`announceForAccessibility`), never assertively:
// a verdict is not an alert.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  LayoutAnimation,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Camera, ChevronDown, ChevronRight } from 'lucide-react-native';
import { theme } from '../../../constants/theme';
import { NODE_DOT_RING, NODE_DOT_SIZE, NODE_TINT_DAY, nodeDotColors } from '../../recap/nodeTints';
import { SpineRowFrame } from '../../recap/DaySpine';
import { ThemedText } from '../../ui/ThemedText';
import { useNodeArrival } from '../../motion/arrivalMotion';
import { FOLD_LAYOUT, UNFOLD_LAYOUT } from '../../motion/foldMotion';
import { useAppActive } from '../../../hooks/useAppActive';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import type { NodeRead, SpineCompactNode, SpineEventNode } from '../../../lib/spineNode';

/** The waiting tick — the fold's own resting rail, 3pt × 16pt. */
export const SPINE_RAIL_WIDTH = 3;
export const SPINE_TICK_HEIGHT = 16;
/** The read slot's copy while the server works — the incident card's own line. */
export const SPINE_READ_PENDING_LABEL = 'Reading the photo…';
/** The photo glyph's spoken word. */
export const PHOTOGRAPHED_LABEL = 'photographed';

const RAIL_TONE = {
  pending: theme.colorBorderStrong,
  attn: theme.colorEventSymptom,
  quiet: theme.colorTextTertiary,
  muted: theme.colorBorderStrong,
} as const;

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
  const label =
    `${node.title}` +
    `${node.detail ? `, ${node.detail}` : ''}` +
    `${node.formatTag ? `, ${node.formatTag.toLowerCase()}` : ''}` +
    `${node.timing ? `, ${node.timing}` : ''}` +
    `${node.photo ? `, ${PHOTOGRAPHED_LABEL}` : ''}` +
    `, ${node.time}` +
    `${read.state === 'landed' ? `. ${read.label}` : read.state === 'pending' ? `. ${SPINE_READ_PENDING_LABEL}` : ''}` +
    `. Opens details`;
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`spine-node-${node.id}`}
    >
      {({ pressed }) => (
        <SpineRowFrame
          ground="day"
          category={node.category}
          isFirst={isFirst}
          isLast={isLast}
          time={node.time}
          pressed={pressed}
          trailing={<ChevronRight size={15} color={theme.colorAccentInk} strokeWidth={2} />}
        >
          <View style={styles.titleLine}>
            <ThemedText style={styles.title}>
              {node.title}
              {node.detail ? <ThemedText style={styles.detail}> · {node.detail}</ThemedText> : null}
              {node.timing ? <ThemedText style={styles.detail}> · {node.timing}</ThemedText> : null}
            </ThemedText>
            {node.formatTag ? (
              <ThemedText style={styles.formatTag} numberOfLines={1}>
                {node.formatTag}
              </ThemedText>
            ) : null}
            {node.photo ? (
              // A glyph, never the picture (R4-2 option A). Spoken as "photographed" through
              // the row's one label; hidden from the tree's own announcement so it is not
              // read twice.
              <View
                style={styles.photoGlyph}
                testID={`spine-photo-${node.id}`}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Camera size={11} color={theme.colorTextTertiary} strokeWidth={2} />
              </View>
            ) : null}
          </View>
          {read.state !== 'none' ? <ReadSlot nodeId={node.id} read={read} /> : null}
        </SpineRowFrame>
      )}
    </Pressable>
  );
}

// ── The read slot — the tick, then the verdict ─────────────────────────────────

function ReadSlot({ nodeId, read }: { nodeId: string; read: Exclude<NodeRead, { state: 'none' }> }) {
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();
  const pending = read.state === 'pending';
  const landed = read.state === 'landed';
  const arrival = useNodeArrival({
    awaitingRead: pending,
    landed,
    reducedMotion,
    appActive,
    identity: nodeId,
    tickHeight: SPINE_TICK_HEIGHT,
  });
  const { values, heldHeight, railHeight, inFlight, breathing } = arrival;

  // The sentence is part of the ARRIVAL, not of a landed read: a read already in the
  // record when Home opened renders its verdict line alone (the page §01's first vomit),
  // and the read that lands while the owner watches keeps its sentence for the rest of
  // the visit (the page's second). Same edge the hook fires on, observed here for the
  // words and the announcement.
  const [sentenceOn, setSentenceOn] = useState(false);
  const wasPending = useRef(pending);
  useLayoutEffect(() => {
    const was = wasPending.current;
    wasPending.current = pending;
    if (was && !pending && landed) {
      setSentenceOn(true);
      // Politely: a verdict is a fact that arrived, not an alert (VoiceOver fixture).
      AccessibilityInfo.announceForAccessibility(read.label);
    }
  }, [pending, landed, read]);

  const tone = landed ? read.tone : 'pending';
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
      {/* THE ONE NODE. Same element in every state — the identity test in this file's
          suite pins it. Its style changes; its key does not. */}
      <Animated.View
        testID={`spine-read-rail-${nodeId}`}
        style={[
          styles.rail,
          { backgroundColor: RAIL_TONE[tone] },
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
        ) : landed ? (
          <Animated.View
            style={{ opacity: values.bodyOpacity, transform: [{ translateY: values.bodyShift }] }}
          >
            <ThemedText
              style={[
                styles.verdict,
                read.tone === 'attn'
                  ? styles.verdictAttn
                  : read.tone === 'quiet'
                    ? styles.verdictQuiet
                    : styles.verdictMuted,
              ]}
              testID={`spine-verdict-${nodeId}`}
            >
              {read.label}
            </ThemedText>
            {sentenceOn && read.readText ? (
              <ThemedText style={styles.sentence}>{read.readText}</ThemedText>
            ) : null}
          </Animated.View>
        ) : null}
        {inFlight ? (
          // The waiting line, leaving in the rail's own window — an overlay out of the
          // flow, so the landed words can already be in it at opacity 0.
          <Animated.View
            pointerEvents="none"
            style={[styles.pendingOverlay, { opacity: values.pendingOpacity }]}
          >
            <ThemedText style={styles.pendingText}>{SPINE_READ_PENDING_LABEL}</ThemedText>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

// ── The compact node ────────────────────────────────────────────────────────────

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
    // Under reduced motion the rows appear — no keyframe, no drift.
    if (!reducedMotion) LayoutAnimation.configureNext(expanded ? FOLD_LAYOUT : UNFOLD_LAYOUT);
    onToggle(node.id);
  };
  const label =
    `${node.title}${node.detail ? `, ${node.detail}` : ''}, ${node.timeRange}. ` +
    `${expanded ? 'Hides' : 'Shows'} each meal`;
  const { fill, ring } = nodeDotColors('meal', NODE_TINT_DAY, theme.colorSurface);
  return (
    <View>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={label}
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
            // wraps under it and the arrow never moves (the page §01's rule).
            trailing={
              expanded ? (
                <ChevronDown size={15} color={theme.colorAccentInk} strokeWidth={2} />
              ) : (
                <ChevronRight size={15} color={theme.colorAccentInk} strokeWidth={2} />
              )
            }
          >
            <ThemedText style={styles.title}>
              {node.title}
              {node.detail ? <ThemedText style={styles.detail}> · {node.detail}</ThemedText> : null}
            </ThemedText>
          </SpineRowFrame>
        )}
      </Pressable>
      {expanded ? (
        <View style={styles.members} testID={`spine-members-${node.id}`}>
          {node.rows.map((row, i) => (
            <MemberRow
              key={row.id}
              row={row}
              fill={fill}
              ring={ring}
              isLast={i === node.rows.length - 1}
              onOpen={onOpen}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function MemberRow({
  row,
  fill,
  ring,
  isLast,
  onOpen,
}: {
  row: SpineEventNode;
  fill: string;
  ring: string;
  isLast: boolean;
  onOpen?: (id: string) => void;
}): ReactNode {
  const open = () => {
    if (onOpen) onOpen(row.id);
    else router.push({ pathname: '/event/[id]', params: { id: row.id } });
  };
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${row.title}${row.detail ? `, ${row.detail}` : ''}, ${row.time}. Opens details`}
      style={({ pressed }) => [styles.member, isLast && styles.memberLast, pressed && styles.memberPressed]}
      testID={`spine-node-${row.id}`}
    >
      <View style={[styles.memberDot, { backgroundColor: fill, borderColor: ring }]} />
      <ThemedText style={styles.memberText} numberOfLines={2}>
        {row.title}
        {row.detail ? <ThemedText style={styles.detail}> · {row.detail}</ThemedText> : null}
        <ThemedText style={styles.detail}> · {row.time}</ThemedText>
      </ThemedText>
      <ChevronRight size={13} color={theme.colorAccentInk} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.space0_5,
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
  formatTag: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    letterSpacing: theme.trackingWide,
    fontWeight: theme.weightMedium,
    flexShrink: 0,
  },
  photoGlyph: { paddingTop: 1 },

  // The read slot — the rail and the words, under the title line.
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
  railTick: { height: SPINE_TICK_HEIGHT, alignSelf: 'center' },
  railFull: { alignSelf: 'stretch' },
  readBody: { flex: 1, minWidth: 0, paddingVertical: theme.spaceMicro },
  readBodyRailOut: { marginLeft: SPINE_RAIL_WIDTH + theme.space1 },
  pendingOverlay: { position: 'absolute', left: 0, top: theme.spaceMicro, right: 0 },
  pendingText: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
  },
  verdict: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
  },
  // The rose INK, never the bright rose, for text on the white card (C-1).
  verdictAttn: { color: theme.colorEventSymptomInk, fontWeight: theme.weightSemibold },
  verdictQuiet: { color: theme.colorTextSecondary },
  verdictMuted: { color: theme.colorTextTertiary },
  sentence: {
    marginTop: theme.spaceMicro,
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightSM,
  },

  // A compact node's members, opened in place.
  members: {
    marginLeft: 56 + 18 + theme.space1 * 2, // the time column + the rail + the gaps
    borderLeftWidth: 2,
    borderLeftColor: theme.colorEventMeal,
    paddingLeft: theme.space1,
    marginBottom: theme.space2,
  },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    minHeight: 44,
    paddingVertical: theme.space0_5,
  },
  memberLast: {},
  memberPressed: { backgroundColor: theme.colorSurfaceSubtle, borderRadius: theme.radiusSmall },
  memberDot: {
    width: NODE_DOT_SIZE,
    height: NODE_DOT_SIZE,
    borderRadius: NODE_DOT_SIZE / 2,
    borderWidth: NODE_DOT_RING,
  },
  memberText: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
  },
});
