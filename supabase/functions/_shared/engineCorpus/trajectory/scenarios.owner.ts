// Owners who respond to what they were shown (Engines v3 PR-15, CUL-508).
//
// The deep dive's replay found Home asking for a vet on 110 evenings in a row and still asking
// after the visit (CUL-1139). EN-9's care state is built to hear an answer; these pets are the
// owners who give one. Their responses depend on the cards, so under the null observer
// nothing happens (the scenario's rows are the pet alone), and under PR-16's pipeline the
// answer, the visit or the lapse lands on the evening the engine earned it.
//
// Every pet here vomits about ten times a month (2.3 a week: the FCEAI moderate band, 2 to 3 a
// week; Jergens 2010, evidence pack §4), so a correct engine asks and the owner has something
// to answer. The deep dive placed Nyx at every two to four days, moderate to severe.
//
// Scoring rule (spec.ts TruthKey): an effect anchored to the acknowledgement (`afterAck`)
// only happens if the engine asked, so its truth differs between two engines run over the
// same seed. Those detections are scored `both_acknowledged` and are never an E-6 proof;
// own-visit-doubling-fixed is the paired sibling, its doubling on a fixed day.

import { CI_SEEDS, logging, rotatingFeeding, stapleFeeding, START } from './scenarios.shared.ts'
import type { ScenarioSpec, SignSpec } from './spec.ts'

const cat = (name: string) => ({ key: 'a', name, species: 'cat' as const })
const chronic: SignSpec[] = [{ sign: 'vomit', rate: { perMonth: 10 } }]

