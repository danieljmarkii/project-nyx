// The Pet tab's door to the trial's own screen (TS-6 · CUL-1302; `docs/nyx-trial-screen-requirements.md`
// §5.2, R-3, S8). Pure: `components/trialScreen/TrialDoorRow.tsx` draws this and decides nothing.
//
// Under `trial_screen`, while a trial is active or inside its 30-day grace, the Pet tab's
// trial slot is ONE ROW that opens `/trial/{pet}`: the *Diet trial* eyebrow, the strip's
// header, the day bar, `{food} · ends {date}`, a chevron, no buttons (S8: every lifecycle
// action lives on the screen, and the Pet tab carries a door, never a second set). With no
// trial, the start card is unchanged, so this returns null and the Pet tab keeps the card.
//
// A LAYOUT, NEVER A MEANING (S2). The title is the strip's header (`resolveTrialStrip`),
// or the card's kicker where no strip exists (an ended trial), the screen's own rule (§3.1).
// The bar is the card's `progressFraction`, DAY progress and nothing else (R2). The end
// clause is the screen's (`trialEndPart`), so the door and the screen agree on when a trial
// ends and on when to stop saying so.
//
// THE SAFETY FACES (PM ruling on CUL-1302, 2026-09-27, option (a)). On an intake decline or
// a trial refusal the row draws NO BAR and NO END DATE: a tidy "day 23 of 56 · ends Oct 29"
// with a filling bar over a pet that may not be eating is the chart-under-a-safety-row the
// Signal/Home spine forbids (S4). The ask itself stays on Home's Signal card and on the
// screen, one tap away; the row adds no string of its own.
//
// Lives in `lib/` rather than the namespace: the flag-off guard wraps every namespace export
// into a component.

import {
  resolveTrialCard,
  resolveTrialStrip,
  type TrialCardInput,
  type TrialCardState,
} from './dietTrialCard';
import { TRIAL_SCREEN_HEADER, trialEndPart } from './trialScreenModel';

export interface TrialDoorRowModel {
  /** The eyebrow, "Diet trial". */
  eyebrow: string;
  /** The strip's header while active ("Rabbit trial · day 23 of 56"); the card's kicker on
   *  an ended trial ("Diet trial · finished"). */
  title: string;
  /** DAY progress in [0, 1], or null where the row draws no bar. */
  progressFraction: number | null;
  /** `{food} · ends {date}`, the food alone where the end is dropped, or null. */
  subline: string | null;
  /** The whole row's VoiceOver sentence. */
  accessibilityLabel: string;
}

const SAFETY_STATES: ReadonlySet<TrialCardState> = new Set(['intake_decline', 'trial_refusal']);

/** Null when there is no trial to open (the start card stays), else the one row. */
export function buildTrialDoorRow(input: TrialCardInput | null): TrialDoorRowModel | null {
  if (!input?.trial) return null;
  const card = resolveTrialCard(input);
  if (card.state === 'no_trial') return null;
  const strip = resolveTrialStrip(input);
  const safety = SAFETY_STATES.has(card.state);

  const title = strip?.header ?? card.kicker;
  const progressFraction = safety ? null : card.progressFraction;

  const parts: string[] = [];
  if (card.foodLabel) parts.push(card.foodLabel);
  // An ended trial carries its date range instead (the screen's sub-line, §3.1).
  if ((card.state === 'completed' || card.state === 'abandoned') && card.dayLine) parts.push(card.dayLine);
  const end = trialEndPart(input, card.state);
  if (end !== null) parts.push(end);
  const subline = parts.length > 0 ? parts.join(' · ') : null;

  return {
    eyebrow: TRIAL_SCREEN_HEADER,
    title,
    progressFraction,
    subline,
    accessibilityLabel: [title, subline, 'Open the diet trial.'].filter(Boolean).join('. '),
  };
}
