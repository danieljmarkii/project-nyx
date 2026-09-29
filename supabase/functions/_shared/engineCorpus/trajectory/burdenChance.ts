// The burden card's chance rate on PR-15's null pets (Engines v3 PR-14d, CUL-1410).
//
// A MEASUREMENT, reported and never gating: PR-16's scorecard (CUL-1131) owns pass lines, and
// E-4's number (the chance-card budget, CUL-1146) is not ruled yet. This answers the one question
// PR-14d's row asks of the harness: on pets where nothing is wrong, how often does the burden card
// show within 180 days, at the provisional thresholds and at the CUL-583 alternative (a run of 2)?
//
// It calls the shipped `detectBurden` (imported read-only) at 21:00 local each evening, over the
// rows visible at that instant (written, not deleted, not in the future), exactly the rows the
// Signal would read. The card reads no meals (it has no logging floor). For scale, the same
// evenings also run the shipped worsening lane (④, which does need the meals for its logging
// floor), the safety card GAP-6 measured reaching about two in three healthy once-a-month
// vomiters: the burden card's rate is read beside the lane that already speaks on these pets.
//
// Offline, many seeds:
//   deno run --allow-read supabase/functions/_shared/engineCorpus/trajectory/burdenChance.ts 1000
// The CI test (burdenChance.test.ts) runs the scenarios' own `ciSeeds` and a few more, and asserts
// only that the measurement is not vacuous.

import {
  DEFAULT_CONFIG,
  detectBurden,
  detectWorsening,
  type DetectionConfig,
  type MealEvent,
  type SymptomEvent,
} from '../../../generate-signal/detection.ts'
import { NULL_OBSERVER, simulate } from './simulate.ts'
import { NULL_SCENARIOS } from './scenarios.null.ts'
import type { ScenarioSpec } from './spec.ts'

/** E-4's horizon: a chance card is counted when it shows within this many days of the first log. */
export const CHANCE_HORIZON_DAYS = 180

export interface BurdenVariant {
  label: string
  config: DetectionConfig
}

/** The provisional card, each arm alone, and the CUL-583 alternative for the persistence rung. */
export const BURDEN_VARIANTS: readonly BurdenVariant[] = [
  { label: 'shipped (4 in 7 days, or 3 days running)', config: DEFAULT_CONFIG },
  {
    label: 'count arm alone (4 in 7 days)',
    config: { ...DEFAULT_CONFIG, burden: { ...DEFAULT_CONFIG.burden, persistenceMinDays: Infinity } },
  },
  {
    label: 'persistence arm alone (3 days running)',
    config: { ...DEFAULT_CONFIG, reflection: { ...DEFAULT_CONFIG.reflection, burdenMuteMinEpisodes: Infinity } },
  },
  {
    label: 'alternative: 4 in 7 days, or 2 days running',
    config: { ...DEFAULT_CONFIG, burden: { ...DEFAULT_CONFIG.burden, persistenceMinDays: 2 } },
  },
]

export interface ChanceRow {
  scenario: string
  pets: number
  /** Pets that saw the card on at least one evening within the horizon. */
  petsWithCard: number[]
  /** Of those, how many saw its 'today' ask at least once. */
  petsWithToday: number[]
  /** Evenings the card showed, over all pet-evenings in the horizon. */
  cardEvenings: number[]
  petEvenings: number
  /** For scale: pets that saw a vomit worsening card (④, shipped) within the horizon. */
  petsWithWorsening: number
  /** Net new safety exposure: pets that saw the shipped burden card and never a worsening card. */
  petsBurdenOnly: number
}

