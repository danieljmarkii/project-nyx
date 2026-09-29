// Supabase Edge Functions shared module — the vomit REPEAT RULE, stated once (Engines v3
// PR-26, CUL-1138).
//
// analyze-vomit raises `repeated_vomiting` on it (two vomits within 4 h, or three within
// 24 h, of the vomit being read; Dr. Chen, 2026-05-24). analyze-stool asks the same
// question under EN-7: "does the vomiting beside this stool meet the repeat rule on its
// own?", and keeps `concurrent_vomiting` when it does, whatever the stool looks like
// (Dr. Chen's pin on CUL-1138: until PR-28's every-vomit check exists, a stool read is the
// only place a photoless repeat vomit escalates from). Same values, same question, so one
// predicate (C-34): a threshold moved here moves both reads.
//
// PURE: no import, no clock. Times are parsed, never compared as text (C-40).

export const REPEAT_VOMIT_SHORT_WINDOW_HOURS = 4
export const REPEAT_VOMIT_SHORT_WINDOW_COUNT = 2
export const REPEAT_VOMIT_DAY_WINDOW_HOURS = 24
export const REPEAT_VOMIT_DAY_WINDOW_COUNT = 3

function hoursApart(aIso: string, bIso: string): number {
  return Math.abs(new Date(aIso).getTime() - new Date(bIso).getTime()) / 3_600_000
}

// The vomit read's rule, anchored at one vomit: `times` are the vomits the read can see
// (the anchor included when it is one of them), counted either side of the anchor.
export function meetsVomitRepeatRuleAt(times: readonly string[], anchorIso: string): boolean {
  const within = (hours: number) => times.filter((t) => hoursApart(t, anchorIso) <= hours).length
  return (
    within(REPEAT_VOMIT_SHORT_WINDOW_HOURS) >= REPEAT_VOMIT_SHORT_WINDOW_COUNT ||
    within(REPEAT_VOMIT_DAY_WINDOW_HOURS) >= REPEAT_VOMIT_DAY_WINDOW_COUNT
  )
}

// The stool's question: would ANY vomit in `anchors` be read as repeated, counting every
// vomit in `times` around it? `anchors` are the vomits inside the stool's concurrent window;
// `times` reach a day further back so an anchor near the window's edge still sees the
// vomits the vomit's own read would count.
export function anyVomitMeetsRepeatRule(times: readonly string[], anchors: readonly string[]): boolean {
  return anchors.some((anchor) => meetsVomitRepeatRuleAt(times, anchor))
}
