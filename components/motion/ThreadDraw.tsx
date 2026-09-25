// A day's rows on its thread, with the first paint and a removal's fold (History v2, HV-10 /
// CUL-1167; spec §4 "First paint", "Land on a day", "Remove a row"). The choreography is
// `threadMotion.ts`'s; this is the one place it is drawn, so History's day card and Home's
// spine cannot draw it two ways (C-30).
//
// THE ANATOMY. A plain column (no style of its own, so the rows lay out exactly as they
// would without it), one `Animated.View` per row, and, only while a draw is in flight, the
// drawing line: an absolute line standing exactly on the thread (`SPINE_THREAD`, the
// frame's own geometry), from the first row's dot to the last one's, that grows about its
// top. The rows' own segments land with the rows over it, so when the line leaves nothing
// on screen changes.
//
// THE WRAPPERS ARE ALWAYS MOUNTED, at rest bound to an opacity of 1 and a translate of 0.
// Swapping a plain View for an animated one when a draw starts would REMOUNT the row, and a
// row can be mid-arrival (a read landing on its node, `useNodeArrival`): a remount drops
// the arrival and its one announcement. Each wrapper is bound to the same values for its
// whole life, so no node is ever re-attached mid-flight.
//
// A REMOVAL folds the row the fold's way (the Signal fold's `leaveMs`, then its box): the
// row fades out here, over 180ms, while `leaving` names it; the host then takes it out of
// the list under `FOLD_LAYOUT`, and the rows beneath close over it in 300ms. The host owns
// the timing and the reduced-motion form (gone at once), because the host decides when the
// row leaves the record on screen.
//
// No haptic here: the rows include a photographed vomit's `worth_a_call`, and this file is
// named in `guards/haptics.test.ts`'s ALWAYS_SCANNED.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useAppActive } from '../../hooks/useAppActive';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { FOLD_MOTION } from './foldMotion';
import { useThreadDraw, type ThreadRowStyle } from './threadMotion';

export interface ThreadRow {
  key: string;
  node: ReactNode;
}

/** Where the thread runs from a row's left edge, and how it is drawn (`SPINE_THREAD`). */
export interface ThreadGeometry {
  x: number;
  dotCenterY: number;
  lineW: number;
  color: string;
}

export interface ThreadDrawProps {
  rows: readonly ThreadRow[];
  /** The ledger's token for this day (`PaintLedger.peek`), or null. */
  token: string | null;
  claim: (token: string) => boolean;
  thread: ThreadGeometry;
  /** Rows fading out ahead of their removal, by key. */
  leaving?: ReadonlySet<string>;
  style?: StyleProp<ViewStyle>;
  testID: string;
}

const NO_LEAVING: ReadonlySet<string> = new Set();

export function ThreadDraw({ rows, token, claim, thread, leaving = NO_LEAVING, style, testID }: ThreadDrawProps) {
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();
  const draw = useThreadDraw({ token, rows: rows.length, claim, reducedMotion, appActive });

  // The line runs from the first row's dot to the last one's, so it needs where the last row
  // sits. Measured on every layout (cheap; a state change only when a row moves).
  const [ends, setEnds] = useState<{ first: number; last: number } | null>(null);
  const firstKey = rows.length > 0 ? rows[0].key : null;
  const lastKey = rows.length > 0 ? rows[rows.length - 1].key : null;
  const ys = useRef(new Map<string, number>());
  const measure = (key: string, e: LayoutChangeEvent) => {
    ys.current.set(key, e.nativeEvent.layout.y);
    if (key !== firstKey && key !== lastKey) return;
    const first = firstKey !== null ? ys.current.get(firstKey) : undefined;
    const last = lastKey !== null ? ys.current.get(lastKey) : undefined;
    if (first === undefined || last === undefined) return;
    setEnds((prev) => (prev && prev.first === first && prev.last === last ? prev : { first, last }));
  };

  const line =
    draw.drawing && rows.length > 1 && ends !== null && ends.last > ends.first ? (
      <Animated.View
        pointerEvents="none"
        testID={`${testID}-line`}
        style={[
          styles.line,
          {
            left: thread.x - thread.lineW / 2,
            top: ends.first + thread.dotCenterY,
            height: ends.last - ends.first,
            width: thread.lineW,
            backgroundColor: thread.color,
            transform: [{ scaleY: draw.lineScale }],
          },
        ]}
      />
    ) : null;

  return (
    <View style={style} testID={testID}>
      {line}
      {rows.map((row, i) => (
        <ThreadRowStage
          key={row.key}
          land={draw.rowStyle(i)}
          leaving={leaving.has(row.key)}
          reducedMotion={reducedMotion}
          onLayout={(e) => measure(row.key, e)}
          testID={`${testID}-row-${row.key}`}
        >
          {row.node}
        </ThreadRowStage>
      ))}
    </View>
  );
}

/** One row's wrapper: the draw's landing, times its own removal fade. */
function ThreadRowStage({
  land,
  leaving,
  reducedMotion,
  onLayout,
  testID,
  children,
}: {
  land: ThreadRowStyle;
  leaving: boolean;
  reducedMotion: boolean;
  onLayout: (e: LayoutChangeEvent) => void;
  testID: string;
  children: ReactNode;
}) {
  const leave = useRef(new Animated.Value(1)).current;
  // One node for the row's life (a new `multiply` per render would re-attach it mid-flight).
  const opacity = useMemo(() => Animated.multiply(land.opacity, leave), [land.opacity, leave]);

  useEffect(() => {
    if (!leaving) {
      leave.setValue(1);
      return;
    }
    if (reducedMotion) {
      leave.setValue(0);
      return;
    }
    const anim = Animated.timing(leave, {
      toValue: 0,
      duration: FOLD_MOTION.leaveMs,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      // Pinned: a native-driver animation never writes its end back to JS.
      if (finished) leave.setValue(0);
    });
    return () => anim.stop();
  }, [leaving, reducedMotion, leave]);

  return (
    <Animated.View style={{ opacity, transform: land.transform }} onLayout={onLayout} testID={testID}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // The line grows about its TOP: the thread draws down, the way the eye reads the day.
  line: { position: 'absolute', transformOrigin: 'top' },
});
