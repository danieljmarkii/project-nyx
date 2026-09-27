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
// THE SAFETY FACES (PM rulings on CUL-1302, 2026-09-27: (a), then (a′) after the adversarial
// pass). Wherever the screen leads with its safety block, the row:
//   • draws NO BAR and NO END DATE (a) — a tidy "day 23 of 56 · ends Oct 29" with a filling
//     bar over a pet that may not be eating is the chart-under-a-safety-row the Signal/Home
//     spine forbids (S4);
//   • carries the screen's safety sentences, verbatim, as plain text on a rose rail: the fact
//     and the ask (a′, then "both", PM 2026-09-27 — the call-today lives in the SECOND
//     sentence, so the fact alone escalated without saying to call).
//     (a) assumed the ask stays on Home's Signal card. It does for an intake decline and does
//     NOT for a trial refusal: the Signal's detector cannot see a cat that refuses from day 1
//     (B-789), and Home's strip is silent on a refusal because the register lived on the Pet
//     tab's card (`resolveTrialStrip`). Without this line the trial screen would be the only
//     place outside Home's quiet strip that says anything is wrong.
// "Wherever the screen leads with its safety block" is decided the SCREEN's way, by the
// card's register lines (`trialSafetyLines(trialScreenCard(input))`), never by the state: an
// ended trial with a live decline carries them too, and so does its door. The sentence is the
// resolver's own (S2: layout, never meaning); the row writes no string about the record.
//
// Lives in `lib/` rather than the namespace: the flag-off guard wraps every namespace export
// into a component.

import { resolveTrialStrip, type TrialCardInput } from './dietTrialCard';
import {
  TRIAL_SCREEN_HEADER,
  trialEndPart,
  trialSafetyLines,
  trialScreenCard,
} from './trialScreenModel';

export interface TrialDoorRowModel {
  /** The eyebrow, "Diet trial". */
  eyebrow: string;
  /** The strip's header while active ("Rabbit trial · day 23 of 56"); the card's kicker on
   *  an ended trial ("Diet trial · finished"). */
  title: string;
  /** The screen's first two safety sentences (the fact, then the ask), verbatim, or null
   *  when the screen shows none. */
  alert: string[] | null;
  /** DAY progress in [0, 1], or null where the row draws no bar. */
  progressFraction: number | null;
  /** `{food} · ends {date}`, the food alone where the end is dropped, or null. */
  subline: string | null;
  /** The whole row's VoiceOver sentence. */
  accessibilityLabel: string;
}

/** How many of the screen's safety sentences the row carries: both, the fact and the ask
 *  (PM, 2026-09-27). The registers write two; a third, were one ever added, stays on the
 *  screen. */
const DOOR_ALERT_LINES = 2;

/** Null when there is no trial to open (the start card stays), else the one row. */
export function buildTrialDoorRow(input: TrialCardInput | null): TrialDoorRowModel | null {
  if (!input?.trial) return null;
  const card = trialScreenCard(input);
  if (card.state === 'no_trial') return null;
  const strip = resolveTrialStrip(input);
  const safetyLines = trialSafetyLines(card);
  const safety = safetyLines.length > 0;
  const alert = safety ? safetyLines.slice(0, DOOR_ALERT_LINES) : null;

  const title = strip?.header ?? card.kicker;
  const progressFraction = safety ? null : card.progressFraction;

  const parts: string[] = [];
  if (card.foodLabel) parts.push(card.foodLabel);
  // An ended trial carries its date range instead (the screen's sub-line, §3.1).
  if ((card.state === 'completed' || card.state === 'abandoned') && card.dayLine) parts.push(card.dayLine);
  const end = safety ? null : trialEndPart(input, card.state);
  if (end !== null) parts.push(end);
  const subline = parts.length > 0 ? parts.join(' · ') : null;

  return {
    eyebrow: TRIAL_SCREEN_HEADER,
    title,
    alert,
    progressFraction,
    subline,
    // Each alert line is its own sentence and already ends in a full stop.
    accessibilityLabel: [title, ...(alert ?? []).map((l) => l.replace(/\.$/, '')), subline, 'Open the diet trial.']
      .filter(Boolean)
      .join('. '),
  };
}
