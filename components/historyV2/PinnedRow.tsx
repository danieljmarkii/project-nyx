// The pinned row — a placeholder slot (History v2, HV-1 / CUL-1158). HV-9 (CUL-1166)
// replaces this file: the pet's name, the type pill, the window pill and the search
// button, pinned at the top of the scroller, about 44pt (spec §3.1, §3.7–3.9).
//
// Its contract: no props. Everything the row shows and sets is scope state in
// `store/historyScopeStore.ts` (HV-3, spec §5.2) or the active pet (`store/petStore.ts`),
// so the composition root mounts it bare and HV-9 fills it without touching another
// lane's file.
export function PinnedRow(): null {
  return null;
}
