// The draw-in's FACT on Home (CUL-1223, BRK-12; the handoff half of D2-7 · CUL-1068).
//
// Home mounts BEHIND the cold-start silhouette, so a chart that armed its draw on its own
// first mount would play it unseen. This hook is the one place that says when a Home chart
// has "just arrived for this reader" (C-30: the trigger is the fact):
//
//   • a returning device never shows the silhouette — the chart draws on its first mount;
//   • while the silhouette is up (`coldStartHydrating`) the chart holds its static frame;
//   • once the silhouette has shown, the chart waits for `coldStartHandoff` — bumped once,
//     as the crossfade begins — so it draws exactly once, as the shape gives way.
//
// `key` goes into the chart's draw identity, so the handoff's bump is what re-arms a chart
// that mounted under the silhouette. The one render between the silhouette's `true → false`
// edge and the bump is held too (`sawHydrating` without a handoff), so the draw never
// starts and restarts a frame later.

import { useRef } from 'react';
import { useSyncStore } from '../../store/syncStore';

export interface ColdStartDrawFact {
  /** Arm the draw now. */
  armed: boolean;
  /** Folded into the draw identity: a handoff re-arms. */
  key: number;
}

export function useColdStartDrawFact(): ColdStartDrawFact {
  const hydrating = useSyncStore((s) => s.coldStartHydrating);
  const handoff = useSyncStore((s) => s.coldStartHandoff);
  const handoffAtMount = useRef(handoff);
  const sawHydrating = useRef(false);
  // Render-time and idempotent: a latch that only ever turns on.
  if (hydrating) sawHydrating.current = true;
  const waitingForHandoff = sawHydrating.current && handoff === handoffAtMount.current;
  return { armed: !hydrating && !waitingForHandoff, key: handoff };
}
