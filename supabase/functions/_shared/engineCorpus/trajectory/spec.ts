// The trajectory corpus: how a scenario is written down (Engines v3 PR-15, CUL-508).
//
// Every number a scenario sets is a claim about pets or owners, so each scenario carries a
// `rationale` saying where its numbers come from and what it exists to test. A number with
// no reason beside it is a number someone could tune without noticing.

import type { Sign, SyntheticSpecies } from './types.ts'

export interface FoodSpec {
  id: string
  protein: string
  /** Extra proteins on the label (the hidden secondary exposure, B-351). Defaults to none. */
  alsoContains?: string[]
  foodType: 'dry' | 'wet' | 'treat'
}

export type FeedingSpec =
  | {
      kind: 'meals'
      /** Local hours of the day's meals, e.g. [7.5, 18]. Each is jittered by up to 40 minutes. */
      hours: number[]
      /**
       * How a meal's food is chosen.
       *   weighted: each meal draws from `foods` by `weight` (a staple feeder: 0.9 / 0.1).
       *   daily:    one food per day, drawn uniformly (a rotating feeder).
       */
      choose: 'weighted' | 'daily'
      foods: (FoodSpec & { weight: number })[]
      /** Treats given on top, per day (probability), and which food they are. */
      treat?: { perDay: number; food: FoodSpec }
      /**
       * Event-dependent feeding: after the owner logs a vomit, they switch to `food` for `days`.
       * Owners change food BECAUSE the pet vomited (Lipsitch 2010; the evidence pack's negative
       * controls), which puts the bland food after the vomits, never before them.
       */
      switchAfterLoggedVomit?: { food: FoodSpec; days: number }
    }
  | {
      kind: 'free_choice'
      /** The bowl that is always down (a feeding arrangement, not logged meals). */
      bowl: FoodSpec
      /** A logged wet meal on top, at these local hours. */
      wetHours: number[]
      wet: FoodSpec
    }

export interface RateSpec {
  /** Mean episodes per 30-day month under the null. */
  perMonth: number
  /** Gamma shape of a per-week rate multiplier (mean 1). Omitted: plain Poisson. Smaller is burstier. */
  weeklyDispersion?: number
  /** An AR(1) wander on the log rate: `sd` per day, pulled back with half-life `halfLifeDays`. */
  wander?: { sd: number; halfLifeDays: number }
}

export type Timing =
  | 'any' // uniform over the 24 hours (the null)
  | 'postprandial' // 15 minutes to 2 hours after a meal (an injected phenotype)
  | 'early_morning' // 04:00 to 07:00 local, the empty-stomach bilious pattern (an injected phenotype)

export interface SignSpec {
  sign: Sign
  rate: RateSpec
  timing?: Timing
}

/** When an effect starts: a fixed day, or relative to the owner's first acknowledgement. */
export type EffectStart = { day: number } | { afterAck: number }

export type Effect =
  | { kind: 'rate_step'; sign: Sign; multiplier: number; from: EffectStart }
  /** On a day the pet ate `protein`, the sign's rate is multiplied by `rr`, timed after that meal. */
  | { kind: 'protein_reaction'; sign: Sign; protein: string; rr: number }
  /** A self-limiting flare: the rate times `multiplier` for `days`, then back to baseline. */
  | { kind: 'flare'; sign: Sign; multiplier: number; fromDay: number; days: number }
  /** Garbage raids: on a raid day, 2 to 3 vomits and a diarrhoea inside 12 hours. */
  | { kind: 'indiscretion'; perMonth: number }
  /** A self-limiting infectious cough (kennel cough): coughs per day over a span. */
  | { kind: 'kennel_cough'; fromDay: number; days: number; perDay: number }

export interface TrialSpec {
  startDay: number
  targetDays: number
  food: FoodSpec
  /**
   *   responder:     the vomit rate falls to `residual` of baseline from `onsetDays` in.
   *   non_responder: nothing changes.
   * A trial started at a peak is a non-responder beside a `flare` effect that ends on its own.
   */
  response: { kind: 'responder'; residual: number; onsetDays: number } | { kind: 'non_responder' }
}

export interface WeightSpec {
  startKg: number
  trend: { kind: 'flat' } | { kind: 'loss'; pctPerWeek: number; fromDay: number }
  /** Scale noise (kg, one sd). A kitchen scale holding a cat: about 0.1. */
  homeSd: number
  cadence:
    | { kind: 'home'; everyDays: [number, number]; firstDay: number }
    | { kind: 'clinic_only' }
    | { kind: 'none' }
  /**
   * The profile weight entered when the pet was created, with no date and no source. `kg` may
   * differ from the true weight at creation (`trueAtCreationKg`) when the owner guessed.
   */
  profile?: { kg: number; petCreatedDaysBefore: number; trueAtCreationKg: number }
}

export interface LoggingSpec {
  /** Chance a symptom episode is logged at all, at the start. */
  pSymptom: number
  /** Chance a meal is logged, at the start. */
  pMeal: number
  /** Chance a logged meal carries an intake rating. */
  pRate: number
  /** Logging decays with this half-life (days), meals and symptoms alike. Omitted: no attrition. */
  attritionHalfLifeDays?: number
  /** Of logged vomits and diarrhoeas, the share found later rather than witnessed. */
  pFound: number
  /** The same share for an episode between 23:00 and 07:00 local, while the owner sleeps. Default 0.6. */
  pFoundOvernight?: number
  /** Of logged episodes, the share logged twice. */
  pDuplicate: number
  /** Of duplicates, the share the owner deletes (soft) afterwards. */
  pDuplicateCleanedUp: number
  /** Of logged rows, the share back-filled 6 to 36 hours later. */
  pBackfill: number
  /** Of logged vomits, the share photographed (a photo read is written). */
  pPhoto: number
  /** Of kennel-cough coughs, the share the owner logs as a vomit (the end-of-fit gag). An assumption. */
  pGagAsVomit?: number
  /** Two-pet homes: a found pile is logged to this pet, whoever produced it (MFU-5). */
  foundPilesGoTo?: string
}