/** One scenario over `seeds`, every variant at once (the simulation is the expensive part). */
export function measureScenario(scenario: ScenarioSpec, seeds: readonly number[], variants = BURDEN_VARIANTS): ChanceRow {
  const row: ChanceRow = {
    scenario: scenario.id,
    pets: 0,
    petsWithCard: variants.map(() => 0),
    petsWithToday: variants.map(() => 0),
    cardEvenings: variants.map(() => 0),
    petEvenings: 0,
    petsWithWorsening: 0,
    petsBurdenOnly: 0,
  }
  for (const seed of seeds) {
    const r = simulate(scenario, seed, NULL_OBSERVER)
    const evenings = r.shown.slice(0, CHANCE_HORIZON_DAYS)
    for (const pet of scenario.pets) {
      const vomits = r.record.events.filter((e) => e.petKey === pet.key && e.ty === 'vomit')
      const meals = r.record.meals.filter((m) => m.petKey === pet.key)
      let sawWorsening = false
      const saw = variants.map(() => false)
      const sawToday = variants.map(() => false)
      for (const ev of evenings) {
        const T = Date.parse(ev.nowIso)
        const visible: SymptomEvent[] = vomits
          .filter((e) => Date.parse(e.cr) <= T && (e.del === null || Date.parse(e.del) > T) && Date.parse(e.at) <= T)
          .map((e) => ({ id: e.id, type: 'vomit', occurredAt: e.at, occurredAtConfidence: e.cf }))
        const input = {
          pet: { name: pet.name, species: pet.species, dietTrialActive: false },
          symptomEvents: visible,
          mealEvents: [],
          timezone: r.record.tz,
          now: ev.nowIso,
        }
        // ④ is checked every evening until it first fires, so "never saw ④" is exact.
        if (!sawWorsening) {
          const mealEvents: MealEvent[] = meals
            .filter((m) => Date.parse(m.cr) <= T && (m.del === null || Date.parse(m.del) > T) && Date.parse(m.at) <= T)
            .map((m) => ({ id: m.id, occurredAt: m.at, foodItemId: m.foodItemId, primaryProtein: null, intakeRating: m.rating, foodType: 'meal', foodLabel: null }))
          sawWorsening = detectWorsening({ ...input, mealEvents }).some((f) => f.symptomType === 'vomit')
        }
        variants.forEach((v, i) => {
          const card = detectBurden(input, v.config)[0]
          if (!card) return
          saw[i] = true
          if (card.tier === 'today') sawToday[i] = true
          row.cardEvenings[i]++
        })
        row.petEvenings++
      }
      row.pets++
      if (sawWorsening) row.petsWithWorsening++
      if (saw[0] && !sawWorsening) row.petsBurdenOnly++
      saw.forEach((s, i) => { if (s) row.petsWithCard[i]++ })
      sawToday.forEach((s, i) => { if (s) row.petsWithToday[i]++ })
    }
  }
  return row
}

const pct = (n: number, d: number) => (d === 0 ? '—' : `${((100 * n) / d).toFixed(1)}%`)

/** The report, one table per variant: share of null pets that saw the card within 180 days. */
export function formatReport(rows: readonly ChanceRow[], seedsPerScenario: number, variants = BURDEN_VARIANTS): string {
  const out: string[] = [`Burden card chance rate on PR-15's null pets, ${seedsPerScenario} seeds per scenario, ${CHANCE_HORIZON_DAYS}-day horizon.`]
  const allPets = rows.reduce((a, r) => a + r.pets, 0)
  out.push(
    '',
    '## For scale: the shipped vomit worsening card (④) on the same pets',
    '',
    'The last column is the net new safety exposure: pets that saw the shipped burden card and never a worsening card.',
    '',
    '| scenario | saw a worsening card | burden card, never worsening |',
    '|---|---|---|',
    ...rows.map((r) => `| ${r.scenario} | ${pct(r.petsWithWorsening, r.pets)} | ${pct(r.petsBurdenOnly, r.pets)} |`),
    `| **all null pets** | ${pct(rows.reduce((a, r) => a + r.petsWithWorsening, 0), allPets)} | ${pct(rows.reduce((a, r) => a + r.petsBurdenOnly, 0), allPets)} |`,
  )
  variants.forEach((v, i) => {
    out.push('', `## ${v.label}`, '', '| scenario | pets | saw the card | saw "call today" | card evenings |', '|---|---|---|---|---|')
    let pets = 0
    let saw = 0
    let today = 0
    let worst = { id: '', share: -1 }
    for (const r of rows) {
      out.push(`| ${r.scenario} | ${r.pets} | ${pct(r.petsWithCard[i], r.pets)} | ${pct(r.petsWithToday[i], r.pets)} | ${pct(r.cardEvenings[i], r.petEvenings)} |`)
      pets += r.pets
      saw += r.petsWithCard[i]
      today += r.petsWithToday[i]
      const share = r.petsWithCard[i] / r.pets
      if (share > worst.share) worst = { id: r.scenario, share }
    }
    out.push(`| **all null pets** | ${pets} | ${pct(saw, pets)} | ${pct(today, pets)} | |`, '', `Worst scenario: ${worst.id} (${pct(worst.share * 1000, 1000)}).`)
  })
  return out.join('\n')
}

if (import.meta.main) {
  const n = Number(Deno.args[0] ?? '200')
  const seeds = Array.from({ length: n }, (_, i) => 10_000 + i)
  const rows = NULL_SCENARIOS.map((s) => measureScenario(s, seeds))
  console.log(formatReport(rows, n))
}
