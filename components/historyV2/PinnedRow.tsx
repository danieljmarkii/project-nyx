// The pinned row (History v2, HV-9 / CUL-1166; spec §3.1, §3.7–3.9, H-3, H-5, H-9).
//
// What stays on screen while the list scrolls: whose record it is (the active pet), what
// the list is filtered to (the type pill, with its count once the record has answered),
// which days (the window pill), and the search button. The composition root mounts it
// bare above the list (HV-1): everything it shows is scope state (`historyScopeStore`),
// the active pet, and the record's facts, which it reads for itself
// (`useHistoryRecordFacts`), so no other lane's file had to change to fill it.
//
// Every rule is `lib/historyControls.ts`'s (`pinnedRowViewOf`); this file only draws what
// it returns. The search field it opens sits directly under the row, in this slot, so it
// stays in reach while the owner reads what it found.
//
// A pet switch resets the scope inside the pet store's own update (HV-3), so this row
// never shows one pet's name over another pet's filter; the two sheets close because they
// are keyed on the pet, and the field closes with the scope (AC 13).
import { useMemo, useState } from 'react';
import { Keyboard, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { SearchField } from './SearchField';
import { TypeSheet } from './TypeSheet';
import { WindowSheet } from './WindowSheet';
import { useAllowlistFlag } from '../../hooks/useAppConfig';
import { useHistoryRecordFacts } from '../../hooks/useHistoryRecordFacts';
import { useBetaOptIn } from '../../lib/betaFeatures';
import { PHOTO_READING_OFF, pinnedRowViewOf, searchLabelOf } from '../../lib/historyControls';
import { lookCardLive } from '../../lib/lookCard';
import { toLocalDayKey } from '../../lib/utils';
import { effectiveSearch, useHistoryScopeStore } from '../../store/historyScopeStore';
import { usePetStore } from '../../store/petStore';

/** The 44pt touch floor: the row's height, and the search button's box. */
const TOUCH_FLOOR = 44;
/** The round search button, drawn at the pills' height so the three sit level. */
const SEARCH_CIRCLE = 32;

export function PinnedRow() {
  const { activePet } = usePetStore();
  const filter = useHistoryScopeStore((s) => s.filter);
  const windowKey = useHistoryScopeStore((s) => s.window);
  const searchOpen = useHistoryScopeStore((s) => s.searchOpen);
  const searchText = useHistoryScopeStore((s) => s.searchText);
  const record = useHistoryRecordFacts();
  const lookEligible = useAllowlistFlag('daily_look');
  const lookOptedIn = useBetaOptIn('daily_look');
  const [focusTick, setFocusTick] = useState(0);
  const species = activePet?.species;

  const view = useMemo(
    () =>
      pinnedRowViewOf({
        record: record.status === 'ready' ? record.data : null,
        filter,
        window: windowKey,
        search: effectiveSearch({ searchOpen, searchText }),
        lookLive: lookCardLive({ eligible: lookEligible, optedIn: lookOptedIn, species }),
        readingOff: PHOTO_READING_OFF,
        today: toLocalDayKey(new Date()),
      }),
    [record, filter, windowKey, searchOpen, searchText, lookEligible, lookOptedIn, species],
  );

  if (!activePet) return null;
  const petId = activePet.id;

  return (
    <View style={styles.container} testID="history-v2-pinned-row">
      <View style={styles.row}>
        <ThemedText accessibilityRole="header" numberOfLines={1} style={styles.petName}>
          {activePet.name}
        </ThemedText>
        <View style={styles.controls}>
          {/* A sheet opened while the search field is focused must not sit under the
              keyboard, so a touch on either pill puts the keyboard away first. */}
          <View style={styles.typePill} onTouchStart={Keyboard.dismiss} testID="history-v2-type-pill">
            <TypeSheet petId={petId} filter={filter} rows={view.typeRows} pill={view.typePill} />
          </View>
          <View style={styles.windowPill} onTouchStart={Keyboard.dismiss} testID="history-v2-window-pill">
            <WindowSheet petId={petId} current={view.currentWindow} rows={view.windowRows} pill={view.windowPill} />
          </View>
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => {
              // Already open: take the owner back to the field rather than doing nothing.
              if (useHistoryScopeStore.getState().openSearch(petId) && searchOpen) setFocusTick((n) => n + 1);
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={searchLabelOf(activePet.name)}
            accessibilityState={{ expanded: searchOpen }}
            testID="history-v2-search-button"
          >
            <View style={styles.searchCircle}>
              <Search size={16} color={theme.colorTextSecondary} strokeWidth={2} />
            </View>
          </TouchableOpacity>
        </View>
      </View>
      {searchOpen ? (
        <SearchField key={petId} petId={petId} petName={activePet.name} focusTick={focusTick} />
      ) : null}
    </View>
  );
}

// ── WHAT GIVES WAY ON A NARROW PHONE ──────────────────────────────────────────────
// The window pill never shrinks: a date cut by an ellipsis can read as another date
// (*Since Jul 2…* for Jul 26), and the design authority pins its pills (round 5). The pet's
// name and the type pill's words give way instead, together and in proportion to their
// width; the type pill's count never does (ScopeMenu keeps it in its own unshrinking
// text), and VoiceOver reads every one of them whole (C-8).
const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.space2,
    paddingBottom: theme.space1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_FLOOR,
    gap: theme.space1,
  },
  petName: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  // The pills carry vertical slop only (ScopeMenu), and the search button reaches its
  // floor by its box with none, so no two controls here share hit area at this gap (C-5).
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space0_5,
    marginLeft: 'auto',
    flexShrink: 1,
    minWidth: 0,
  },
  typePill: {
    flexShrink: 1,
    minWidth: 0,
  },
  windowPill: {
    flexShrink: 0,
  },
  searchButton: {
    width: TOUCH_FLOOR,
    height: TOUCH_FLOOR,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  searchCircle: {
    width: SEARCH_CIRCLE,
    height: SEARCH_CIRCLE,
    borderRadius: theme.radiusFull,
    borderWidth: 1,
    borderColor: theme.colorBorderStrong,
    backgroundColor: theme.colorSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
