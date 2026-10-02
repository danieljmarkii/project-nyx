// Home's spine under `history_v2` (History v2, HV-10 / CUL-1167; spec §5.1 "what rides it",
// §5.6, H-8): today's day drawn with History's first paint and its open in place.
//
// Home's shipped spine (`components/designV2/home/Spine.tsx`) lays the same nodes down the
// same thread through the same row; this is that spine with the two motions `history_v2`
// carries to Home, and nothing else:
//   • the first paint: the thread draws down and the rows land as it passes, once per mount
//     identity (the pet and the day), when today's read first answers. TodayCard holds the
//     paint ledger (it knows when the read answered); this draws what it grants.
//   • a run opens in place (`openInPlace`), the one choreography History's cards and the
//     Patterns month use.
//
// WHY A SECOND SPINE AND NOT A PROP ON THE FIRST. History v2's rendering lives in this one
// namespace (C-36): TodayCard holds the gate and draws either this or the shipped spine, so
// with the flag off Home is the tree it was, and the flag-off guard, which stubs this
// directory, compares exactly that. The open state is per node id and per mount, as the
// shipped spine's is (the fold's rule for what a disclosure is).
//
// This file paints a photographed vomit's `worth_a_call` through the row and hosts its
// arrival on the node; no haptic here (C-16), and it is named in `guards/haptics.test.ts`'s
// ALWAYS_SCANNED.

import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import type { DayNode } from '../../lib/dayNodes';
import { DayNodeRow } from '../dayRow/DayNodeRow';
import { ThreadDraw, type ThreadGeometry } from '../motion/ThreadDraw';
import { SPINE_THREAD } from '../recap/DaySpine';

/** Home's thread: the frame's own, on the spine's left edge. */
const HOME_THREAD: ThreadGeometry = {
  x: SPINE_THREAD.x,
  dotCenterY: SPINE_THREAD.dotCenterY,
  lineW: SPINE_THREAD.lineW,
  color: SPINE_THREAD.dayColor,
};

export interface HomeSpineProps {
  nodes: DayNode[];
  onOpen?: (id: string) => void;
  /** TodayCard's paint ledger's token for today, or null: nothing to draw. */
  drawToken: string | null;
  claimDraw: (token: string) => boolean;
}

export function HomeSpine({ nodes, onOpen, drawToken, claimDraw }: HomeSpineProps) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback((id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const rows = nodes.map((node, i) => ({
    key: node.id,
    node: (
      <DayNodeRow
        node={node}
        isFirst={i === 0}
        isLast={i === nodes.length - 1}
        expanded={open.has(node.id)}
        onToggle={toggle}
        onOpen={onOpen}
        openInPlace
      />
    ),
  }));
  return (
    <ThreadDraw
      rows={rows}
      token={drawToken}
      claim={claimDraw}
      thread={HOME_THREAD}
      style={styles.spine}
      testID="home-spine"
    />
  );
}

const styles = StyleSheet.create({
  // The shipped spine's own inset under the count line.
  spine: { marginTop: theme.space2 },
});
