// `<DayNodeRow node>` — the row History v2 and Home draw for one node of a day
// (History v2, HV-1 / CUL-1158; spec §5.5: "node in, row out").
//
// The node comes from `buildDayNodes` (`lib/dayNodes.ts`); this picks its row — a single
// event or a run of meals — and adds nothing of its own, so the two surfaces cannot draw
// the same node two ways (AC 15). A run's open state is the CALLER's (Home's `Spine`, a
// History day card): it is per node id, device-local and per mount, never the record's
// (the fold's rule for what a disclosure is), so it is handed in, never held here.
import type { DayNode } from '../../lib/dayNodes';
import { SpineCompactRow, SpineEventRow } from './SpineNodeRow';

export interface DayNodeRowProps {
  node: DayNode;
  isFirst: boolean;
  isLast: boolean;
  /** Whether a run is open in place. Ignored for a single event. */
  expanded: boolean;
  /** Open or close a run, by its node id. */
  onToggle: (id: string) => void;
  /** Overridable so a test opens a row without a router. */
  onOpen?: (id: string) => void;
  /** A run opens on the shared open-in-place choreography (History v2, HV-10): History's day
   *  cards, and Home's spine under `history_v2`. Off, the run keeps the shipped open. */
  openInPlace?: boolean;
}

export function DayNodeRow({ node, isFirst, isLast, expanded, onToggle, onOpen, openInPlace = false }: DayNodeRowProps) {
  return node.kind === 'compact' ? (
    <SpineCompactRow
      node={node}
      isFirst={isFirst}
      isLast={isLast}
      expanded={expanded}
      onToggle={onToggle}
      onOpen={onOpen}
      openInPlace={openInPlace}
    />
  ) : (
    <SpineEventRow node={node} isFirst={isFirst} isLast={isLast} onOpen={onOpen} />
  );
}
