// The list — a placeholder slot (History v2, HV-1 / CUL-1158). HV-7 (CUL-1164) replaces
// this file: a SectionList of whole local days with sticky day headers, the count line
// and the bowl's line in its header, and the WeekStrip slot (HV-8) mounted there
// (spec §3.1–3.5, §3.12).
//
// Its contract: no props. It reads the scope from `store/historyScopeStore.ts` (HV-3)
// and pages the record through `readDayPage` (HV-4, spec §5.2); every row is drawn from
// `buildDayNodes` (`lib/dayNodes.ts`) through the shared `<DayNodeRow node>`
// (`components/dayRow/`), never re-derived here (spec §5.5, R-3).
export function HistoryList(): null {
  return null;
}
