// Null pets: nothing is wrong that the engine should find (Engines v3 PR-15, CUL-508).
//
// Every null pet vomits. That is the point: a healthy cat vomits now and then (hairballs, a
// meal eaten too fast), and the question the harness asks is how often each lane invents a
// finding out of that background over months of evenings (the evidence pack's §6.1: a floor
// of about 3% per look became 10 to 13% of null pets carded within a year in a toy lane).
//
// The rates are a grid, never one assumed value (evidence pack §4.1, "honesty risks"): one
// and three a month, plain Poisson and bursty, flat and wandering. One a month is the rate
// the Engineering lens's null probe used (CUL-1268: 93 of 100 such cats saw a food culprit
// card on the shipped engine); three a month is still below the FCEAI mild band (about once a
// week; Jergens 2010, evidence pack §4). Neither is a claim about the population.
//
// A null pet can still carry a real clinical story (a garbage raid, a flare that ends on its
// own). "Null" means null FOR THE LANES THE SCENARIO NAMES in its `truth`, never "healthy".

import { CI_SEEDS, FOOD, logging, rotatingFeeding, stapleFeeding, START } from './scenarios.shared.ts'
import type { ScenarioSpec } from './spec.ts'

const cat = (name: string) => ({ key: 'a', name, species: 'cat' as const })

