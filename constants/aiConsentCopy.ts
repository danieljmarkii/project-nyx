// Every string the AI consent asks and Settings show (CUL-1834), verbatim from mock
// round 4 (`docs/culprit-ai-consent-mockups.html`, approved by the PM 2026-10-12).
// The owner answers THESE words, and `AI_CONSENT_COPY_VERSION` (lib/aiConsent.ts)
// names them on every row: change a string's meaning here and bump that version in
// the same commit.
//
// Panel 1 (CUL-1833) shaped three rules every ask keeps, and each is pinned in
// aiConsentCopy.test.ts: the read "can't tell you {pet} is fine" (no ask promises a
// verdict the engine never gives); every ask carries a "Without it" line naming what
// still works; Claude and Anthropic are named at every ask and in Settings.
//
// The pet's name: the mock draws one pet's name and falls back to "your pet" (frame
// L). Consent covers the account, not a pet, so a multi-pet account gets the
// fallback rather than one pet named as if the answer were about it alone.

import { MONTHS } from '../lib/utils';

export interface ConsentBenefit {
  title: string;
  detail: string;
}

/** The name the copy speaks, or null for the "your pet" fallback. */
export function consentPetName(petNames: readonly string[]): string | null {
  const named = petNames.map((n) => n.trim()).filter((n) => n.length > 0);
  return named.length === 1 ? named[0] : null;
}

const petOf = (pet: string | null): string => (pet ? `${pet}'s` : "your pet's");
const PetOf = (pet: string | null): string => (pet ? `${pet}'s` : "Your pet's");
const petIs = (pet: string | null): string => (pet ? pet : 'your pet');

export const AI_NAMED = 'Claude, an AI made by Anthropic';
export const WHATS_SENT_LINK = "What's sent";

// ── The permission sheet (frames A and C) ──

export type ConsentDoor = 'label' | 'ask';

export interface ConsentSheetCopy {
  headline: string;
  benefits: ConsentBenefit[];
  /** The disclosure, split around the bolded recipient. */
  disclosureBefore: string;
  disclosureAfter: string;
  without: string;
  notNow: string;
}

export function readBenefit(pet: string | null): ConsentBenefit {
  return {
    title: `A read on ${petOf(pet)} photos`,
    detail: `Says what's in a vomit or stool photo and points out some signs to call your vet about. It can't tell you ${petIs(pet)} is fine.`,
  };
}

export function consentSheetCopy(door: ConsentDoor, pet: string | null): ConsentSheetCopy {
  if (door === 'ask') {
    return {
      headline: `Ask about ${petOf(pet)} record`,
      benefits: [
        {
          title: 'Answers from what you logged',
          detail: `Meals, symptoms and dates, pulled together for you. It isn't a vet, and it can't tell you ${petIs(pet)} is fine.`,
        },
        {
          title: 'Labels filled in, photos read',
          detail: 'The same answer turns these on too.',
        },
      ],
      disclosureBefore: `To do this, Culprit sends your question and the parts of ${petOf(pet)} record it needs to `,
      disclosureAfter: ', along with label and symptom photos, and the patterns it spots so Home can describe them. Anthropic never trains its AI on them. Change it in Settings.',
      without: 'Without it, Ask stays closed and photos aren\'t read. Checks that need no photo, like repeated vomiting, still work.',
      notNow: 'Not now',
    };
  }
  return {
    headline: 'Snap the label, skip the typing',
    benefits: [
      {
        title: 'Foods and medicines filled in',
        detail: 'Name, brand, ingredients or dose, read from the photo.',
      },
      readBenefit(pet),
    ],
    disclosureBefore: 'To do this, Culprit sends these photos to ',
    disclosureAfter: `. It also sends ${petOf(pet)} name with the patterns Culprit spots, so Home can describe them in a sentence. Anthropic never trains its AI on any of it. One answer covers all of this; change it in Settings.`,
    without: `Without it, you type labels in and ${pet ? `${pet}'s photos` : 'photos'} are kept but not read. Checks that need no photo, like repeated vomiting, still work.`,
    notNow: 'Not now, I\'ll type it in',
  };
}

export const ALLOW_LABEL = 'Allow';
export const DONT_ALLOW_LABEL = 'Don\'t allow';
export const CONSENT_WRITE_FAILED = 'That didn\'t save. Check your connection and try again.';

// When a door can't read the owner's answer it sends nothing (CUL-1933) and says so.
// Not words the owner answers, so they change no copy version. The label door's
// pair is the one food detail's retry already shows (`RETRY_TRANSPORT_NOTICE`), so
// the owner meets one sentence for one situation.
export interface ConsentUnreadableNotice {
  title: string;
  body: string;
}

