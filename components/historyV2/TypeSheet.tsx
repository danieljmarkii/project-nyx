// The type pill and its sheet (History v2, HV-9 / CUL-1166; spec §3.8, H-5, H-9). Draws
// the rows `lib/historyControls.ts` builds on the shipped ScopeMenu; the rules (which
// rows, which counts, what they say) all live there.
//
// A pet switch closes the sheet: the menu is keyed on the pet, so the switch remounts it
// in the same render and no frame shows one pet's sheet over another's record (AC 13).
import { useMemo } from 'react';
import { ScopeMenu, type ScopeMenuOption } from '../ui/ScopeMenu';
import type { HistoryFilter } from '../../lib/historyDays';
import { TYPE_PILL_PREFIX, TYPE_SHEET_LABEL, type SheetRow, type TypePill } from '../../lib/historyControls';
import { filterId, useHistoryScopeStore } from '../../store/historyScopeStore';

interface Props {
  petId: string;
  /** The filter on screen. */
  filter: HistoryFilter;
  rows: readonly SheetRow<HistoryFilter>[];
  pill: TypePill;
}

/** The menu's key for a filter: All types is the default, null. */
function keyOf(filter: HistoryFilter): string | null {
  return filter.kind === 'all' ? null : filterId(filter);
}

export function TypeSheet({ petId, filter, rows, pill }: Props) {
  const { options, byKey } = useMemo(() => {
    const map = new Map<string | null, HistoryFilter>();
    const opts: ScopeMenuOption[] = rows.map((row) => {
      const key = keyOf(row.value);
      map.set(key, row.value);
      return {
        key,
        label: row.label,
        count: row.count ?? undefined,
        detail: row.detail ?? undefined,
        nested: row.nested || undefined,
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
      value={keyOf(filter)}
      onChange={(key) => {
        const next = byKey.get(key);
        if (next) useHistoryScopeStore.getState().setFilter(petId, next);
      }}
      sheetLabel={TYPE_SHEET_LABEL}
      accessibilityPrefix={TYPE_PILL_PREFIX}
      pillLabel={pill.label}
      pillCount={pill.count}
      pillAccessibilityLabel={pill.accessibilityLabel}
      openAtSelected
    />
  );
}
