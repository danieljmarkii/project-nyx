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
  zeroBesideCareReason,
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
  // The adversarial pass on the first push (CUL-1271): any pet's name, not only Nyx's.
  "It's in Juniper’s vet’s hands now.",
  "She's under your vet's care, with 4 episodes since.",
  "It's in the vet's care now.",
  'It is in the hands of your vet.',
  "It's in your vet's capable hands.",
  "Nyx's vet has this.",
  'Your vet’s got this.',
  'Your vet has you covered.',
  'Your vet has it well covered.',
  'The vet is keeping an eye on it.',
  'Your vet is on top of it.',
  "Your vet's already on it.",
  'Your vet is taking care of the vomiting.',
  "She's being looked after.",
  "It's in hand.",
  'The cough is well controlled on prednisone.',
  'The cough is controlled on prednisone.',
  'Leave it to your vet.',
  'You can relax.',
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
  // The adversarial pass on the first push (CUL-1271).
  'Since the prednisone started, Nyx’s cough has settled.',
  'Her cough has since settled.',
  'Her vomiting has been easing since the visit.',
  'Her vomiting has stopped since the prednisone.',
  'The prednisone seems to help her cough.',
  'The prednisone helps her cough.',
  'The prednisone seems to work.',
  'The prednisone should help her cough.',
  'The prednisone should start working soon.',
  'It has started to help.',
  'It seems to have done its job.',
  'The prednisone has done the trick.',
  'The new diet has done wonders.',
  'The prednisone has been a big help.',
  "She's benefiting from the prednisone.",
  'The prednisone is doing her good.',
  "She's responding to the prednisone.",
  'Nyx’s responding to the prednisone.',
  'Since starting the prednisone she has coughed less.',
  'There have been fewer coughing episodes since the prednisone started.',
  "Nyx's appetite has come back since the visit.",
  "She hasn't vomited since the visit.",
  'No vomiting since the visit.',
  'She has been vomit-free since Sep 16.',
  'She has turned a corner.',
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
  // False positives the adversarial pass found on the first push, and the escalations the
  // since-anchored arms must never swallow (CUL-1271).
  'Your vet worked her up on Sep 16.',
  'She vomited behind her bowl on Sep 12.',
  'Your vet has this record if you send the report.',
  'Your vet asked you to keep an eye on the vomiting.',
  'Logging each meal will help your vet.',
  'The app works without a connection.',
  // Passes the VERDICT screens; a zero beside a visit is refused by zeroBesideCareReason (CUL-1429).
  'No vomiting has been logged since the visit.',
  'Since the prednisone started, she has stopped eating her dinner.',
  'Since the visit, the vomiting has come back.',
  'Since Sep 16 she has finished fewer meals.',
  "Nyx hasn't touched her food since this morning.",
  "Nyx hasn't eaten since yesterday — worth a call to your vet today.",
  "She's eating less since the visit.",
  'She logged 2 check-ins this week.',
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

