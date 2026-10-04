import { createContext, useContext } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

// What a day row may SAY aloud on its own, and for whom (CUL-1224, BRK-28).
//
// A row's read can land while nobody asked: the analysis chain finishes, the rose
// arrives, and the row used to announce it from wherever it was mounted, Home or not,
// with the verdict alone ("Call your vet now": whose? which row?). So the row now asks
// the screen it sits on. A screen that wants its rows to speak provides this context,
// with the record's pet name and a live check of whether it is the screen in front of the
// owner; without a provider a row says nothing on its own (its label still carries the
// read when focused). Today only Home provides it, the issue's "only on a focused Home".
//
// A context, not a prop: the row sits three components below the screen (TodayCard →
// Spine → DayNodeRow → SpineEventRow), past the two-level drilling limit.

export interface RowSpeech {
  /** The pet whose record the rows are (C-9: the record's pet, never a guess). */
  petName: string | null;
  /** Asked at the moment of speaking, never cached: is this screen focused and the app
   *  in front? */
  mayAnnounce: () => boolean;
}

const SILENT: RowSpeech = { petName: null, mayAnnounce: () => false };

export const RowSpeechContext = createContext<RowSpeech>(SILENT);

export function useRowSpeech(): RowSpeech {
  return useContext(RowSpeechContext);
}

/** The landed read, spoken with its subject: whose, which row, then the verdict. */
export function readLandedSpoken(params: { petName: string | null; title: string; time: string; verdict: string }): string {
  const { petName, title, time, verdict } = params;
  const name = petName?.trim();
  const subject = name ? `${name}’s ${title.toLowerCase()}` : title;
  return `${subject} at ${time}, photo read: ${verdict}.`;
}

/**
 * Say it once, after whatever VoiceOver is already reading (queued, not interrupting),
 * on both platforms: the row carries no live region, so nothing else speaks it.
 */
export function announceQueued(message: string): void {
  if (Platform.OS === 'ios' && typeof AccessibilityInfo.announceForAccessibilityWithOptions === 'function') {
    AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
    return;
  }
  AccessibilityInfo.announceForAccessibility(message);
}