export function consentUnreadableNotice(door: ConsentDoor): ConsentUnreadableNotice {
  if (door === 'ask') {
    return { title: 'Couldn\'t send your question', body: 'It\'s still here. Try again in a moment.' };
  }
  return { title: 'Couldn\'t start reading the label', body: 'Try again in a moment.' };
}

// ── What's sent (frame B) ──

export interface WhatsSentSection {
  title: string;
  body: string;
}

export const WHATS_SENT_TITLE = 'What\'s sent if you allow';
export const WHATS_SENT_DONE = 'Done';
export const PRIVACY_POLICY_LINK = 'Privacy policy';

export function whatsSentSections(pet: string | null): WhatsSentSection[] {
  return [
    {
      title: 'Vomit and stool photos',
      body: 'Sent when you log one with a photo, or when you next open its record if that send didn\'t finish. A photo logged while AI reading was off is sent only if you tap Read this photo.',
    },
    {
      title: 'Food package and prescription label photos',
      body: 'Sent when you add a food or medicine by photo. A prescription label can show your name, your clinic and an Rx number.',
    },
    {
      title: `${PetOf(pet)} patterns`,
      body: `${PetOf(pet)} name with the symptom, food and counts in a pattern. Your full log and your photos are never sent for this.`,
    },
    {
      title: 'Ask, where it\'s turned on',
      body: `Your question and the parts of ${petOf(pet)} record it needs.`,
    },
    {
      title: 'At Anthropic',
      body: 'Kept only for a short time, to check for misuse. Never used to train AI.',
    },
    {
      title: 'If you don\'t allow',
      body: 'Nothing is sent. You type foods and medicines in, photos are kept but not read, and patterns on Home use simpler wording. Checks that need no photo, like repeated vomiting, still work and can tell you to call your vet.',
    },
  ];
}

// ── Settings (frames I to L) ──

export const SETTINGS_ROW_LABEL = 'AI reading';
export const SETTINGS_ROW_SUBLABEL = 'Photos, labels and patterns';
export const SETTINGS_SCREEN_TITLE = 'AI reading';
export const SETTINGS_VALUE_ON = 'On';
export const SETTINGS_VALUE_OFF = 'Off';
export const SETTINGS_VALUE_NOT_SET = 'Not set';
export const SETTINGS_READ_FAILED = 'Couldn\'t load your AI reading setting.';
export const SETTINGS_RETRY = 'Try again';

export const LABEL_BENEFIT_SETTINGS: ConsentBenefit = {
  title: 'Labels filled in for you',
  detail: 'Snap a food or medicine and skip the typing.',
};

// Where Ask is on for the account, Settings names it, since the one switch governs
// it too (panel 1's consistency audit, condition 3). The title is frame C's
// headline and the detail frame C's first benefit, so no new claim is introduced.
export function askBenefitSettings(pet: string | null): ConsentBenefit {
  return {
    title: `Ask about ${petOf(pet)} record`,
    detail: `Answers from what you logged. It isn't a vet, and it can't tell you ${petIs(pet)} is fine.`,
  };
}

/** The disclosure on J and L, and on K behind "When AI reading is on, ". */
export function settingsDisclosure(pet: string | null, askOn: boolean, off: boolean): string {
  const base = `Culprit sends these photos to ${AI_NAMED}, plus ${petOf(pet)} name with the patterns it spots, so Home can describe them in a sentence.`;
  const ask = askOn ? ` Ask sends your question and the parts of ${petOf(pet)} record it needs.` : '';
  const text = `${base}${ask} Anthropic never trains its AI on any of it.`;
  // "Culprit" leads the sentence and is a name, so it keeps its capital after the clause.
  return off ? `When AI reading is on, ${text}` : text;
}

/** "On since 14 Oct 2026." from the server's decided_at, in local time. */
export function onSinceLine(decidedAtIso: string): string {
  const d = new Date(decidedAtIso);
  if (Number.isNaN(d.getTime())) return 'On.';
  return `On since ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}.`;
}

export function offLine(pet: string | null, askOn: boolean): string {
  const ask = askOn ? ' Ask stays closed.' : '';
  return `Off. Nothing is sent. You type labels in, ${pet ? `${pet}'s photos` : 'photos'} are kept but not read, and patterns on Home use simpler wording.${ask} Checks that need no photo still work and can tell you to call your vet.`;
}

export const READS_STAY_LINE = 'Reads that already ran stay on their records.';

