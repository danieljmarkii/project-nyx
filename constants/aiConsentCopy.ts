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
