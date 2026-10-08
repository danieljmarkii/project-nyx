// The log sheet's HOST — the one root-layout mount for `EventTypeSheet` (CUL-503 /
// CUL-504; `store/uiStore.ts`'s `LogSheetRequest` block carries the why in full).
//
// Thin on purpose, like `IntakeDoorHost` beside it: it turns the store's request into the
// sheet's props and nothing else, so the root layout stays a list of mounted surfaces.
//
// ALWAYS MOUNTED, unlike `IntakeDoorHost`, which renders nothing until asked. The sheet
// keys two behaviours off its `visible` prop going false while it is still mounted: its
// exit (unmounting a visible Modal drops it with no animation) and the reset
// that hands the completion register back. Unmount-on-close would trade both for nothing.
//
// A FRESH SHEET PER OPEN. The key is the store's open count (once the previous sheet has
// finished leaving, below), so every open mounts a new sheet while a close keeps the old
// one (the count only moves on an open). That is what
// makes `initialType` safe to read at mount — the stage an open starts at comes from
// the new instance's state initialisers, with no update ordering to get wrong. The
// shape it replaced, a setState during render on the open's rising edge, landed on the
// grid when opened through this host: the sheet's reset effect queues no-op sets at
// mount, and React replayed them after the render-phase update
// (EventTypeSheet.test.tsx, "through the root host").

// THE EXITING PHASE (CUL-1642). The sheet's Modal no longer slides (`animationType`
// "none"; `components/motion/sheetMotion.ts` moves what is inside it), so a close is the
// sheet's own exit and the Modal stays presented until that exit reports `onExited`.
// While it runs, a new open WAITS rather than re-keying: the key moves only once the
// old instance's Modal has gone down in a commit of its own. That is CUL-1472's race
// closed by construction: a door tapped during the slide-out used to unmount a Modal
// that was still on screen and present a fresh one in the same commit, the two-Modal
// state C-14 forbids. The wait is at most the exit (180ms, 150ms under Reduce Motion);
// the fan's veil, when it handed one over, stays up across it.

import { useCallback, useEffect, useState } from 'react';
import { useUiStore } from '../../store/uiStore';
import { EventTypeSheet } from './EventTypeSheet';

export function LogSheetHost() {
  const request = useUiStore((st) => st.logSheet);
  const opens = useUiStore((st) => st.logSheetOpens);
  const closeLogSheet = useUiStore((st) => st.closeLogSheet);
  const takeLogSheetVeil = useUiStore((st) => st.takeLogSheetVeil);
  const onClose = useCallback(() => closeLogSheet(), [closeLogSheet]);

  // The open the mounted instance belongs to, and whether that instance is still on
  // its way out. A request whose count differs from `shownOpen` is waiting for a sheet.
  const [shownOpen, setShownOpen] = useState(opens);
  const [exiting, setExiting] = useState(false);
  const current = request !== null && shownOpen === opens;

  // A closed instance is exiting until it says otherwise. Set on the fall of `current`,
  // so an instance that was never opened (the first mount) never waits on itself.
  const [wasCurrent, setWasCurrent] = useState(current);
  if (wasCurrent !== current) {
    setWasCurrent(current);
    if (!current) setExiting(true);
  }

  useEffect(() => {
    if (request !== null && shownOpen !== opens && !exiting) setShownOpen(opens);
  }, [request, opens, shownOpen, exiting]);

  const onExited = useCallback(() => setExiting(false), []);

  return (
    <EventTypeSheet
      key={shownOpen}
      visible={current}
      initialType={request?.initialType ?? null}
      veil={request?.veil ?? 'own'}
      onClose={onClose}
      onVeilTaken={takeLogSheetVeil}
      onExited={onExited}
    />
  );
}
