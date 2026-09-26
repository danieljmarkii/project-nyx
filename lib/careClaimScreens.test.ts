// CUL-1271 — the two care-claim screens, both directions.
//
// BLOCKED: the seven sentences the CUL-1268 critique reproduced passing every Ask screen at
// ffacb4e, plus a delegation set and an attribution set a model plausibly writes once EN-9 /
// EN-10 hand it a visit, a drug and a since-count. PASSED: the honest form of the same facts
// (a dated fact beside a count) and the question forms an owner may tap as a follow-up chip.
// Each arm is proven by mutation in the PR (delete it → its fixtures red), per C-18.

import {
  DELEGATION_RE,
  TREATMENT_ATTRIBUTION_RE,
  careClaimReason,
} from './careClaimScreens';

// The critique's reproduced seven (CUL-1271 description, verbatim).
const REPRODUCED: [string, 'delegation' | 'treatment_attribution'][] = [
  ['Her vomiting is under control since the Sep 16 visit.', 'delegation'],
  ['Your vet has it covered.', 'delegation'],
  ['There is nothing more to do about the vomiting.', 'delegation'],
  ["The prednisone seems to be helping Nyx's cough.", 'treatment_attribution'],
  ["Her cough has settled since the prednisone started.", 'treatment_attribution'],
  ['The prednisone is working.', 'treatment_attribution'],
  ["Her vomiting is in the vet's hands now, with 4 episodes since.", 'delegation'],
];

const DELEGATION = [
  "Your vet's got it covered.",
  'Your vet’s got this handled.',
  'The vet has things in hand.',
  'Nyx is in good hands.',
  "It's in your vet’s hands now.",
  'The vet is on it.',
  'Her vomiting has been taken care of.',
  'The cough has been dealt with at the Sep 16 visit.',
  "Nyx's itching is being managed.",
  'Her weight loss is well-managed.',
  'The vomiting has resolved.',
  'Her diarrhea has cleared up since the visit.',
  'That episode is behind her now.',
  'The vomiting is no longer a concern.',
  'Her cough is in check.',
  'The prednisone is keeping it at bay.',
  "There's nothing else you need to do.",
  'Nothing further needed until the recheck.',
  'No need to call the vet about it.',
  'No need for another visit.',
];

const ATTRIBUTION = [
  'The prednisone is helping.',
  'The new food seems to be working for her.',
  "The antibiotics are doing the trick.",
  "The meds must be kicking in.",
  "It's taking effect.",
  'The diet has been paying off.',
  'The prednisone has helped her cough.',
  'The new food worked.',
  "The trial diet made a difference.",
  'Her itching has calmed down since the switch.',
  'The vomiting eased off after the prednisone started.',
  'Her cough has let up since the visit.',
  'She is doing better thanks to the prednisone.',
  'She is responding well to the treatment.',
  'Nyx is responding to the prednisone.',
  'She responded to the new diet within a week.',
  'The prednisone helped.',
  'The prednisone appears to be effective.',
];

// The honest form: dated facts beside counts, the escalations the Signal already ships, and
// the question forms an owner taps. None may be blocked.
const HONEST = [
  'Nyx has vomited 4 times since the Sep 16 visit.',
  'Your vet saw Nyx on Sep 16. 4 vomiting episodes are logged since that visit.',
  'Prednisone started on Sep 10. 3 coughing episodes are logged since then.',
  'Nyx is on prednisone: 12 doses logged, 2 not fully taken, since Sep 10.',
  'Nyx has had recurring vomiting since June — worth a look.',
  "The Signal has a safety flag up for Nyx right now — open Home to see it, and your vet is the best call if you're worried.",
  "Nyx has eaten less on 5 of the last 7 days — worth a word with your vet if it carries on.",
  'Nyx is working through her bowl slowly: 3 of 7 meals finished this week.',
  'She was helping herself to the other cat’s food on Sep 12.',
  "She helped herself to Max's food again on Sep 12.",
  'Nyx worked through her bowl in 10 minutes.',
  'Nyx responds to her name most mornings.',
  'Nyx responded to the doorbell by barking.',
  'Her weight is logged at 4.1 kg on Sep 20, and 4.8 kg on Aug 1.',
  'Is the prednisone working?',
  'Has anything changed since the new food?',
  'What should I ask the vet about the prednisone?',
  'When did Nyx last vomit?',
  'How many doses of prednisone has Nyx had?',
  'Worth raising with your vet: 4 episodes since the visit.',
  'The vet visit is booked for Sep 30.',
  "Nyx's last dose was logged at 8:10 am.",
];

describe('careClaimScreens (CUL-1271)', () => {
  it.each(REPRODUCED)('blocks the reproduced sentence: %s', (text, reason) => {
    expect(careClaimReason(text)).toBe(reason);
  });

  it.each(DELEGATION)('blocks delegation / containment: %s', (text) => {
    expect(DELEGATION_RE.test(text)).toBe(true);
  });

  it.each(ATTRIBUTION)('blocks treatment attribution: %s', (text) => {
    expect(TREATMENT_ATTRIBUTION_RE.test(text)).toBe(true);
  });

  it.each(HONEST)('passes the honest count / date form: %s', (text) => {
    expect(careClaimReason(text)).toBeNull();
  });

  it('asks the question as a question, never blocks it: "Is the prednisone working?"', () => {
    // The follow-up chip is a question the surface answers, not a claim; the arms need the
    // auxiliary directly before the effect word, which a question inverts.
    expect(TREATMENT_ATTRIBUTION_RE.test('Is the prednisone working?')).toBe(false);
    expect(TREATMENT_ATTRIBUTION_RE.test('Is the new food helping her?')).toBe(false);
  });

  it('treats null and empty input as no claim', () => {
    expect(careClaimReason('')).toBeNull();
    expect(careClaimReason(undefined as unknown as string)).toBeNull();
  });
});
