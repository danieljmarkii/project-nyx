// The log sheet's HOST — the one root-layout mount for `EventTypeSheet` (CUL-503 /
// CUL-504; `store/uiStore.ts`'s `LogSheetRequest` block carries the why in full).
//
// Thin on purpose, like `IntakeDoorHost` beside it: it turns the store's request into the
// sheet's props and nothing else, so the root layout stays a list of mounted surfaces.
//
// ALWAYS MOUNTED, unlike `IntakeDoorHost`, which renders nothing until asked. The sheet
// keys two behaviours off its `visible` prop going false while it is still mounted: the
// Modal's slide-out (unmounting a visible Modal drops it with no animation) and the reset
// that hands the completion register back. Unmount-on-close would trade both for nothing.
//
// A FRESH SHEET PER OPEN. The key is the store's open count, so every open mounts a new
// sheet while a close keeps the old one (the count only moves on an open). That is what
// makes `initialType` safe to read at mount — the stage an open starts at comes from
// the new instance's state initialisers, with no update ordering to get wrong. The
// shape it replaced, a setState during render on the open's rising edge, landed on the
// grid when opened through this host: the sheet's reset effect queues no-op sets at
// mount, and React replayed them after the render-phase update
// (EventTypeSheet.test.tsx, "through the root host").

import { useCallback } from 'react';
import { useUiStore } from '../../store/uiStore';
import { EventTypeSheet } from './EventTypeSheet';

export function LogSheetHost() {
  const request = useUiStore((st) => st.logSheet);
  const opens = useUiStore((st) => st.logSheetOpens);
  const closeLogSheet = useUiStore((st) => st.closeLogSheet);
  const onClose = useCallback(() => closeLogSheet(), [closeLogSheet]);

  return (
    <EventTypeSheet
      key={opens}
      visible={request !== null}
      initialType={request?.initialType ?? null}
      onClose={onClose}
    />
  );
}