export const OWNER_SCENARIOS: ScenarioSpec[] = [
  {
    id: 'own-answers-vet-knows',
    title: 'The owner answers "My vet knows" after three evenings of asking',
    category: 'owner',
    rationale:
      'The ruled acknowledgement (9/26: "My vet knows" acknowledges a concern, per sign, stored as a dated fact). The disease is stable after the answer, so a correct watching state goes quiet and stays quiet; EN-9\'s pass line is the share of such cats raised again within eight weeks.',
    covers: ['answers_vet_knows'],
    tz: 'America/Chicago',
    startDate: START,
    days: 180,
    pets: [{ ...cat('Figaro'), feeding: stapleFeeding(), signs: chronic, owner: [{ kind: 'answer_vet_knows', afterEvenings: 3 }], logging: logging() }],
    ciSeeds: CI_SEEDS,
    truth: 'Chronic vomiting at ten a month, unchanged throughout. After the answer, a re-raise is a false re-raise; the concern itself is real.',
    key: {
      falseCards: [
        { petKey: 'a', lane: 're_raise', sign: 'vomit' },
        { petKey: 'a', lane: 'resolution' },
      ],
      detect: [
        { petKey: 'a', lane: 'chronic', sign: 'vomit', from: { day: 0 }, scoring: 'paired' },
      ],
    },
  },
  {
    id: 'own-visit-with-recheck',
    title: 'The owner books a visit that carries the concern, and the vet sets a recheck',
    category: 'owner',
    rationale:
      'After two evenings of asking, the owner books three to ten days out; the appointment lists the vomiting (a "record" question from Worth raising), the visit is logged, and the vet sets a recheck four weeks later, which the owner attends. The strong acknowledgement EN-9 names (a visit that carried the concern), and a recheck date E-3 keys on.',
    covers: ['visit_carries_concern', 'recheck_date'],
    tz: 'America/Chicago',
    startDate: START,
    days: 180,
    pets: [
      {
        ...cat('Wicket'),
        feeding: rotatingFeeding(),
        signs: chronic,
        weight: { startKg: 4.4, trend: { kind: 'flat' }, homeSd: 0.1, cadence: { kind: 'home', everyDays: [28, 42], firstDay: 5 } },
        owner: [{ kind: 'book_visit', afterEvenings: 2, leadDays: [3, 10], carriesConcern: true, recheckDays: 28, attendsRecheck: true }],
        logging: logging(),
      },
    ],
    ciSeeds: CI_SEEDS,
    truth: 'Stable chronic vomiting. The visit acknowledges it; the recheck date is when the vet expects to look again. Asking daily after the visit is the latch EN-9 removes.',
    key: {
      falseCards: [
        { petKey: 'a', lane: 're_raise', sign: 'vomit' },
        { petKey: 'a', lane: 'resolution' },
      ],
      detect: [
        { petKey: 'a', lane: 'chronic', sign: 'vomit', from: { day: 0 }, scoring: 'paired' },
      ],
    },
  },
  {
    id: 'own-vaccine-visit',
    title: 'A vaccine visit in the middle of an unanswered concern',
    category: 'owner',
    rationale:
      'A visit that did NOT carry the concern: annual vaccines on day 50, nothing about the vomiting raised. EN-9: a vaccine visit must not acknowledge a GI concern; any other visit asks "Was the vomiting discussed?".',
    covers: ['visit_without_concern'],
    tz: 'America/Chicago',
    startDate: START,
    days: 180,
    pets: [{ ...cat('Thistle'), feeding: stapleFeeding(), signs: chronic, visits: [{ day: 50, reason: 'Annual vaccines', raises: null, recheckDays: null }], logging: logging() }],
    ciSeeds: CI_SEEDS,
    truth: 'Chronic vomiting, never acknowledged. Standing down after day 50 is a false stand-down.',
    key: {
      falseCards: [
        { petKey: 'a', lane: 'resolution' },
      ],
      detect: [
        { petKey: 'a', lane: 'chronic', sign: 'vomit', from: { day: 0 }, scoring: 'paired' },
      ],
    },
  },
  {
    id: 'own-lapse-flat',
    title: 'After answering, the owner stops logging vomits (and the cat is unchanged)',
    category: 'owner',
    rationale:
      'The lapse the PR-15 row names: after acknowledging, the owner stops logging symptoms only. Meals keep coming in, so the record looks like a logging owner whose cat stopped vomiting. The truth is flat. Silence after an acknowledgement must never read as improvement (absence is not wellness).',
    covers: ['symptom_only_lapse', 'answers_vet_knows'],
    tz: 'America/Chicago',
    startDate: START,
    days: 180,
    pets: [
      {
        ...cat('Bracken'),
        feeding: stapleFeeding(),
        signs: chronic,
        owner: [
          { kind: 'answer_vet_knows', afterEvenings: 3 },
          { kind: 'lapse_after_ack', signs: ['vomit'], delayDays: 0 },
        ],
        logging: logging(),
      },
    ],
    ciSeeds: CI_SEEDS,
    truth: 'Ten vomits a month throughout; none logged after the answer. An improvement or resolution read is a false reassurance.',
    key: {
      falseCards: [
        { petKey: 'a', lane: 'resolution' },
      ],
      detect: [
        { petKey: 'a', lane: 'chronic', sign: 'vomit', from: { day: 0 }, scoring: 'paired' },
      ],
    },
  },
  {
    id: 'own-lapse-doubling',
    title: 'After answering, the owner stops logging vomits, and three weeks later the rate doubles',
    category: 'owner',
    rationale:
      'The same lapse over a real worsening: the vomit rate doubles 21 days after the answer, behind a record that has gone quiet. PR-16 measures "the delay or miss on a true doubling, including behind a logging lapse". No engine can see these vomits; the honest outcome is a miss the scorecard names, and any read of the quiet as good news is a false reassurance on top of it.',
    covers: ['symptom_only_lapse', 'doubling_behind_lapse', 'rate_doubling'],
    tz: 'America/Chicago',
    startDate: START,
    days: 180,
    pets: [
      {
        ...cat('Sedge'),
        feeding: stapleFeeding(),
        signs: chronic,
        effects: [{ kind: 'rate_step', sign: 'vomit', multiplier: 2, from: { afterAck: 21 } }],
        owner: [
          { kind: 'answer_vet_knows', afterEvenings: 3 },
          { kind: 'lapse_after_ack', signs: ['vomit'], delayDays: 0 },
        ],
        logging: logging(),
      },
    ],
    ciSeeds: CI_SEEDS,
    truth: 'The rate doubles 21 days after the answer; nothing after the answer is logged. Any improvement read is a false reassurance; detection is impossible from the record and is scored as a miss.',
    key: {
      falseCards: [
        { petKey: 'a', lane: 'resolution' },
      ],
      detect: [
        { petKey: 'a', lane: 'chronic', sign: 'vomit', from: { day: 0 }, scoring: 'paired' },
        { petKey: 'a', lane: 'worsening', sign: 'vomit', from: { afterAck: 21 }, scoring: 'both_acknowledged' },
      ],
    },
  },
  {
    id: 'own-visit-then-doubling',
    title: 'A visit acknowledges the concern, then the vomiting doubles four weeks later',
    category: 'owner',
    rationale:
      'The re-raise EN-9 exists for: a visit carried the concern, the owner keeps logging, and 28 days after the visit the rate doubles. A watching state that never re-raises misses it; one that re-raises on noise fails the stable cats. The pair with own-visit-with-recheck is the trade.',
    covers: ['visit_carries_concern', 'rate_doubling'],
    tz: 'America/Chicago',
    startDate: START,
    days: 200,
    pets: [
      {
        ...cat('Larkin'),
        feeding: rotatingFeeding(),
        signs: chronic,
        effects: [{ kind: 'rate_step', sign: 'vomit', multiplier: 2, from: { afterAck: 28 } }],
        owner: [{ kind: 'book_visit', afterEvenings: 2, leadDays: [3, 10], carriesConcern: true, recheckDays: null, attendsRecheck: false }],
        logging: logging(),
      },
    ],
    ciSeeds: CI_SEEDS,
    truth: 'The rate doubles 28 days after the visit and stays. Detection is a re-raise on or after that day.',
    key: {
      falseCards: [
        { petKey: 'a', lane: 'resolution' },
      ],
      detect: [
        { petKey: 'a', lane: 'chronic', sign: 'vomit', from: { day: 0 }, scoring: 'paired' },
        { petKey: 'a', lane: 're_raise', sign: 'vomit', from: { afterAck: 28 }, scoring: 'both_acknowledged' },
      ],
    },
  },
  {
    id: 'own-visit-doubling-fixed',
    title: 'A visit acknowledges the concern, and the vomiting doubles on day 90 whatever happened',
    category: 'owner',
    rationale:
      'The paired sibling of own-visit-then-doubling: the same owner and visit, but the doubling is on a fixed day, so two engines run over the same seed face the same pet. This is the scenario an E-6 detection comparison uses for the re-raise; the acknowledgement-anchored one measures EN-9 behaviour only on seeds where both arms asked.',
    covers: ['visit_carries_concern', 'rate_doubling'],
    tz: 'America/Chicago',
    startDate: START,
    days: 200,
    pets: [
      {
        ...cat('Fern'),
        feeding: rotatingFeeding(),
        signs: chronic,
        effects: [{ kind: 'rate_step', sign: 'vomit', multiplier: 2, from: { day: 90 } }],
        owner: [{ kind: 'book_visit', afterEvenings: 2, leadDays: [3, 10], carriesConcern: true, recheckDays: null, attendsRecheck: false }],
        logging: logging(),
      },
    ],
    ciSeeds: CI_SEEDS,
    truth: 'The rate doubles on day 90 and stays, in every arm. Detection is a worsening or re-raise card on or after day 90.',
    key: {
      falseCards: [
        { petKey: 'a', lane: 'resolution' },
      ],
      detect: [
        { petKey: 'a', lane: 'chronic', sign: 'vomit', from: { day: 0 }, scoring: 'paired' },
        { petKey: 'a', lane: 're_raise', sign: 'vomit', from: { day: 90 }, scoring: 'paired' },
      ],
    },
  },
]
