// The overrun phrase for a diet trial's day counter: "day 35 — 7 days past", never
// "day 35 of 28" (diet-trial spec §4.2 state 6; CUL-254 fixed the card, CUL-1181 the
// Foods tab).
//
// ONE WORDING, ONE HOME. The phrase was restated inline on the trial card's Home
// strip (`lib/dietTrialCard.ts` `resolveTrialStrip`), the med strip and the day
// summary, and the Foods tab never got it at all — so the Foods tab read "day 35 of
// 28" one tap from a card reading "day 35 — 7 days past". The Foods surfaces import
// it from here; `lib/trialOverrun.test.ts` pins it to the Home strip's own output,
// so the two cannot drift while the card still builds its header inline. Moving the
// card and the other copies onto this import is the Backlog follow-up named on
// CUL-1181.
//
// PURE and lower-case: each caller decides its own capitalisation and what leads.

/** Days past the target, or 0 when there is no target or it is not yet passed. */
export function trialOverrunDays(dayCounter: number, targetDays: number): number {
  if (!(targetDays > 0)) return 0;
  return Math.max(0, dayCounter - targetDays);
}

/**
 * The day clause a trial surface prints after its identity:
 *
 *   • no target            → `day 12`
 *   • within the window    → `day 12 of 28` (the target day itself reads `day 28 of 28`)
 *   • past the window      → `day 35 — 7 days past` (`1 day past` singular)
 *
 * Past the window the fraction is never printed: "35 of 28" reads as a counting
 * mistake, and the number an owner needs then is how far past it is.
 */
export function trialDayClause(dayCounter: number, targetDays: number): string {
  if (!(targetDays > 0)) return `day ${dayCounter}`;
  const past = trialOverrunDays(dayCounter, targetDays);
  if (past > 0) return `day ${dayCounter} — ${past} ${past === 1 ? 'day' : 'days'} past`;
  return `day ${dayCounter} of ${targetDays}`;
}
