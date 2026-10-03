// The Signal observer for PR-15's corpus (Engines v3 PR-16, EN-1, CUL-1131).
//
// `simulate(scenario, seed, observer)` calls the observer at 21:00 local each evening; this one
// runs the SHIPPED Signal pipeline over each pet's rows as of that instant (syntheticRows.ts),
// carries the previous evening's cache row forward as the prior (so stand-downs mint as they
// would in production), and returns the cards Home shows. The cadence is nightly at 21:00; in
// production the Signal regenerates on app open and after a log, so stand-down timing can differ.
//
// THE CARE RECORD (EN-9, PR-23) is read as the shell reads it: only while `engines_v3_en9` is on,
// with the logging facts beside it (syntheticRows.ts `careAt` / `careFactsAt` carry the mapping).
// Flag off, both are what the shell passes flag off (EMPTY_CARE_RECORD and null), so the
// flag-off arm is the shipped engine unchanged.
//
// THE ASK IS HOME'S, NEVER A TEXT MATCH (CUL-1131, pinned 2026-09-26). Which vet ask a card
// carries is read from `signalHomeAsk` (lib/signalHomeLine.ts), the function Home renders its
// ask from, handed in as `askOf`: the runner passes `signalHomeLine(f)?.ask`, so Home's own gate
// (an ask only on a safety row, none on an untitled type or a stand-down) applies here too.
// It is injected rather than imported because lib/'s closure does not load under Deno
// (extensionless imports reaching expo modules); the jest runner (scripts/engine-scorecard/)
// passes the real one. The replay's regex over the rendered sentence
// (signalReplay.deno.ts `askRegister`) is not used here. On Design v2, Home asks only on safety
// rows, so a benign card carries `ask: 'none'` even where its screen mentions a vet.
//
// The observer is STATEFUL (the prior row per pet), so make one per simulation.

import { runSignalPipeline, templatePayload, type SignalPayload } from '../pipeline.ts'
import type { Finding } from '../detection.ts'
import type { EngineFlags } from '../../_shared/engineFlags.ts'
import type { AskRegister, Observer, ShownCard, Sign } from '../../_shared/engineCorpus/trajectory/types.ts'
import { SIGNS } from '../../_shared/engineCorpus/trajectory/types.ts'
import { careAt, careFactsAt, rowsAt } from './syntheticRows.ts'
import { EMPTY_CARE_RECORD } from '../careState.ts'
import { isEngineKeyOn } from '../../_shared/engineFlags.ts'

/** A card as the scorecard reads it: PR-15's ShownCard plus the fields detection is scored on. */
export interface ScoredCard extends ShownCard {
  /** The finding's tier ('firm' / 'soft' / 'today' / 'early' / 'established' …), or null. */
  tier: string | null
  /** A food card's protein cluster (canonical keys); [] on every other card. */
  proteins: string[]
  /** A reflection card's direction ('flat' / 'improving'), or null. */
  direction: string | null
}

/** The flag-off arm: what every account not on an allowlist runs. */
export const FLAG_OFF: EngineFlags = { on: [], readOk: true }


/**
 * Home's ask sentence → the register PR-15's owner model reacts to. EXACT strings only: a new
 * ask that is not listed throws, so the table cannot silently file it under 'none'. The jest
 * runner asserts every string `signalHomeAsk` can return is here.
 */
export const ASK_REGISTER: Readonly<Record<string, AskRegister>> = {
  'worth a call to your vet': 'call',
  'worth a call to your vet today': 'call',
  'worth booking a vet visit': 'book_visit',
  'worth booking a vet visit soon': 'book_visit',
  'worth a word with your vet': 'word_with_vet',
  'worth keeping an eye on, and a word with your vet if it carries on': 'word_with_vet',
}

export function registerOfAsk(ask: string | null): AskRegister {
  if (ask === null) return 'none'
  const r = ASK_REGISTER[ask]
  if (!r) throw new Error(`registerOfAsk: an ask the scorecard has no register for: "${ask}"`)
  return r
}

export type AskOf = (finding: Finding) => string | null

export interface SignalObserverOptions {
  askOf: AskOf
  engineFlags?: EngineFlags
}

function signOf(f: Finding): Sign | null {
  const rec = f as unknown as Record<string, unknown>
  const s = (rec.symptomType ?? rec.incidentType ?? null) as string | null
  return s !== null && (SIGNS as readonly string[]).includes(s) ? (s as Sign) : null
}

/** One card, as Home shows it. Stand-down markers are lines, not cards, and are left out. */
export function cardOf(petKey: string, f: Finding, askOf: AskOf): ScoredCard {
  const rec = f as unknown as Record<string, unknown>
  return {
    petKey,
    findingType: f.type,
    sign: signOf(f),
    ask: registerOfAsk(askOf(f)),
    priorityClass: String(f.priorityClass),
    tier: (rec.tier ?? null) as string | null,
    proteins: f.type === 'food_symptom_correlation' ? [...f.proteins] : [],
    direction: (rec.direction ?? null) as string | null,
  }
}

export function makeSignalObserver(opts: SignalObserverOptions): Observer {
  const flags = opts.engineFlags ?? FLAG_OFF
  const en9 = isEngineKeyOn(flags, 'engines_v3_en9')
  const prior = new Map<string, { payload: SignalPayload; generatedAt: string }>()
  return (view) => {
    const T = Date.parse(view.nowIso)
    const cards: ScoredCard[] = []
    for (const pet of view.record.pets) {
      const last = prior.get(pet.key)
      const result = runSignalPipeline({
        rows: rowsAt(view.record, pet.key, T),
        incompletePulls: [],
        prior: last ? { findings: last.payload.findings, generatedAt: last.generatedAt, engineFlags: flags.on } : null,
        nowMs: T,
        engineFlags: flags,
        careRecord: en9 ? careAt(view.record, pet.key, T) : EMPTY_CARE_RECORD,
        careContextFacts: en9 ? careFactsAt(view.record, pet.key, T) : null,
      })
      prior.set(pet.key, { payload: templatePayload(result), generatedAt: view.nowIso })
      for (const r of result.findings) cards.push(cardOf(pet.key, r.finding, opts.askOf))
    }
    return cards
  }
}