/** What the owner does in response to the cards they were shown. */
export type OwnerPolicy =
  | { kind: 'answer_vet_knows'; afterEvenings: number }
  | {
      kind: 'book_visit'
      afterEvenings: number
      leadDays: [number, number]
      /** Whether the visit carried the concern (it was on the appointment's list). */
      carriesConcern: boolean
      /** Days to the recheck the vet set (vet_visits.next_visit_at), or null. */
      recheckDays: number | null
      attendsRecheck: boolean
    }
  /** After the owner's first acknowledgement, these signs stop being logged. Meals continue. */
  | { kind: 'lapse_after_ack'; signs: Sign[]; delayDays: number }

/** A visit that happens whatever the engine shows (a vaccine visit, an annual check). */
export interface ScheduledVisit {
  day: number
  reason: string
  /** A concern the owner raised at it. Null: nothing about the symptoms came up. */
  raises: Sign | null
  recheckDays: number | null
}

export interface PetSpec {
  key: string
  name: string
  species: SyntheticSpecies
  feeding: FeedingSpec
  signs: SignSpec[]
  effects?: Effect[]
  trial?: TrialSpec
  weight?: WeightSpec
  logging: LoggingSpec
  owner?: OwnerPolicy[]
  visits?: ScheduledVisit[]
  /**
   * Photo-read red flags: the first TRUE vomit on or after each day is logged, witnessed and
   * photographed with blood, whatever the logging probability, attrition or a lapse. The
   * scenario tests what the engine does with a read, not whether the owner captured it; a
   * seed whose pet does not vomit again before the end has no flag (truth.redFlags says).
   */
  redFlagDays?: number[]
}

/**
 * The PR-15 row's list, as tags. `REQUIRED_COVERAGE` (index.ts) is this union, and a test
 * asserts every tag is carried by a scenario whose generated rows actually show it.
 */
export type CoverageTag =
  // null pets
  | 'staple_feeder'
  | 'rotating_feeder'
  | 'grazer'
  | 'vomit_1_per_month'
  | 'vomit_3_per_month'
  | 'overdispersed'
  | 'wandering_rate'
  | 'logging_attrition'
  | 'found_piles'
  | 'two_cat_home'
  | 'dog'
  | 'species_other'
  | 'dietary_indiscretion'
  | 'trial_at_peak'
  | 'event_dependent_feeding'
  // injected problems
  | 'enteropathy_onset'
  | 'protein_reaction'
  | 'postprandial'
  | 'early_morning'
  | 'rate_doubling'
  | 'red_flag'
  | 'weight_loss'
  | 'trial_responder'
  | 'trial_non_responder'
  | 'cough_and_vomit'
  | 'kennel_cough_gag'
  // weights
  | 'sparse_weigh_ins'
  | 'clinic_only_weights'
  | 'legacy_weight_no_source'
  // owner behaviour
  | 'answers_vet_knows'
  | 'visit_carries_concern'
  | 'visit_without_concern'
  | 'recheck_date'
  | 'symptom_only_lapse'
  | 'doubling_behind_lapse'

/** The engine's lanes, as the answer key names them. */
export type Lane =
  | 'food' // a food or protein culprit card
  | 'timing' // a post-prandial, time-of-day or timing-story card
  | 'worsening' // the sign is getting worse
  | 'chronic' // the sign is ongoing and worth a vet visit
  | 'trial' // a read of the diet trial's effect
  | 'weight' // a weight-loss card
  | 'red_flag' // a visual red flag from a photo read
  | 'resolution' // an improving or resolved read (a reassurance)
  | 're_raise' // the concern raised again after the owner acknowledged it

/**
 * The machine-readable answer key. `falseCards`: a card of this lane (and sign) on this pet
 * is false whenever it shows. `detect`: what a correct engine finds, from when. Lanes named in
 * neither are not scored on this scenario.
 *
 * `scoring` is the rule the harness applies when it compares two engines over the same seeds:
 *   paired             the truth is the same in both arms, so every seed counts;
 *   both_acknowledged  the effect is anchored to the owner's acknowledgement, which only
 *                      happens if the engine asked, so the truth itself differs between arms.
 *                      Score only seeds where both arms reached the acknowledgement, and report
 *                      an arm that never asked as its own failure. Never an E-6 detection proof.
 */
export interface TruthKey {
  falseCards: { petKey: string; lane: Lane; sign?: Sign }[]
  detect: { petKey: string; lane: Lane; sign?: Sign; protein?: string; from: EffectStart; scoring: 'paired' | 'both_acknowledged' }[]
}

export interface ScenarioSpec {
  id: string
  title: string
  category: 'null' | 'injected' | 'weight' | 'owner'
  /** Where the numbers come from and what the scenario exists to test. */
  rationale: string
  covers: CoverageTag[]
  /** IANA zone the owner lives in. */
  tz: string
  /** Local date of day 0. */
  startDate: string
  days: number
  pets: PetSpec[]
  /** The committed CI pets: these seeds, under the null observer, are what the pin holds. */
  ciSeeds: number[]
  /**
   * The answer key in words, for the scorecard's reader. Null scenarios say what must NOT
   * be found; injected ones say what is there, from when.
   */
  truth: string
  /** The same answer key, for the harness. Tests hold it consistent with the effects. */
  key: TruthKey
}