export const SETTINGS_WITHOUT = 'Without it, you type labels in and photos are kept but not read. Checks that need no photo, like repeated vomiting, still work.';

// ── The vomit and stool record (frames D0, D, E, F, G, H; CUL-1835) ──
//
// Here the pet is the RECORD's pet (C-9), never `consentPetName`: the card sits on one
// animal's record and speaks about that animal's photo. The account-wide clause
// ("{pet}'s name with the patterns") names the same pet, as the mock draws it.
//
// The vet line rides every state that isn't a read (mock §3), so a photo that wasn't
// read never looks like a photo that was checked. Vomit names three things (keeps
// vomiting, something unusual, seems unwell) and never blood alone (PM, 2026-10-12);
// stool stays event neutral, because the same line renders over a normal stool.

export type RecordKind = 'vomit' | 'stool';

export const RECORD_ASK_TITLE = 'Want a read of this photo?';
export const RECORD_OFF_HEADING = 'AI reading is off';
export const RECORD_OFF_LINK = 'Turn on AI reading';
export const RECORD_UNREAD_HEADING = 'The photo wasn\'t read';
export const RECORD_NOT_READ_YET_HEADING = 'Not read yet';
export const RECORD_NOT_READ_YET_BODY = 'This photo was logged while AI reading was off. It goes to Claude only if you tap below.';
export const RECORD_READ_THIS_PHOTO = 'Read this photo';
export const RECORD_NOT_NOW = 'Not now';
export const RECORD_TRY_AGAIN = 'Try again';
// D0: the completion card offers the read and never asks the question itself.
export const COMPLETION_READ_OFFER = 'Photo saved. Want an AI to describe it?';
export const COMPLETION_READ_OPEN = 'Open';

export interface RecordAskCopy {
  title: string;
  body: string;
  disclosure: string;
  without: string;
  vetLine: string;
}

/** The record's unread frame when the photo never reached a read (CUL-820, ruled B on the
 *  event detail round, CUL-1907). It names no cause: the same branch catches an unsynced
 *  photo, a watch that gave up and a read that was never asked for, and telling an owner on
 *  Wi-Fi to wait for signal would delay the retry that fixes it. */
export function recordUnreadRetryBody(pet: string | null): string {
  return `This photo hasn't been read yet. It's saved on ${petOf(pet)} record, and Try again sends it now.`;
}

/** The "when to call" line, on its own (frames F and H). */
export function recordVetLine(kind: RecordKind, pet: string | null): string {
  return kind === 'vomit'
    ? `If ${petIs(pet)} keeps vomiting, brings up something unusual, or seems unwell, call your vet.`
    : `If ${petOf(pet)} stool stays unusual, has something odd in it, or ${petIs(pet)} seems unwell, call your vet.`;
}

/** Frames D (vomit) and E (stool). */
export function recordAskCopy(kind: RecordKind, pet: string | null): RecordAskCopy {
  const check = kind === 'vomit' ? 'repeated vomiting' : 'repeated loose stool';
  const vet = recordVetLine(kind, pet);
  return {
    title: RECORD_ASK_TITLE,
    body: `Claude, an AI, can say what's in ${petOf(pet)} photo and point out some signs to call your vet about. It isn't a vet, and it can't tell you ${petIs(pet)} is fine.`,
    disclosure: `Claude is made by Anthropic, which never trains its AI on any of it. Allowing also covers food and medicine label photos, and ${petOf(pet)} name with the patterns Culprit spots. Change it any time in Settings.`,
    without: `Without it, the photo is kept but not read. Checks that need no photo, like ${check}, still work.`,
    // "Whatever you choose, if …": the vet line holds whatever the answer (round 4).
    vetLine: `Whatever you choose, ${vet.charAt(0).toLowerCase()}${vet.slice(1)}`,
  };
}

/** Frame F's body. */
export function recordOffBody(pet: string | null): string {
  return `${PetOf(pet)} photo is saved but wasn't read. If you turn AI reading on, you can send this photo to Claude, an AI, for a read.`;
}

/** The ask card's vet line under a call (frame G, unanswered). The card's own line is
 *  conditional ("if {pet} keeps vomiting…"), and under an unconditional call that reads as
 *  "call only if it goes on"; this one backs the log, as G's off line does. */
export function recordAskVetLineBesideCall(pet: string | null): string {
  return `Whatever you choose, ${petOf(pet)} log alone is reason to call your vet.`;
}

/** Frame G's off line, under a warning: it backs the log and offers no link. */
export function recordOffBesideCall(pet: string | null): string {
  return `AI reading is off. ${PetOf(pet)} log alone is reason to call your vet.`;
}
