// The window pill and its sheet (History v2, HV-9 / CUL-1166; spec §3.9, BRK-5, BRK-17,
// H-10, H-11). Draws the rows `lib/historyControls.ts` builds from HV-3's one window
// table on the shipped ScopeMenu. The pill names the window that APPLIES (its short
// name, *Since Jul 26*), which is the one the sheet marks selected: a window asked for
// but not offered today shows All time on both, and the owner's choice stays in the store
// (`resolveWindow`'s `fellBack`).
//
// A pet switch closes the sheet: the menu is keyed on the pet (AC 13).
import { useMemo } from 'react';
import { ScopeMenu, type ScopeMenuOption } from '../ui/ScopeMenu';
import { WINDOW_PILL_PREFIX, WINDOW_SHEET_LABEL, type SheetRow } from '../../lib/historyControls';
import { windowParam, type HistoryWindowKey } from '../../lib/historyWindows';
import { useHistoryScopeStore } from '../../store/historyScopeStore';

interface Props {
  petId: string;
  /** The window the list shows: the applied one, or the store's while its facts load. */
  current: HistoryWindowKey;
  rows: readonly SheetRow<HistoryWindowKey>[];
  pillLabel: string;
}

/** The menu's key for a window: All time is the default, null. */
function keyOf(window: HistoryWindowKey): string | null {
  return window.kind === 'all' ? null : windowParam(window);
}

export function WindowSheet({ petId, current, rows, pillLabel }: Props) {
  const { options, byKey } = useMemo(() => {
    const map = new Map<string | null, HistoryWindowKey>();
    const opts: ScopeMenuOption[] = rows.map((row) => {
      const key = keyOf(row.value);
      map.set(key, row.value);
      return {
        key,
        label: row.label,
        count: row.count ?? undefined,
        detail: row.detail ?? undefined,
        section: row.section ?? undefined,
        accessibilityLabel: row.accessibilityLabel,
      };
    });
    return { options: opts, byKey: map };
  }, [rows]);

  return (
    <ScopeMenu
      key={petId}
      options={options}
      value={keyOf(current)}
      onChange={(key) => {
        const next = byKey.get(key);
        if (next) useHistoryScopeStore.getState().setWindow(petId, next);
      }}
      sheetLabel={WINDOW_SHEET_LABEL}
      accessibilityPrefix={WINDOW_PILL_PREFIX}
      pillLabel={pillLabel}
    />
  );
}
