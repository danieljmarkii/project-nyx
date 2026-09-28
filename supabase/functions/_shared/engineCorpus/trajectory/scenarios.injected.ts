// Injected problems: something real is there, from a known day (Engines v3 PR-15, CUL-508).
//
// These are the pets E-6's ruling sheet protects: a change that makes an engine speak up LESS
// needs harness proof that detection is no worse on them. Each states its effect size and
// onset so detection probability and days-to-detect are measurable against a known answer.
// The sizes are chosen to be clinically meaningful, not to be easy: a relative risk of 3 is
// the deep dive's named case (brief §7 A2), and a doubling is the change EN-9's watching
// state must re-raise on.

import { CI_SEEDS, FOOD, logging, rotatingFeeding, stapleFeeding, START } from './scenarios.shared.ts'
import type { ScenarioSpec } from './spec.ts'

const cat = (name: string) => ({ key: 'a', name, species: 'cat' as const })

export const INJECTED_SCENARIOS: ScenarioSpec[] = [
  {
    id: 'inj-enteropathy-onset',
    title: 'Chronic enteropathy starting on day 90',
    category: 'injected',
    rationale:
      'A cat vomiting once a month goes to six a month (about every five days, the FCEAI moderate band) from day 90, with diarrhoea following ten days later. The chronic enteropathy onset the deep dive names (brief §7 A2). Chronic vomiting at this rate warrants a booked workup (EN-9 evidence).',
    covers: ['enteropathy_onset', 'staple_feeder'],
    tz: 'America/Chicago',
    startDate: START,
    days: 240,
    pets: [
      {
        ...cat('Harlow'),
        feeding: stapleFeeding(),
        signs: [
          { sign: 'vomit', rate: { perMonth: 1 } },
          { sign: 'diarrhea', rate: { perMonth: 0.3 } },
        ],
        effects: [
          { kind: 'rate_step', sign: 'vomit', multiplier: 6, from: { day: 90 } },
          { kind: 'rate_step', sign: 'diarrhea', multiplier: 5, from: { day: 100 } },
        ],
        logging: logging(),
      },
    ],
    ciSeeds: CI_SEEDS,
    truth: 'Vomiting rises sixfold from day 90 and diarrhoea fivefold from day 100, and stays. Detection is a worsening or chronic card for vomiting on or after day 90; days to detect count from 90.',
  },
  {
    id: 'inj-protein-reaction-rr3',
    title: 'A reaction to beef, relative risk 3, on a rotation',
    category: 'injected',
    rationale:
      'On a day the cat eats beef its vomit rate is three times baseline, and the extra vomits follow the beef meal by half an hour to eight hours. The rotation makes beef one day in six, so the lane has contrast. The deep dive\'s named case (brief §7 A2); relative risk 3 is a moderate, not a dramatic, effect.',
    covers: ['protein_reaction', 'rotating_feeder'],
    tz: 'America/Chicago',
    startDate: START,
    days: 180,
    pets: [
      {
        ...cat('Rook'),
        feeding: rotatingFeeding(),
        signs: [{ sign: 'vomit', rate: { perMonth: 2 } }],
        effects: [{ kind: 'protein_reaction', sign: 'vomit', protein: 'beef', rr: 3 }],
        logging: logging(),
      },
    ],
    ciSeeds: CI_SEEDS,
    truth: 'Beef days carry three times the vomit rate. Detection is a food card naming beef; a card naming any other protein is a false attribution.',
  },
  {
    id: 'inj-protein-reaction-hidden',
    title: 'A reaction to chicken, hidden inside a "duck" food',
    category: 'injected',
    rationale:
      'The elimination trial\'s textbook contaminant: the owner feeds a duck food whose label also lists chicken, and the cat reacts to chicken. Chicken is eaten on chicken days and duck days alike. A lane reading only the primary protein sees duck and chicken split the blame (B-351).',
    covers: ['protein_reaction'],
    tz: 'America/Chicago',
    startDate: START,
    days: 180,
    pets: [
      {
        ...cat('Nettle'),
        feeding: {
          kind: 'meals',
          hours: [7.5, 18],
          choose: 'daily',
          foods: [FOOD.chickenDry, FOOD.duckWetWithChicken, FOOD.lambDry, FOOD.tunaWet, FOOD.turkeyDry, FOOD.salmonWet].map((f) => ({ ...f, weight: 1 })),
        },
        signs: [{ sign: 'vomit', rate: { perMonth: 2 } }],
        effects: [{ kind: 'protein_reaction', sign: 'vomit', protein: 'chicken', rr: 3 }],
        logging: logging(),
      },
    ],
    ciSeeds: CI_SEEDS,
    truth: 'Any day with chicken (the chicken food or the duck food) carries three times the rate. Detection names chicken; naming duck alone is a partial miss.',
  },
  {
    id: 'inj-postprandial',
    title: 'Vomiting soon after meals ("scarf and barf")',
    category: 'injected',
    rationale:
      'Every vomit comes 15 minutes to two hours after a meal, at three a month: the post-prandial phenotype (brief §7 A2), usually eating too fast. It is a timing pattern, not a food one: the food is the staple, so a food lane has nothing to find.',
    covers: ['postprandial', 'staple_feeder'],
    tz: 'America/Chicago',
    startDate: START,
    days: 180,
    pets: [{ ...cat('Pippin'), feeding: stapleFeeding(), signs: [{ sign: 'vomit', rate: { perMonth: 3 }, timing: 'postprandial' }], logging: logging() }],
    ciSeeds: CI_SEEDS,
    truth: 'Every vomit follows a meal within two hours. Detection is the rapid-after-meal timing card; a food card is a false attribution.',
  },
  {
    id: 'inj-early-morning-bilious',
    title: 'Bile vomiting in the early morning, on an empty stomach',
    category: 'injected',
    rationale:
      'Every vomit falls between 04:00 and 07:00 local, before breakfast, and photo reads show bile: the bilious vomiting pattern (brief §7 A2). It is the opposite timing trap to the post-prandial cat: the vomits PRECEDE the morning meal.',
    covers: ['early_morning', 'staple_feeder'],
    tz: 'Europe/London',
    startDate: START,
    days: 180,
    pets: [{ ...cat('Dusk'), feeding: stapleFeeding(), signs: [{ sign: 'vomit', rate: { perMonth: 3 }, timing: 'early_morning' }], logging: logging({ pPhoto: 0.5 }) }],
    ciSeeds: CI_SEEDS,
    truth: 'Every vomit is 04:00 to 07:00 local with bile. Detection is an early-morning or empty-stomach timing read; a post-prandial card is wrong.',
  },
  {
    id: 'inj-rate-doubling',
    title: 'A cat vomiting three times a month doubles from day 100',
    category: 'injected',
    rationale:
      'A true doubling on a known day: the change EN-11 must detect no slower than the shipped engine, and the one EN-9\'s watching state must re-raise on (PR-16 pass lines).',
    covers: ['rate_doubling', 'rotating_feeder'],
    tz: 'America/Chicago',
    startDate: START,
    days: 200,
    pets: [
      {
        ...cat('Mistral'),
        feeding: rotatingFeeding(),
        signs: [{ sign: 'vomit', rate: { perMonth: 3 } }],
        effects: [{ kind: 'rate_step', sign: 'vomit', multiplier: 2, from: { day: 100 } }],
        logging: logging(),
      },
    ],
    ciSeeds: CI_SEEDS,
    truth: 'The vomit rate doubles on day 100 and stays. Detection is a worsening card for vomiting on or after day 100.',
  },
  {
    id: 'inj-red-flag',
    title: 'Blood in a photographed vomit on day 75',
    category: 'injected',
    rationale:
      'A cat with an unremarkable once-a-month record photographs a vomit on or after day 75 and the read shows blood. A visual red flag escalates on presence (the n=1 invariant). EN-3/4/7\'s hard property: no injected red flag lands below its shipped tier.',
    covers: ['red_flag', 'staple_feeder'],
    tz: 'America/Chicago',
    startDate: START,
    days: 180,
    pets: [{ ...cat('Ember'), feeding: stapleFeeding(), signs: [{ sign: 'vomit', rate: { perMonth: 1 } }], redFlagDays: [75], logging: logging({ pPhoto: 0.3 }) }],
    ciSeeds: CI_SEEDS,
    truth: 'The first vomit on or after day 75 is photographed with blood present. It must land at its shipped tier or higher, the evening its read exists.',
  },
  {
    id: 'inj-trial-responder',
    title: 'A diet trial that works',
    category: 'injected',
    rationale:
      'A cat vomiting five times a month starts a rabbit trial on day 30 (56-day target); from two weeks in the rate falls to a quarter. A real responder, for the trial lane\'s sensitivity (brief §7 A2: a responder and a non-responder).',
    covers: ['trial_responder'],
    tz: 'America/Chicago',
    startDate: START,
    days: 150,
    pets: [
      {
        ...cat('Sorrel'),
        feeding: rotatingFeeding(),
        signs: [{ sign: 'vomit', rate: { perMonth: 5 } }],
        trial: { startDay: 30, targetDays: 56, food: FOOD.rabbitTrial, response: { kind: 'responder', residual: 0.25, onsetDays: 14 } },
        logging: logging(),
      },
    ],
    ciSeeds: CI_SEEDS,
    truth: 'The vomit rate falls to a quarter from day 44 and stays down on the trial food. Detection is a trial read of improvement after day 44, never before.',
  },
  {
    id: 'inj-trial-non-responder',
    title: 'A diet trial that does nothing',
    category: 'injected',
    rationale: 'The same cat and trial, with no response. Beside the trial-at-a-peak null, it separates "the trial did nothing" from "the flare ended".',
    covers: ['trial_non_responder'],
    tz: 'America/Chicago',
    startDate: START,
    days: 150,
    pets: [
      {
        ...cat('Tamsin'),
        feeding: rotatingFeeding(),
        signs: [{ sign: 'vomit', rate: { perMonth: 5 } }],
        trial: { startDay: 30, targetDays: 56, food: FOOD.rabbitTrial, response: { kind: 'non_responder' } },
        logging: logging(),
      },
    ],
    ciSeeds: CI_SEEDS,
    truth: 'The rate is five a month throughout. An improvement read is false; the chronic vomiting remains a concern the engine should keep raising.',
  },
  {
    id: 'inj-cough-and-vomit',
    title: 'A cat with a chronic cough and chronic vomiting',
    category: 'injected',
    rationale:
      'GAP-29: cough and vomiting are two concerns, and an owner cannot always tell a cough from a retch. This cat has both, independently (six coughs and three vomits a month), as with asthma beside a chronic enteropathy. Each is a real concern and neither explains the other.',
    covers: ['cough_and_vomit'],
    tz: 'America/Chicago',
    startDate: START,
    days: 180,
    pets: [
      {
        ...cat('Hazel'),
        feeding: stapleFeeding(),
        signs: [
          { sign: 'vomit', rate: { perMonth: 3 } },
          { sign: 'cough', rate: { perMonth: 6 } },
        ],
        logging: logging(),
      },
    ],
    ciSeeds: CI_SEEDS,
    truth: 'Two independent chronic concerns. Detection keeps both; a card that folds one into the other, or drops the cough, is a miss.',
  },
  {
    id: 'inj-kennel-cough-gag',
    title: 'A dog with kennel cough whose gags are logged as vomits',
    category: 'injected',
    rationale:
      'MFU-4: kennel cough ends a coughing fit with a gag that brings up foam, and owners log it as a vomit. Five coughs a day for two weeks from day 60; three in ten are logged as vomits. The real problem is a self-limiting cough; the "vomiting spike" is a labelling artefact.',
    covers: ['kennel_cough_gag', 'dog'],
    tz: 'America/Chicago',
    startDate: START,
    days: 150,
    pets: [
      {
        key: 'a',
        name: 'Juniper',
        species: 'dog',
        feeding: { kind: 'meals', hours: [7, 17.5], choose: 'weighted', foods: [{ ...FOOD.lambDry, weight: 1 }], treat: { perDay: 0.5, food: FOOD.chickenTreat } },
        signs: [{ sign: 'vomit', rate: { perMonth: 0.5 } }],
        effects: [{ kind: 'kennel_cough', fromDay: 60, days: 14, perDay: 5 }],
        logging: logging({ pGagAsVomit: 0.3 }),
      },
    ],
    ciSeeds: CI_SEEDS,
    truth: 'A two-week cough from day 60. The vomit rows in that window are mostly gags. A vomiting worsening card there misreads a cough; a cough card is right.',
  },
]
