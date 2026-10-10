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
  textMentionsVisit,
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
  const NONE = { knownNames: [] as string[], onBoardNames: [] as string[], visitInContext: false };

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

  // The adversarial pass on the first push (PR-45a): wordings, visit words and generic names
  // the first arms missed. Each sits beside prednisolone (masks every sign) or a visit.
  it.each([
    'Prednisolone is on board, and vomiting has not been logged since.',
    "Since the prednisolone started, vomiting hasn't been logged.",
    "Since the prednisolone, the vomiting hasn't recurred.",
    "Since the prednisolone, it didn't happen again.",
    'Since the prednisolone, she has stopped vomiting.',
    'Since the prednisolone, the vomiting stopped.',
    'None of the vomiting has come back since the prednisolone.',
    "There hasn't been any vomiting since the prednisolone.",
    "Since the prednisolone she's had none.",
    "You've not logged any vomiting since the prednisolone.",
    "Nothing's been logged since the prednisolone.",
    'Since Pred started, nothing.',
    'She has gone 12 days without vomiting on prednisolone.',
    'On prednisolone she is clear of vomiting.',
    'Since the prednisolone the log is clean.',
    'Since the prednisolone it has been quiet.',
    'Since the prednisolone there are no entries for vomiting.',
    'On prednisolone the vomiting dropped to zero.',
    'On prednisolone it went from 5 to 0.',
    'On prednisolone: coughing 2, vomiting 0.',
    'On prednisolone, vomiting none.',
    'On prednisolone, vomiting on 0/14 days.',
    'On prednisolone, vomiting on 0 of the last 3 days.',
    'On prednisolone, no days with vomiting.',
    'On prednisolone, vomiting on 0% of days.',
    'On prednisolone, 0 logged.',
    'On prednisolone, no throw-ups since.',
    'On prednisolone, no honking logged.',
    'On prednisolone, no seizures logged.',
    'Since Cerenia started, no episodes other than 2 coughs.',
    'Since Cerenia started, no new episodes besides a cough.',
    'Since the antiemetic started, no vomiting is logged.',
    'Since the inhaler started, no coughing is logged.',
  ])('refuses (adversarial pass): %s', (text) => {
    expect(zeroBesideCareReason(text, NONE)).not.toBeNull();
  });

  it.each([
    'No vomiting is logged since the vet.',
    'No vomiting is logged since her trip to the vet.',
    'Vet trip on Sep 16; no vomiting is logged since.',
    'No vomiting since the clinic.',
    'No vomiting since seeing Dr. Patel.',
    'No vomiting since the ER.',
    'No vomiting since her vet appt.',
    'No vomiting since the hospital stay.',
    'No vomiting since she was discharged.',
    'No vomiting since her dental.',
    'No vomiting since her surgery.',
    'No vomiting since the vet looked at her.',
  ])('refuses a zero beside a visit word (adversarial pass): %s', (text) => {
    expect(zeroBesideCareReason(text, NONE)).toBe('zero_beside_visit');
  });

  it.each([
    // Intake and dose sentences are escalations; refusing them would deflect them.
    "Since the Sep 16 visit, she hasn't had a full meal logged.",
    "She hasn't had any food logged since the visit.",
    'Since the visit, 0 of 6 meals were finished.',
    'Prednisone: 0 doses given this week, 3 missed.',
    'Cerenia was given 0 times this week.',
    // "she's been quiet" is a lethargy report, never a clean log.
    "Since the visit she's been quiet and off her food.",
  ])('passes an intake or dose escalation beside a visit or drug: %s', (text) => {
    expect(zeroBesideCareReason(text, NONE)).toBeNull();
  });

  // Adversarial pass 2 (PR-45a).
  it.each([
    'In the 14 days after the visit she hasn\'t thrown up and is eating well.',
    "On prednisolone, she hasn't thrown up and is eating well.",
    "She hasn't had another vomiting episode since the visit.",
    "I don't see any vomiting logged since the prednisolone started.",
    "There's no record of vomiting since the prednisolone started.",
    "I couldn't find any vomiting since the prednisolone started.",
    'On prednisolone. Vomiting episodes in the last 14 days: none.',
    "On prednisolone, vomiting doesn't appear in the last 14 days.",
    'On prednisolone, the log shows nothing for vomiting.',
    'On prednisolone she has eaten every meal and not vomited.',
  ])('refuses (adversarial pass 2): %s', (text) => {
    expect(zeroBesideCareReason(text, NONE)).not.toBeNull();
  });

  it('a visit the owner asked about sits beside a zero the answer only dates', () => {
    const text = 'No vomiting is logged since Sep 16, with logging on 12 of 14 days.';
    expect(zeroBesideCareReason(text, NONE)).toBeNull();
    expect(zeroBesideCareReason(text, { ...NONE, visitInContext: true })).toBe('zero_beside_visit');
    expect(textMentionsVisit('Has she vomited since her vet visit?')).toBe(true);
    expect(textMentionsVisit('Has she vomited this week?')).toBe(false);
    expect(textMentionsVisit('Should I call the clinic?')).toBe(false);
  });

  it.each([
    // Routing advice is not a visit (adversarial pass 2, F1).
    'No vomiting is logged in the last 7 days. If she vomits again, call the clinic.',
    'No vomiting is logged in the last 7 days. If it gets worse, go to the ER.',
    'No vomiting is logged in the last 7 days; consult your vet if it starts again.',
    'No vomiting is logged in the last 7 days. Bring this to her next appointment.',
    'No vomiting is logged in the last 7 days, worth raising at the exam on Oct 12.',
    // "hasn't stopped" is the opposite of a zero (F2).
    "She hasn't stopped vomiting since the visit: 6 episodes in 7 days.",
    'She still hasn\'t stopped scratching since the Apoquel, 11 entries.',
    // A missed-dose or intake clause beside a symptom count (F3, F4).
    "Prednisolone hasn't been logged since Oct 3. Worth checking with your vet.",
    'Nothing has been logged for her prednisolone since Oct 3.',
    "Her inhaler hasn't been logged since Oct 1.",
    'Since the visit she has vomited 4 times and eaten 0 of 6 meals.',
  ])('passes (adversarial pass 2): %s', (text) => {
    expect(zeroBesideCareReason(text, NONE)).toBeNull();
  });

  // Adversarial pass 3 (PR-45a).
  it.each([
    'Since the Sep 16 visit, 11 days, with something logged on 11 of them, and none of those entries is vomiting.',
    'Since the Sep 16 visit, 11 days, with something logged on 11 of them. Vomiting isn\'t among them.',
    "Prednisone started Sep 10; there hasn't been a coughing episode logged since.",
    "Since the Sep 16 visit, vomiting hasn't shown up in the log.",
    'Since the visit, vomiting is absent from the log.',
    'Since the prednisolone, nothing about coughing has been logged.',
    'Since the visit there has been no sign of vomiting.',
  ])('refuses (adversarial pass 3): %s', (text) => {
    expect(zeroBesideCareReason(text, NONE)).not.toBeNull();
  });

  it('a zero the owner asked about by visit, phrased as "none of it"', () => {
    expect(
      zeroBesideCareReason('Since Sep 16, 11 days, with something logged on 11 of them. None of it is vomiting.', {
        ...NONE,
        visitInContext: true,
      }),
    ).toBe('zero_beside_visit');
  });

  it.each([
    // A statement about the log's coverage is not a symptom zero.
    'Nyx vomited 2 times this week. Nothing was logged on Tuesday, so that day is unknown.',
    'Since the Sep 16 visit, 4 vomiting episodes are logged over 11 days, with nothing logged on 2 of them.',
    'Since the visit, 3 vomiting episodes are logged. No entries exist for Sep 20 and 21.',
    "Since the visit, 3 vomiting episodes are logged. Days without a log can't be counted as days without vomiting.",
    // An escalation is not a zero.
    'Nyx has vomited 6 times in 3 days since the visit with no sign of it slowing down; call your vet today.',
  ])('passes beside a visit (adversarial pass 3): %s', (text) => {
    expect(zeroBesideCareReason(text, NONE)).toBeNull();
    expect(zeroBesideCareReason(text, { ...NONE, onBoardNames: ['Prednisolone'] })).toBeNull();
  });

  it("refuses a zero beside the record's own course name, nickname or not", () => {
    const ctx = { knownNames: ["Buddy's tummy pills"], onBoardNames: [], visitInContext: false };
    expect(zeroBesideCareReason("No vomiting is logged since Buddy's tummy pills started.", ctx)).toBe(
      'zero_beside_medication',
    );
  });

  it('refuses a zero while a masking course is on board, even unnamed in the answer', () => {
    const ctx = { knownNames: ['Prednisone'], onBoardNames: ['Prednisone'], visitInContext: false };
    expect(zeroBesideCareReason('No coughing is logged this week.', ctx)).toBe('zero_beside_medication');
    // An unresolved on-board name masks every sign, like a systemic steroid.
    expect(zeroBesideCareReason('0 episodes are logged this week.', { knownNames: [], onBoardNames: ['Mystery drops'], visitInContext: false })).toBe(
      'zero_beside_medication',
    );
  });

  it.each([
    // A drug that cannot hide the counted sign (carprofen causes GI upset, masks nothing).
    ['Carprofen started Sep 10; no coughing is logged since.', NONE],
    ['No coughing is logged this week.', { knownNames: ['Carprofen'], onBoardNames: ['Carprofen'], visitInContext: false }],
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