export const NULL_SCENARIOS: ScenarioSpec[] = [
  {
    id: 'null-staple-1pm',
    title: 'A staple-fed cat vomiting once a month',
    category: 'null',
    rationale:
      'The commonest pet the app will see: two meals a day of one food, the occasional salmon, one vomit a month. With 90% of meals one protein, almost every vomit follows chicken, so a lane that counts co-occurrence without asking how often chicken is eaten will name it. The critique sizing check found 43% of such cats saw an insight card.',
    covers: ['staple_feeder', 'vomit_1_per_month'],
    tz: 'America/Chicago',
    startDate: START,
    days: 180,
    pets: [{ ...cat('Marlow'), feeding: stapleFeeding(), signs: [{ sign: 'vomit', rate: { perMonth: 1 } }], logging: logging() }],
    ciSeeds: CI_SEEDS,
    truth: 'No food causes vomiting; the rate never changes. Any food, worsening or timing card is a false card.',
    key: {
      falseCards: [
        { petKey: 'a', lane: 'food' },
        { petKey: 'a', lane: 'timing' },
        { petKey: 'a', lane: 'worsening' },
        { petKey: 'a', lane: 'chronic' },
        { petKey: 'a', lane: 'resolution' },
      ],
      detect: [],
    },
  },
  {
    id: 'null-staple-3pm-bursty',
    title: 'A staple-fed cat vomiting three times a month, in bursts',
    category: 'null',
    rationale:
      'The same cat at the top of the "occasional" range, with a weekly rate multiplier (Gamma shape 0.5) so vomits cluster the way real ones do after a hairball week. Overdispersion is the adversarial null for any lane that assumes Poisson arrivals (evidence pack §4.1, beta-binomial and negative-binomial nulls).',
    covers: ['staple_feeder', 'vomit_3_per_month', 'overdispersed'],
    tz: 'America/Chicago',
    startDate: START,
    days: 180,
    pets: [{ ...cat('Tansy'), feeding: stapleFeeding(), signs: [{ sign: 'vomit', rate: { perMonth: 3, weeklyDispersion: 0.5 } }], logging: logging() }],
    ciSeeds: CI_SEEDS,
    truth: 'No food causes vomiting and the long-run rate is flat; the weekly clusters are noise. A worsening card on a cluster is a false card.',
    key: {
      falseCards: [
        { petKey: 'a', lane: 'food' },
        { petKey: 'a', lane: 'timing' },
        { petKey: 'a', lane: 'worsening' },
        { petKey: 'a', lane: 'resolution' },
      ],
      detect: [],
    },
  },
  {
    id: 'null-rotating-1pm',
    title: 'A cat on a six-protein rotation vomiting once a month',
    category: 'null',
    rationale:
      "The Engineering lens's null probe, as a committed pet (CUL-1268: 100 cats, one vomit a month, six rotating proteins, 180 evenings; 93 saw a food culprit card and 68 a worsening safety card on the shipped engine). With six foods each eaten one day in six, some protein will precede most vomits in some window by chance alone.",
    covers: ['rotating_feeder', 'vomit_1_per_month'],
    tz: 'America/Chicago',
    startDate: START,
    days: 180,
    pets: [{ ...cat('Pilot'), feeding: rotatingFeeding(), signs: [{ sign: 'vomit', rate: { perMonth: 1 } }], logging: logging() }],
    ciSeeds: CI_SEEDS,
    truth: 'No food causes vomiting; the rate never changes. Any food culprit or worsening card is a false card.',
    key: {
      falseCards: [
        { petKey: 'a', lane: 'food' },
        { petKey: 'a', lane: 'timing' },
        { petKey: 'a', lane: 'worsening' },
        { petKey: 'a', lane: 'chronic' },
        { petKey: 'a', lane: 'resolution' },
      ],
      detect: [],
    },
  },
  {
    id: 'null-rotating-3pm-bursty',
    title: 'A rotation-fed cat vomiting three times a month, in bursts',
    category: 'null',
    rationale: 'The rotation at the high end of the grid, weekly Gamma shape 1: more episodes give the food lanes more chances, and bursts give the worsening lane a false run-up.',
    covers: ['rotating_feeder', 'vomit_3_per_month', 'overdispersed'],
    tz: 'Europe/London',
    startDate: START,
    days: 180,
    pets: [{ ...cat('Wren'), feeding: rotatingFeeding(), signs: [{ sign: 'vomit', rate: { perMonth: 3, weeklyDispersion: 1 } }], logging: logging() }],
    ciSeeds: CI_SEEDS,
    truth: 'No food causes vomiting and the long-run rate is flat.',
    key: {
      falseCards: [
        { petKey: 'a', lane: 'food' },
        { petKey: 'a', lane: 'timing' },
        { petKey: 'a', lane: 'worsening' },
        { petKey: 'a', lane: 'resolution' },
      ],
      detect: [],
    },
  },
  {
    id: 'null-grazer',
    title: 'A free-fed grazing cat with a wet meal in the evening',
    category: 'null',
    rationale:
      'Sam\'s cat (personas.md): dry food always down, so no meal is logged for most of what she eats, plus one logged wet meal. The bowl is a feeding arrangement, not a row per meal, so every vomit is "near" the dry food and the wet meal is the only logged exposure. Two a month sits between the grid\'s ends.',
    covers: ['grazer'],
    tz: 'America/Los_Angeles',
    startDate: START,
    days: 180,
    pets: [
      {
        ...cat('Sable'),
        feeding: { kind: 'free_choice', bowl: FOOD.chickenDry, wetHours: [18], wet: FOOD.salmonWet },
        signs: [{ sign: 'vomit', rate: { perMonth: 2 } }],
        logging: logging(),
      },
    ],
    ciSeeds: CI_SEEDS,
    truth: 'Neither food causes vomiting, and vomits are not timed to the wet meal. A timing or food card is a false card.',
    key: {
      falseCards: [
        { petKey: 'a', lane: 'food' },
        { petKey: 'a', lane: 'timing' },
        { petKey: 'a', lane: 'worsening' },
        { petKey: 'a', lane: 'resolution' },
      ],
      detect: [],
    },
  },
  {
    id: 'null-wandering-365',
    title: 'A cat whose vomit rate drifts up and down for a year',
    category: 'null',
    rationale:
      'A slowly wandering rate (AR(1) on the log rate, sd 0.15 a day, half-life 30 days) with no trend: the "wandering" adversarial null the evidence pack names. Over a year it drifts through stretches that look like worsening and stretches that look like improvement, and neither is real.',
    covers: ['wandering_rate', 'rotating_feeder'],
    tz: 'America/Chicago',
    startDate: START,
    days: 365,
    pets: [{ ...cat('Juno'), feeding: rotatingFeeding(), signs: [{ sign: 'vomit', rate: { perMonth: 2, wander: { sd: 0.15, halfLifeDays: 30 } } }], logging: logging() }],
    ciSeeds: CI_SEEDS,
    truth: 'No trend and no food effect. The rate drifts with no cause; a card is a false card unless the harness defines a drift size as clinically real (this scenario does not).',
    key: {
      falseCards: [
        { petKey: 'a', lane: 'food' },
        { petKey: 'a', lane: 'timing' },
      ],
      detect: [],
    },
  },
  {
    id: 'null-attrition-365',
    title: 'An owner whose logging fades over a year, over a cat that does not change',
    category: 'null',
    rationale:
      'Logging attrition: every kind of row thins with a 90-day half-life, so by month six a quarter of what happens is logged. The truth is flat. Fewer logged vomits must never read as "improving" (the n=1 invariant: absence is not wellness), and the fading meal log must not make a remaining food look guilty.',
    covers: ['logging_attrition', 'staple_feeder'],
    tz: 'America/Chicago',
    startDate: START,
    days: 365,
    pets: [{ ...cat('Moth'), feeding: stapleFeeding(), signs: [{ sign: 'vomit', rate: { perMonth: 2 } }], logging: logging({ attritionHalfLifeDays: 90 }) }],
    ciSeeds: CI_SEEDS,
    truth: 'The true rate is flat all year. An improvement or resolution card is a false reassurance; a food card is a false card.',
    key: {
      falseCards: [
        { petKey: 'a', lane: 'food' },
        { petKey: 'a', lane: 'timing' },
        { petKey: 'a', lane: 'worsening' },
        { petKey: 'a', lane: 'resolution' },
      ],
      detect: [],
    },
  },
  {
    id: 'null-found-piles',
    title: 'An owner who mostly finds the vomit later',
    category: 'null',
    rationale:
      'Six in ten logged vomits are found, not witnessed: a window row whose occurred_at is the time it was found (the latest edge). A timing lane that treats that edge as the vomit time will see vomits that follow whatever the owner did before looking (the B-078 rule: only a witnessed onset is timed-eligible).',
    covers: ['found_piles', 'staple_feeder'],
    tz: 'America/Chicago',
    startDate: START,
    days: 180,
    pets: [{ ...cat('Ash'), feeding: stapleFeeding(), signs: [{ sign: 'vomit', rate: { perMonth: 2 } }], logging: logging({ pFound: 0.6 }) }],
    ciSeeds: CI_SEEDS,
    truth: 'No food or timing effect. A post-prandial or early-morning card built on window rows is a false card.',
    key: {
      falseCards: [
        { petKey: 'a', lane: 'food' },
        { petKey: 'a', lane: 'timing' },
        { petKey: 'a', lane: 'worsening' },
        { petKey: 'a', lane: 'resolution' },
      ],
      detect: [],
    },
  },
  {
    id: 'null-two-cat-home',
    title: 'Two cats, and every found pile goes to the one on screen',
    category: 'null',
    rationale:
      'MFU-5: in a two-cat home a found pile is logged to whichever cat is on screen. Here cat B vomits three times a month and cat A barely at all, but half the piles are found and all of them land on cat A. Cat A\'s record looks like a chronic vomiter; the truth ledger says whose they were.',
    covers: ['two_cat_home', 'found_piles'],
    tz: 'America/Chicago',
    startDate: START,
    days: 180,
    pets: [
      { key: 'a', name: 'Olive', species: 'cat', feeding: stapleFeeding(), signs: [{ sign: 'vomit', rate: { perMonth: 0.5 } }], logging: logging({ pFound: 0.5, foundPilesGoTo: 'a' }) },
      { key: 'b', name: 'Fennel', species: 'cat', feeding: rotatingFeeding(), signs: [{ sign: 'vomit', rate: { perMonth: 3 } }], logging: logging({ pFound: 0.5, foundPilesGoTo: 'a' }) },
    ],
    ciSeeds: CI_SEEDS,
    truth: "Cat A vomits about twice in six months. Cat B's rate is flat at three a month. A worsening or chronic card on cat A is built on cat B's vomits.",
    key: {
      falseCards: [
        { petKey: 'a', lane: 'food' },
        { petKey: 'a', lane: 'timing' },
        { petKey: 'a', lane: 'worsening' },
        { petKey: 'a', lane: 'chronic' },
        { petKey: 'a', lane: 'resolution' },
        { petKey: 'b', lane: 'food' },
        { petKey: 'b', lane: 'timing' },
        { petKey: 'b', lane: 'worsening' },
        { petKey: 'b', lane: 'resolution' },
      ],
      detect: [],
    },
  },
  {
    id: 'null-dog-indiscretion',
    title: 'A meal-fed dog who raids the bin about once a month',
    category: 'null',
    rationale:
      'MFU-4: dogs are absent from the instruments. This one eats two kibble meals and a treat most days, vomits rarely, and about once a month gets into something: two or three vomits and a loose stool inside twelve hours. Dietary indiscretion is a common cause of acute vomiting in dogs and is not a food intolerance; the treat he had that afternoon is a bystander.',
    covers: ['dog', 'dietary_indiscretion'],
    tz: 'America/Chicago',
    startDate: START,
    days: 180,
    pets: [
      {
        key: 'a',
        name: 'Rufus',
        species: 'dog',
        feeding: {
          kind: 'meals',
          hours: [7, 17.5],
          choose: 'weighted',
          foods: [{ ...FOOD.chickenDry, weight: 1 }],
          treat: { perDay: 0.6, food: FOOD.beefTreat },
        },
        signs: [
          { sign: 'vomit', rate: { perMonth: 0.5 } },
          { sign: 'diarrhea', rate: { perMonth: 0.5 } },
        ],
        effects: [{ kind: 'indiscretion', perMonth: 1 }],
        logging: logging(),
      },
    ],
    ciSeeds: CI_SEEDS,
    truth: 'No food causes vomiting; the raid clusters are acute and self-limiting. A food card naming the treat, or a chronic card, is a false card. Each cluster is a real acute episode the per-incident read may take seriously.',
    key: {
      falseCards: [
        { petKey: 'a', lane: 'food' },
        { petKey: 'a', lane: 'chronic' },
      ],
      detect: [],
    },
  },
  {
    id: 'null-species-other',
    title: 'A ferret (species "other")',
    category: 'null',
    rationale:
      'Species "other" reaches every lane that branches on cat or dog. A ferret vomits and gets diarrhoea; nothing in the engine was calibrated on one. The scenario exists so a rule that reaches "other" is measured before it ships (MFU-4), and so a cat-only rule (feline reduced intake) can be seen not to fire.',
    covers: ['species_other'],
    tz: 'America/Chicago',
    startDate: START,
    days: 180,
    pets: [
      {
        key: 'a',
        name: 'Bramble',
        species: 'other',
        feeding: { kind: 'meals', hours: [8, 14, 20], choose: 'weighted', foods: [{ ...FOOD.chickenDry, weight: 1 }] },
        signs: [
          { sign: 'vomit', rate: { perMonth: 1 } },
          { sign: 'diarrhea', rate: { perMonth: 1 } },
        ],
        logging: logging(),
      },
    ],
    ciSeeds: CI_SEEDS,
    truth: 'Nothing is wrong and nothing changes. Any card is a false card.',
    key: {
      falseCards: [
        { petKey: 'a', lane: 'food' },
        { petKey: 'a', lane: 'timing' },
        { petKey: 'a', lane: 'worsening' },
        { petKey: 'a', lane: 'chronic' },
        { petKey: 'a', lane: 'resolution' },
      ],
      detect: [],
    },
  },
  {
    id: 'null-trial-at-peak',
    title: 'A diet trial started at the top of a flare that was ending anyway',
    category: 'null',
    rationale:
      'Regression to the mean, the trial lane\'s central trap: owners start a trial when things are worst. A four-week flare (four times baseline) peaks in its middle, the trial starts then, and the flare ends two weeks later on its own. The diet does nothing. A trial lane reading before vs after will credit it. The confound is built in on purpose, as it is in life: the rotation proteins were eaten through half the flare and the trial food through its tail, so every rotation protein carries a higher crude rate than rabbit. No food causes anything; a food card here is false.',
    covers: ['trial_at_peak'],
    tz: 'America/Chicago',
    startDate: START,
    days: 180,
    pets: [
      {
        ...cat('Quill'),
        feeding: rotatingFeeding(),
        signs: [{ sign: 'vomit', rate: { perMonth: 2 } }],
        effects: [{ kind: 'flare', sign: 'vomit', multiplier: 4, fromDay: 30, days: 28 }],
        trial: { startDay: 44, targetDays: 56, food: FOOD.rabbitTrial, response: { kind: 'non_responder' } },
        logging: logging(),
      },
    ],
    ciSeeds: CI_SEEDS,
    truth: 'The trial has no effect. The fall after day 58 is the flare ending. A "responding to the trial" read is a false attribution.',
    key: {
      falseCards: [
        { petKey: 'a', lane: 'food' },
        { petKey: 'a', lane: 'trial' },
      ],
      detect: [],
    },
  },
  {
    id: 'null-event-dependent-feeding',
    title: 'An owner who switches to bland food after every vomit',
    category: 'null',
    rationale:
      'Owners change food because the pet vomited (Lipsitch 2010; the evidence pack\'s negative-control gates). After every logged vomit this owner feeds white fish for three days, so white fish always follows vomiting and is eaten more in the bad weeks. It causes nothing. A lane without a time-reversed control will find it.',
    covers: ['event_dependent_feeding'],
    tz: 'America/Chicago',
    startDate: START,
    days: 180,
    pets: [
      {
        ...cat('Clove'),
        feeding: { ...rotatingFeeding(), switchAfterLoggedVomit: { food: FOOD.whitefishWet, days: 3 } },
        signs: [{ sign: 'vomit', rate: { perMonth: 3 } }],
        logging: logging(),
      },
    ],
    ciSeeds: CI_SEEDS,
    truth: 'No food causes vomiting. White fish follows vomits by the owner\'s choice. A white fish card is a false card, and so is any card naming the food eaten before a switch.',
    key: {
      falseCards: [
        { petKey: 'a', lane: 'food' },
        { petKey: 'a', lane: 'timing' },
        { petKey: 'a', lane: 'worsening' },
        { petKey: 'a', lane: 'resolution' },
      ],
      detect: [],
    },
  },
]
