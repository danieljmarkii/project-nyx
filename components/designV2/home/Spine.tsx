// Home's spine — the day, top to bottom (Design v2 — the whole day, D2-4 / CUL-1066).
//
// Lays the model's nodes down the thread and owns ONE piece of state: which compact
// node is open. Everything a node says is the pipeline's (`lib/dayNodes.ts`); how a node
// looks is the row's (`components/dayRow/`, the one row Home and History share since
// History v2 HV-1); this file only threads them.
//
// The open set is per node id and device-local for the life of the mount — it is not
// the record's and it is not synced (the fold's own rule for what a disclosure is).

import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '../../../constants/theme';
import type { DayNode } from '../../../lib/dayNodes';
import { DayNodeRow } from '../../dayRow/DayNodeRow';

export function Spine({ nodes, onOpen }: { nodes: DayNode[]; onOpen?: (id: string) => void }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback((id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  return (
    <View style={styles.spine} testID="home-spine">
      {nodes.map((node, i) => (
        <DayNodeRow
          key={node.id}
          node={node}
          isFirst={i === 0}
          isLast={i === nodes.length - 1}
          expanded={open.has(node.id)}
          onToggle={toggle}
          onOpen={onOpen}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  spine: { marginTop: theme.space2 },
});
