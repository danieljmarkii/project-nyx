// The commit beat's tone (CUL-1632, PM 2026-10-06).
//
// Its own module on purpose: constants/eventTypes.ts sits in generate-signal's import
// closure, so a predicate added there would redeploy the engine on merge for a rule only
// the app's completion beat reads (C-26: client-only code stays out of that closure).

import { SYMPTOM_TYPES, type EventTypeKey } from '../constants/eventTypes';
import type { MomentTone } from '../store/momentStore';
import { isGivenAssumed } from './medications';

/** The beat a commit of this type lands with: 'calm' (no gold, the soft tap) for every
 *  symptom and for `other`, 'celebrate' for the rest. What an owner logs under Other is
 *  often the worrying thing ("ate a sock"), and Principle 9 never rewards a symptom, so
 *  an unclassified log is acknowledged like one. It is NOT a symptom for any other
 *  purpose (tint, lanes, the report); only the beat asks this. stool_normal keeps the
 *  celebrate beat, because a normal stool is the good day in a diet trial. The one rule
 *  both commit paths ask (the log sheet and the full-screen /log flow), so the two
 *  cannot drift, and a leaf that joins SYMPTOM_TYPES is never celebrated. */
export function commitToneOf(type: EventTypeKey | null | undefined): MomentTone {
  return type != null && (SYMPTOM_TYPES.has(type) || type === 'other') ? 'calm' : 'celebrate';
}

/** The dose's gold (CUL-1691 §2.1): only a dose the owner asserted was given, with no
 *  double-dose conflict. It calls the same `isGivenAssumed` the card's prompt reads, so
 *  the mark and the sentence cannot disagree: an assumed `'given'` on an unrated combo is
 *  a card still asking "Did {pet} take it?", and gold there would answer for the owner.
 *  Calm is the never-wrong direction while the card asks a question. Here, not in
 *  `lib/medications.ts`, because that file is in `ask`'s and `generate-report`'s import
 *  closure (C-26): a change there would redeploy both for a rule only the card reads. */
export function doseCelebrates(params: {
  adherence: string | null;
  isCombo: boolean;
  vehicleIntake: string | null | undefined;
  doubleDose?: { conflict: boolean } | null;
}): boolean {
  return (
    params.adherence === 'given' &&
    !isGivenAssumed({ isCombo: params.isCombo, vehicleIntake: params.vehicleIntake, adherence: params.adherence }) &&
    !params.doubleDose?.conflict
  );
}