// CUL-1429 — a zero beside a visit or a medication. The two sentences the CUL-1420 adversarial
// pass reproduced passing every Ask screen, the forms a model writes once EN-10's lines reach
// it, and the honest forms (a non-zero count, a zero beside nothing, the window and the logging).
describe('zeroBesideCareReason (CUL-1429)', () => {
  const NONE = { knownNames: [] as string[], onBoardNames: [] as string[] };

  it.each([
    'Since the Sep 16 visit, 0 vomiting episodes are logged.',
    'Since the Sep 16 visit, no vomiting episodes are logged.',
    'Your vet saw Nyx on Sep 16. No vomiting has been logged since that visit.',
    'Nothing has been logged since the visit.',
    'She has been vomit-free since her appointment.',
    "Nyx hasn't vomited since the recheck.",
    'Vomiting episodes logged since the visit: 0.',
    'Since the check-up, vomiting is logged on 0 of 14 days.',
    'No coughing is logged this week. The vet visit is on Oct 20.',
  ])('refuses a zero beside a visit: %s', (text) => {
    expect(zeroBesideCareReason(text, NONE)).toBe('zero_beside_visit');
  });

  it.each([
    'Prednisone started Sep 10; 0 coughing episodes are logged since.',
    'Prednisone started Sep 10. No coughing episodes are logged since then.',
    'Since the Cerenia started, none are logged.',
    'Nyx is on prednisolone 5mg tablets, and not a single episode is logged this week.',
    'Apoquel started Sep 1; no scratching is logged since.',
    'Since her medication started, 0 episodes are logged.',
    'No vomiting is logged since the steroid started.',
    "Nyx hasn't vomited since starting the Metro-Pred.",
  ])('refuses a zero beside a drug that can hide the sign: %s', (text) => {
    expect(zeroBesideCareReason(text, NONE)).toBe('zero_beside_medication');
  });

  it("refuses a zero beside the record's own course name, nickname or not", () => {
    const ctx = { knownNames: ["Buddy's tummy pills"], onBoardNames: [] };
    expect(zeroBesideCareReason("No vomiting is logged since Buddy's tummy pills started.", ctx)).toBe(
      'zero_beside_medication',
    );
  });

  it('refuses a zero while a masking course is on board, even unnamed in the answer', () => {
    const ctx = { knownNames: ['Prednisone'], onBoardNames: ['Prednisone'] };
    expect(zeroBesideCareReason('No coughing is logged this week.', ctx)).toBe('zero_beside_medication');
    // An unresolved on-board name masks every sign, like a systemic steroid.
    expect(zeroBesideCareReason('0 episodes are logged this week.', { knownNames: [], onBoardNames: ['Mystery drops'] })).toBe(
      'zero_beside_medication',
    );
  });

  it.each([
    // A drug that cannot hide the counted sign (carprofen causes GI upset, masks nothing).
    ['Carprofen started Sep 10; no coughing is logged since.', NONE],
    ['No coughing is logged this week.', { knownNames: ['Carprofen'], onBoardNames: ['Carprofen'] }],
    // An antiemetic hides vomiting, not coughing.
    ['Cerenia started Sep 10; 0 coughing episodes are logged since.', NONE],
  ])('passes a zero beside a drug that cannot hide that sign: %s', (text, ctx) => {
    expect(zeroBesideCareReason(text, ctx)).toBeNull();
  });

  it.each([
    // Non-zero counts beside a visit or a drug: the escalation-direction fact always shows.
    'Your vet saw Nyx on Sep 16; 4 vomiting episodes are logged since.',
    'Prednisone started Sep 10; 3 coughing episodes are logged since.',
    'Since the Sep 16 visit, 11 days, with something logged on 11 of them.',
    'Nyx is on prednisone: 12 doses logged, 2 not fully taken, since Sep 10.',
    'Since the visit, 10 vomiting episodes are logged.',
    // A zero beside nothing.
    'No vomiting is logged this week.',
    'Nyx has vomited 0 times this week.',
    // Words that look like a zero and are not.
    'There is no need to wait: worth a call to your vet today.',
    "Nyx hasn't eaten since yesterday — worth a call to your vet today.",
    'No, Nyx has 4 episodes logged since the Sep 16 visit.',
    'Prednisone 0.5 mg was logged at 8:00 am, 3 times this week.',
  ])('passes: %s', (text) => {
    expect(zeroBesideCareReason(text, NONE)).toBeNull();
  });

  it('the reproduced pair passes careClaimReason, so the zero screen is the one that catches it', () => {
    // Documents the hole CUL-1429 closes: the verdict screens are not count-aware.
    expect(careClaimReason('Since the Sep 16 visit, 0 vomiting episodes are logged.')).toBeNull();
    expect(careClaimReason('No vomiting has been logged since the visit.')).toBeNull();
  });
});
