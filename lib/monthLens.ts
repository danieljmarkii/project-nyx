// The month's SYMPTOM LENS (CUL-1553 · GC-7 item 1, "the trial's sign"). Flag-on Patterns
// drew vomiting only, so a diet-trial dog whose sign is itching had no symptom surface on
// the page GA keeps (CUL-1074 brief 1; the critique's PMD-6). The lens puts every symptom
// the read holds on offer and opens the month on the one with the most days in the whole
// nine-week read, vomiting on a tie (PM, 2026-10-04; the scope amended by CUL-1557 ruling
// 2b → CUL-1565): the itchy dog lands on itching without a stored "trial symptom", which
// `diet_trials` does not have — and still lands on it on the 1st of a month, or in a month
// the trial is working and no itching is logged, where a month-scoped key opened on
// vomiting, a symptom he may never have had.
//
// ── TWO COUNTING RULES, NAMED ──────────────────────────────────────────────────
// Vomiting keeps the engine's re-log collapse (`episodeDaysOf`) and the days a bout
// continues into (CUL-1226 / CUL-1530): its days are the rose days. Every other symptom
// is counted in ENTRIES, one per row, and its days are the days holding one. The words
// follow: "Vomiting 3 times" counts episodes, "Itching 3 times" counts entries.
//
// ── WHICH SYMPTOMS ARE ON OFFER ───────────────────────────────────────────────
// Every `SYMPTOM_EVENT_TYPES` member with at least one entry in the read, so the row is
// this pet's record: an itch-only dog is never offered a symptom it has never had (the
// product read on CUL-1553). Vomiting stands in when nothing else is on offer, so an
// empty record and a vomit-only one keep the shipped month and draw no row.
// The read spans the nine weeks of bars and the whole grid, so a symptom drawn on a bar
// is always one the reader can choose. The order is the default's: most days in the read
// first, vomiting first among equals, then the list's own order — a total order, so the
// same record always opens on the same lens.
//
// ── TWO NUMBERS, KEPT APART (C-3) ─────────────────────────────────────────────
// `days` is the shown month's: its own ARRIVED days (the first through `lastDrawnKey`),
// the population the line speaks and the count the symptom menu prints beside each lens.
// `readDays` is the whole read's and only ORDERS the list; it is never spoken, because
// nine weeks of days printed beside a month would be a month claim the month does not
// hold. Pure: no database, no clock.

import { SYMPTOM_EVENT_TYPES } from './analytics';
import type { MonthContinuationDay } from './monthModel';

export const VOMIT_LENS = 'vomit';

export interface SymptomLensInput {
  /** The shown month's first day and its last ARRIVED day, as keys. */
  firstKey: string;
  lastDrawnKey: string;
  episodeDays: readonly string[];
  continuationDays?: readonly MonthContinuationDay[];
  /** Every symptom but vomit, one entry per row (`MonthFacts.symptomEntryDays`). */
  symptomEntryDays?: Readonly<Record<string, readonly string[]>>;
}

export interface SymptomLens {
  /** The event type. */
  type: string;
  /** Days holding the symptom among the shown month's arrived days — the number shown. */
  days: number;
  /** Days holding the symptom anywhere in the read — the sort key, never shown. */
  readDays: number;
}

/** The lenses on offer, the default first. Never empty: vomiting stands in for an empty read. */
export function symptomLenses(input: SymptomLensInput): SymptomLens[] {
  const inMonth = (k: string) => k >= input.firstKey && k <= input.lastDrawnKey;
  const vomitRead = new Set<string>([...input.episodeDays, ...(input.continuationDays ?? []).map((c) => c.day)]);
  const lenses: SymptomLens[] =
    vomitRead.size > 0 ? [{ type: VOMIT_LENS, days: [...vomitRead].filter(inMonth).length, readDays: vomitRead.size }] : [];
  const entries = input.symptomEntryDays ?? {};
  for (const type of SYMPTOM_EVENT_TYPES) {
    if (type === VOMIT_LENS) continue;
    const rows = entries[type];
    if (!rows || rows.length === 0) continue;
    const read = new Set(rows);
    lenses.push({ type, days: [...read].filter(inMonth).length, readDays: read.size });
  }
  if (lenses.length === 0) lenses.push({ type: VOMIT_LENS, days: 0, readDays: 0 });
  const order = (t: string) => SYMPTOM_EVENT_TYPES.indexOf(t as (typeof SYMPTOM_EVENT_TYPES)[number]);
  return lenses.sort((a, b) => b.readDays - a.readDays || order(a.type) - order(b.type));
}

/** The lens the month draws: the owner's choice while it is on offer, else the default. */
export function resolveLens(lenses: readonly SymptomLens[], chosen: string | null): string {
  if (chosen != null && lenses.some((l) => l.type === chosen)) return chosen;
  return lenses[0]?.type ?? VOMIT_LENS;
}

/** The day list the model counts for a lens: episodes for vomiting, entries otherwise. */
export function lensEpisodeDays(
  type: string,
  facts: { episodeDays: readonly string[]; symptomEntryDays?: Readonly<Record<string, readonly string[]>> },
): readonly string[] {
  return type === VOMIT_LENS ? facts.episodeDays : (facts.symptomEntryDays?.[type] ?? []);
}
