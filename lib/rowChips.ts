// The chip tones of the shared day row (History v2, HV-6 / CUL-1163; spec §3.6): which ink
// a meal's intake chip and a dose's adherence chip take. Pure and import-free, so the row
// component (`components/dayRow/`) and the pipeline (`lib/spineNode.ts`, the dose row's
// vehicle phrase) share one rule without the row pulling `lib/dayEvents.ts`'s import graph,
// which reaches the Supabase client.

/** A chip's ink on the shared day row. */
export type RowChipTone = 'ok' | 'mid' | 'attn';

/**
 * A meal's intake chip tone (§3.6): All and Most in teal, Some in grey, Picked at and
 * Refused in rose. Three tiers where History v1's `IntakeBadge` draws two, on purpose and
 * by the round-5 ruling: Some is not finished (it breaks a run and the day header names
 * it) and it is not a concern either, so it is neither the teal of a finished bowl nor the
 * rose of a refusal. An unknown rating fails toward the rose, never toward teal.
 */
export function intakeChipTone(rating: string): RowChipTone {
  if (rating === 'all' || rating === 'most') return 'ok';
  if (rating === 'some') return 'mid';
  return 'attn';
}

/** A dose's adherence chip tone: Given in teal; Partial, Missed and Refused in rose (the
 *  shipped chips' own recolour, `AdherenceChipRow`, GAP-2). */
export function adherenceChipTone(adherence: 'given' | 'partial' | 'missed' | 'refused'): RowChipTone {
  return adherence === 'given' ? 'ok' : 'attn';
}
