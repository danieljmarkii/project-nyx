// The search field (History v2, HV-9 / CUL-1166; spec §3.7, R-2, GAP-15). Opened by the
// pinned row's search button and drawn under it, inside the pinned slot, so it stays in
// reach while the owner scrolls what it found.
//
// It WRITES THE STORE and nothing else: the list's page query takes the store's text
// (`effectiveSearch`) as one extra condition. The field keeps the owner's typing locally
// and hands it to the store after a short pause, so the list is not re-read on every
// keystroke; the search key and Done hand it over at once. Nothing is saved: the store
// holds the text only while the field is open (Done clears it), and nothing here reports
// a search anywhere.
//
// Every write names its pet (the store's rule), so a pause that outlives a pet switch
// hands its text to a store that has moved on, which refuses it; the timer is cleared on
// unmount as well.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { SEARCH_CANCEL_LABEL, searchLabelOf, searchPlaceholderOf } from '../../lib/historyControls';
import { SEARCH_READS_NOTES } from '../../lib/historyQueries';
import { useHistoryScopeStore } from '../../store/historyScopeStore';

/** How long typing rests before the store hears it. */
export const SEARCH_WRITE_DELAY_MS = 250;

/** The 44pt touch floor. */
const TOUCH_FLOOR = 44;

interface Props {
  petId: string;
  petName: string;
  /** Bumped by the search button while the field is already open: focus it again. */
  focusTick: number;
}

export function SearchField({ petId, petName, focusTick }: Props) {
  const [text, setText] = useState(() => useHistoryScopeStore.getState().searchText);
  const input = useRef<TextInput>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPending = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const handOver = (value: string) => {
    cancelPending();
    useHistoryScopeStore.getState().setSearchText(petId, value);
  };

  useEffect(() => cancelPending, []);
  useEffect(() => {
    if (focusTick > 0) input.current?.focus();
  }, [focusTick]);

  return (
    <View style={styles.field} testID="history-v2-search-field">
      <Search size={15} color={theme.colorTextTertiary} strokeWidth={2} />
      <TextInput
        ref={input}
        style={styles.input}
        value={text}
        onChangeText={(value) => {
          setText(value);
          cancelPending();
          timer.current = setTimeout(() => handOver(value), SEARCH_WRITE_DELAY_MS);
        }}
        onSubmitEditing={() => handOver(text)}
        placeholder={searchPlaceholderOf(SEARCH_READS_NOTES)}
        placeholderTextColor={theme.colorTextTertiary}
        accessibilityLabel={searchLabelOf(petName)}
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      <TouchableOpacity
        onPress={() => {
          cancelPending();
          useHistoryScopeStore.getState().closeSearch(petId);
        }}
        style={styles.done}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityHint="Clears the search"
      >
        <ThemedText style={styles.cancelLabel}>{SEARCH_CANCEL_LABEL}</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // As far below the pinned row as a pill's vertical slop (ScopeMenu's 8pt) can reach past
  // it, even from a pill as tall as the row, so a tap on the field's top edge never lands
  // on a pill (C-5; PinnedRow.test.tsx reads both off the rendered tree).
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    marginTop: theme.space1,
    paddingLeft: theme.space1,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorSurfaceSubtle,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: TOUCH_FLOOR,
    paddingVertical: theme.space1,
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  // At the 44pt floor by its box, with no slop, so nothing it reaches overlaps the input
  // beside it (C-5).
  done: {
    minHeight: TOUCH_FLOOR,
    minWidth: TOUCH_FLOOR,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.space1,
  },
  cancelLabel: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
});
