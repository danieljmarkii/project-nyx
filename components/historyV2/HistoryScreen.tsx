// components/historyV2/ — the ONE namespace History v2's rendering lives in (History
// v2 · the record you can read, HV-1 / CUL-1158; spec §5.1, CLAUDE.md C-36).
//
// Every node the `history_v2` flag draws lives in this directory, so stubbing it is the
// same thing as "History v2 does not exist" — the premise guards/historyV2FlagOff.test.tsx
// rests on. The History tab holds the gate (`useHistoryV2()`) and draws this screen; it
// draws nothing of v2 inline. A helper belongs in `lib/`, and a hook in `hooks/`: the
// guard's switch wraps every function this namespace exports into a component.
//
// This file is the COMPOSITION ROOT: the pinned row above the list (spec §3.1). Step 2
// fills the slots in parallel, one session per slot, none editing another's file (spec §8):
//   • PinnedRow   — HV-9 (CUL-1166): the pet, the type pill, the window pill, search.
//   • HistoryList — HV-7 (CUL-1164): the day cards, the count line, the bowl's line, and
//                   the WeekStrip slot in its header (HV-8, CUL-1165, fills WeekStrip).
// HV-7 owns this file from step 2 on. It also takes today's links into History
// (`useHistoryDoor`, HV-7; HV-11's from step 3): a link applies to the scope store, which
// every slot reads, so the pill, the strip and the list all move together.
//
// The whole screen sits on the neutral ground round 5 draws (the pinned row's `.hh` and the
// list's are both #FAFAFA, `colorNeutralLight`), so a stuck day header's white card reads
// against it and nothing bands between the pinned row and the list. HV-1 had v1's white.
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { useHistoryDoor } from '../../hooks/useHistoryDoor';
import { HistoryList } from './HistoryList';
import { PinnedRow } from './PinnedRow';

export function HistoryScreen() {
  useHistoryDoor();
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']} testID="history-v2-screen">
      <PinnedRow />
      <HistoryList />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
});
