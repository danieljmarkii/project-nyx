import type { VisitChannel } from './vetVisits';

// CUL-2766 — Vet contacts PR-04: the words of the logging door and its sheet (spec §4.1,
// §4.2; mock §A, §B). Pure, so every channel's title, Save label and footnote is pinned by
// a unit test rather than read off a rendered sheet.
//
// `isRemoteChannel` is PR-06's (`lib/vetContacts.ts`); the page's own footnote lives there too.
//
// The flag-off sheet never reaches this module: its words stay in `BookVisitSheet` as
// shipped, so turning the flag off is the absence of this file, not a second copy of it.

/** The renamed second button, in all three places (R7, R10). Never "from today". */
export const LOG_CONTACT_LABEL = 'Log a visit, call, text or email';

/** The chips, in the spec's order (R3). Text covers clinic apps and portal messages, and
 *  VoiceOver says so, because the visible word alone does not. */
export const CHANNEL_OPTIONS: ReadonlyArray<{ value: VisitChannel; label: string; spoken?: string }> = [
  { value: 'in_clinic', label: 'At the clinic' },
  { value: 'phone', label: 'Phone' },
  { value: 'text', label: 'Text', spoken: 'Text or clinic app' },
  { value: 'email', label: 'Email' },
];

/** The question the chips answer, on screen and as the radio group's label. */
export const CHANNEL_QUESTION = 'How did you hear from the vet?';

const TITLES: Record<VisitChannel, string> = {
  // Shipped, unchanged: the happened arm's title.
  in_clinic: 'A visit that happened',
  phone: 'A call with the vet',
  text: 'Texts from the vet',
  email: 'An email from the vet',
};

/** The noun the Save label owns: "Save Nyx’s call". */
const SAVE_NOUNS: Record<VisitChannel, string> = {
  in_clinic: 'visit',
  phone: 'call',
  text: 'texts',
  email: 'email',
};

export function contactSheetTitle(channel: VisitChannel): string {
  return TITLES[channel];
}

/**
 * The Save label (spec §4.2; mock B2). Unlit *Also about*: "Save Nyx’s call". One other pet
 * lit: "Save for Pixel and Juniper". Two or more: "Save for Pixel and 2 others", so the
 * button never grows past a line on a 320pt phone in a four-cat home.
 *
 * `alsoNames` are the OTHER pets' names, never the record's own.
 */
export function contactSaveLabel(channel: VisitChannel, petName: string, alsoNames: readonly string[]): string {
  if (alsoNames.length === 0) return `Save ${petName}’s ${SAVE_NOUNS[channel]}`;
  if (alsoNames.length === 1) return `Save for ${petName} and ${alsoNames[0]}`;
  return `Save for ${petName} and ${alsoNames.length} others`;
}

/**
 * What the save does elsewhere, in the tense it is true in (spec §4.2's table, verbatim).
 *
 * At the clinic keeps the shipped line: a visit really does move the report. A remote
 * contact says the opposite out loud, "No exam", because that is the one consequence an
 * owner would otherwise assume wrongly. Never "from today": the report's rung 1 is strictly
 * before today (§4.1 D2 of the visits spec).
 */
export function contactSheetFootnote(channel: VisitChannel, petName: string): string {
  switch (channel) {
    case 'in_clinic':
      return 'Your next vet report starts from this visit.';
    case 'phone':
      return `Goes on ${petName}’s vet report as a phone call. No exam.`;
    case 'text':
      return `Goes on ${petName}’s vet report as texts with the vet. No exam.`;
    case 'email':
      return `Goes on ${petName}’s vet report as an email. No exam.`;
  }
}

/**
 * The optional time, as the UTC instant `contacted_at` stores (C-10), composed from the
 * LOCAL day and the local wall-clock time the owner picked. Null when no time was set: the
 * record then holds the day only, and nothing invents a precision it does not have.
 */
export function composeContactedAt(day: Date, time: Date | null): string | null {
  if (!time) return null;
  const out = new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.getHours(), time.getMinutes(), 0, 0);
  return out.toISOString();
}
