// What food detail's "Try again" / "Re-run AI extraction" tells the owner once the call
// has answered (CUL-769). Pure: the screen hands in the invoke's outcome and the cached
// consent, and gets back the alert to show, or null when the server's row says it all.
//
// The retry never writes 'pending' to the server (the header of `handleRetry`), so every
// outcome here leaves the server row at the status it already held; the screen re-reads
// it after the call. What varies is only what the owner is told:
//  - a transport fault: the call never reached the function, so "try again" is honest;
//  - the cap: the shipped cap copy, which names when reading resumes;
//  - `feature_disabled` under a recorded no: AI reading is off, and where to turn it on;
//  - `feature_disabled` otherwise: the flag is off, so nothing to do but type it in.
// Each says the label was not read: a retry that returns quietly would read as one that
// ran (the silence CUL-769's comments name).

import { foodCapCopy } from '../constants/monetizationCopy';
import type { AiConsentRow } from './aiConsent';
import type { GateResponse } from './appConfig';

export interface RetryNotice {
  title: string;
  body: string;
}

export const RETRY_TRANSPORT_NOTICE: RetryNotice = {
  title: "Couldn't start reading the label",
  body: 'Try again in a moment.',
};

export const RETRY_CAP_TITLE = 'Label reading is paused';

export const RETRY_READING_OFF_NOTICE: RetryNotice = {
  title: 'AI reading is off',
  body: "The label wasn't read. You can type the ingredients in yourself, or turn AI reading on in Settings.",
};

export const RETRY_UNAVAILABLE_NOTICE: RetryNotice = {
  title: "Label reading isn't available right now",
  body: "The label wasn't read. You can type the ingredients in yourself.",
};

export type RetryOutcome =
  | { kind: 'transport_error' }
  | { kind: 'answered'; gate: GateResponse };

export function retryNoticeOf(outcome: RetryOutcome, consent: AiConsentRow | null | undefined): RetryNotice | null {
  if (outcome.kind === 'transport_error') return RETRY_TRANSPORT_NOTICE;
  const { gate } = outcome;
  if (gate.kind === 'cap_reached') return { title: RETRY_CAP_TITLE, body: foodCapCopy(gate.cap) };
  if (gate.kind === 'feature_disabled') {
    // The server answers a declined owner and a flag that is off with the same shape, so
    // the phone's copy of the answer tells them apart. Only a recorded no names the
    // setting: an unknown answer gets the line that is true either way.
    return consent?.granted === false ? RETRY_READING_OFF_NOTICE : RETRY_UNAVAILABLE_NOTICE;
  }
  return null;
}
