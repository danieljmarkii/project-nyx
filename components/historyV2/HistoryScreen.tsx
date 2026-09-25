// components/historyV2/ — the ONE namespace History v2's rendering lives in (History
// v2 · the record you can read, HV-1 / CUL-1158; spec §5.1, CLAUDE.md C-36).
//
// Every node the `history_v2` flag draws lives in this directory, so stubbing it is the
// same thing as "History v2 does not exist" — the premise guards/historyV2FlagOff.test.tsx
// rests on. The History tab holds the gate (`useHistoryV2()`) and draws this screen; it
// draws nothing of v2 inline. A helper belongs in `lib/`: the guard's switch wraps every
// function this namespace exports into a component.
//
// This file is the COMPOSITION ROOT: the pinned row above the list (spec §3.1). At HV-1
// each slot is a placeholder that renders nothing; step 2 fills them in parallel, one
// session per slot, none editing another's file (spec §8):
//   • PinnedRow   — HV-9 (CUL-1166): the pet, the type pill, the window pill, search.
//   • HistoryList — HV-7 (CUL-1164): the day cards, the count line, the bowl's line, and
//                   the WeekStrip slot in its header (HV-8, CUL-1165, fills WeekStrip).
// HV-7 owns this file from step 2 on.
//
// The container is drawn while both slots are still empty, on purpose: a v2 screen that
// rendered NOTHING would equal its own absence, so the flag-off guard could not tell an
// ungated mount from a gated one. Its ground is v1's (`colorSurface`), so the tab's top
// inset reads the same either side of the switch.
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { HistoryList } from './HistoryList';
import { PinnedRow } from './PinnedRow';

export function HistoryScreen() {
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
    backgroundColor: theme.colorSurface,
  },
});
