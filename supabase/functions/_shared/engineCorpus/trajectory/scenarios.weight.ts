// Weights: cadence, scale noise and the legacy profile number (Engines v3 PR-15, CUL-508).
//
// EN-8's pass lines (PR-16) are false cards on stable pets and detection delay by weigh-in
// cadence. So the weight pets vary exactly those: how often the owner weighs, how noisy the
// scale is, and whether the oldest number has a date or a source at all. A kitchen scale with
// a cat on it is taken as 0.1 kg (one sd), a clinic scale as 0.02 kg; both are assumptions a
// sweep should move, stated here so nobody mistakes them for measurements.

import { CI_SEEDS, logging, stapleFeeding, START } from './scenarios.shared.ts'
import type { ScenarioSpec } from './spec.ts'

const cat = (name: string) => ({ key: 'a', name, species: 'cat' as const })
const quietVomit = [{ sign: 'vomit' as const, rate: { perMonth: 1 } }]

export const WEIGHT_SCENARIOS: ScenarioSpec[] = [
  {
    id: 'wt-null-sparse-home',
    title: 'A stable cat weighed at home every six to ten weeks',
    category: 'weight',
    rationale:
      'The realistic cadence for an owner with a kitchen scale: irregular, every six to ten weeks. The weight is flat at 4.2 kg; the scale is not. Three readings 0.2 kg apart look like a 5% loss.',
    covers: ['sparse_weigh_ins'],
    tz: 'America/Chicago',
    startDate: START,
    days: 365,
    pets: [{ ...cat('Pebble'), feeding: stapleFeeding(), signs: quietVomit, weight: { startKg: 4.2, trend: { kind: 'flat' }, homeSd: 0.1, cadence: { kind: 'home', everyDays: [42, 70], firstDay: 10 } }, logging: logging() }],
    ciSeeds: CI_SEEDS,
    truth: 'The true weight never changes. A weight-loss card is a false card.',
  },
  {
    id: 'wt-loss-weekly',
    title: 'Losing 1% a week from day 60, weighed every week',
    category: 'weight',
    rationale: 'The deep dive\'s weight case (brief §7 A2): 1% a week on a noisy home scale, weighed weekly. The best a home weigher does; the baseline for detection delay.',
    covers: ['weight_loss'],
    tz: 'America/Chicago',
    startDate: START,
    days: 240,
    pets: [{ ...cat('Rowan'), feeding: stapleFeeding(), signs: quietVomit, weight: { startKg: 4.8, trend: { kind: 'loss', pctPerWeek: 1, fromDay: 60 }, homeSd: 0.1, cadence: { kind: 'home', everyDays: [7, 7], firstDay: 3 } }, logging: logging() }],
    ciSeeds: CI_SEEDS,
    truth: 'True weight falls 1% a week from day 60 (about 5% by day 95). Days to detect count from 60.',
  },
  {
    id: 'wt-loss-sparse',
    title: 'The same loss, weighed every six to ten weeks',
    category: 'weight',
    rationale: 'The same cat and loss at the sparse cadence: the difference in detection delay between this and the weekly cat is the cost of cadence EN-8 must report.',
    covers: ['weight_loss', 'sparse_weigh_ins'],
    tz: 'America/Chicago',
    startDate: START,
    days: 240,
    pets: [{ ...cat('Linden'), feeding: stapleFeeding(), signs: quietVomit, weight: { startKg: 4.8, trend: { kind: 'loss', pctPerWeek: 1, fromDay: 60 }, homeSd: 0.1, cadence: { kind: 'home', everyDays: [42, 70], firstDay: 10 } }, logging: logging() }],
    ciSeeds: CI_SEEDS,
    truth: 'True weight falls 1% a week from day 60. Days to detect count from 60.',
  },
  {
    id: 'wt-clinic-only-loss',
    title: 'Weighed only at the clinic, twice, losing throughout',
    category: 'weight',
    rationale:
      'An owner with no scale: the only weights are clinic weigh-ins at an annual check (day 20) and a vaccine visit (day 140), neither of which raised the symptoms. Two accurate readings four months apart, 0.5% a week of loss between them.',
    covers: ['clinic_only_weights', 'weight_loss', 'visit_without_concern'],
    tz: 'America/Chicago',
    startDate: START,
    days: 180,
    pets: [
      {
        ...cat('Birch'),
        feeding: stapleFeeding(),
        signs: quietVomit,
        weight: { startKg: 5.0, trend: { kind: 'loss', pctPerWeek: 0.5, fromDay: 0 }, homeSd: 0.1, cadence: { kind: 'clinic_only' } },
        visits: [
          { day: 20, reason: 'Annual check', raises: null, recheckDays: null },
          { day: 140, reason: 'Annual vaccines', raises: null, recheckDays: null },
        ],
        logging: logging(),
      },
    ],
    ciSeeds: CI_SEEDS,
    truth: 'True weight falls 0.5% a week from day 0 (about 8.6% by day 140). Neither visit acknowledged any concern.',
  },
  {
    id: 'wt-legacy-profile-true-loss',
    title: 'A profile weight with no date, displaced by a much lower weigh-in',
    category: 'weight',
    rationale:
      'BRK-11: a 5.1 kg profile weight entered when the pet was created, eight months before, with no source and no date of its own. The first weigh-in, on day 90, reads about 4.3 kg, and 072 keeps the 5.1 as a displacement. The loss is real: the cat weighed 5.1 at creation and has been losing since.',
    covers: ['legacy_weight_no_source'],
    tz: 'America/Chicago',
    startDate: START,
    days: 200,
    pets: [
      {
        ...cat('Sparrow'),
        feeding: stapleFeeding(),
        signs: quietVomit,
        weight: {
          startKg: 4.45,
          trend: { kind: 'loss', pctPerWeek: 0.3, fromDay: 0 },
          homeSd: 0.1,
          cadence: { kind: 'home', everyDays: [42, 70], firstDay: 90 },
          profile: { kg: 5.1, petCreatedDaysBefore: 240, trueAtCreationKg: 5.1 },
        },
        logging: logging(),
      },
    ],
    ciSeeds: CI_SEEDS,
    truth: 'The profile 5.1 kg was true at creation; the cat has lost about 16% by day 90. A rule that can confirm the old number would detect it; one that cannot stays silent (PMD-9).',
  },
  {
    id: 'wt-legacy-profile-guess',
    title: 'A guessed profile weight, displaced by an accurate one',
    category: 'weight',
    rationale:
      'The counterexample to the case above: the owner guessed 4.5 kg at sign-up for a 4.0 kg cat, and the first weigh-in reads 4.0. The displacement looks exactly like an 11% loss and there is none. The two scenarios cannot be told apart from the record, which is the PMD-9 decision in one pair.',
    covers: ['legacy_weight_no_source'],
    tz: 'America/Chicago',
    startDate: START,
    days: 200,
    pets: [
      {
        ...cat('Tinder'),
        feeding: stapleFeeding(),
        signs: quietVomit,
        weight: {
          startKg: 4.0,
          trend: { kind: 'flat' },
          homeSd: 0.1,
          cadence: { kind: 'home', everyDays: [42, 70], firstDay: 90 },
          profile: { kg: 4.5, petCreatedDaysBefore: 240, trueAtCreationKg: 4.0 },
        },
        logging: logging(),
      },
    ],
    ciSeeds: CI_SEEDS,
    truth: 'No weight change at any time; the profile number was a guess. A weight-loss card is a false card.',
  },
]
