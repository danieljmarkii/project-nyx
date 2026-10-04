// The Home Signal card's data (D2-3 · CUL-1065): the title, the weekly bars and the one
// line, for the lead finding — read from the same modules the screen reads, through the
// same window predicate, so the card's bars and the screen's are one chart (`§06`: "the
// card's bars and its line must read the same weeks and sum to the sentence").
//
// The reads are the screen's own (`lib/signalScreen.ts`), minus the verdicts and the
// doses the card never shows. Nothing here reads the active pet: the zone hands the pet
// the findings belong to.

import { loadSignalScreen, readGateLoggedDays, readSignalEpisodes, readLoggedDays, readSignalTrial, type SignalScreenModel } from './signalScreen';
import type { SignalFinding } from './signal';
import { foldIdentity } from './signalFold';
import { riseKeptSentence } from './screenMasking';
import { trialSoFarClause } from './signalHomeLine';
import type { CachedFinding } from './signal';
import { symptomWord } from './signalCopy';
import { signalTitle } from './signalTitle';
import { signalTrialWindowFor } from './signalTrialAnchor';
import { signalChartSymptomOf, signalWeeks, weekLine, type SignalTrialWindow } from './signalWindows';
import { weekLineWithheld, type NotEatingFact, type WeekLineWithheld } from './signalWithhold';
import type { WeeklyBucketsModel } from './chartModels';
import { toLocalDayKey } from './utils';
import { usePetStore } from '../store/petStore';

export interface SignalLeadModel {
  title: string;
  /** Null for a finding that counts no symptom (the card then carries the title alone). */
  weekly: WeeklyBucketsModel | null;
  line: string | null;
  /** Why the line dropped the earlier window's count, or null when it prints the pair (CUL-1216). */
  lineWithheld: WeekLineWithheld | null;
  noun: string | null;
  trial: SignalTrialWindow | null;
}

/**
 * Everything the lead card draws for one finding of one pet. `notEating` is the pet's
 * not-eating register as the zone holds it (Home's fail-closed reading, OR'd with an
 * `intake_decline` in the Signal): a falling vomit week pair is never printed beside it, and
 * neither is a falling pair the density gate withholds (CUL-1216, BRK-4 / BRK-6).
 *
 * `generatedAt` is the cache row's (CUL-1360): a trial finding counted over a trial since
 * replaced is titled and charted in its own day, never in the running trial's window.
 * Required, so no caller can leave the anchor out and fall back to the running trial.
 */
export async function loadSignalLead(
  petId: string,
  cached: CachedFinding,
  notEating: NotEatingFact,
  generatedAt: string | null,
  nowMs: number = Date.now(),
): Promise<SignalLeadModel> {
  const today = toLocalDayKey(new Date(nowMs));
  const pet = usePetStore.getState().pets.find((p) => p.id === petId) ?? null;
  const symptom = signalChartSymptomOf(cached.finding);
  const [trialRead, episodes, logged, gateLoggedDays] = await Promise.all([
    // A failed trial read is UNANSWERED, not "no trial" (C-12): the card still draws, and a
    // falling line withholds (CUL-1216 re-review, N1). No pet means no trial to ask about.
    pet
      ? readSignalTrial({ id: pet.id, name: pet.name, species: pet.species, sex: pet.sex }, nowMs).catch((e) => {
          console.warn('[signal-lead] trial read failed:', e);
          return 'unanswered' as const;
        })
      : Promise.resolve(null),
    symptom ? readSignalEpisodes(petId, symptom) : Promise.resolve([]),
    readLoggedDays(petId),
    // The gate's own days (the engine's set, never the chart's coverage — CUL-1216 F3); a
    // failed read is none, which withholds a falling line rather than printing it.
    symptom ? readGateLoggedDays(petId, symptom).catch(() => [] as string[]) : Promise.resolve([] as string[]),
  ]);
  const trialUnanswered = trialRead === 'unanswered';
  const trial = signalTrialWindowFor(cached.finding, { generatedAt, trial: trialRead === 'unanswered' ? null : trialRead });
  const title = signalTitle(cached.finding, trial);
  if (!symptom) return { title, weekly: null, line: null, lineWithheld: null, noun: null, trial };
  const weekly = signalWeeks({
    finding: cached.finding,
    today,
    trial,
    episodeDays: episodes.map((e) => e.dayKey),
    loggedDays: logged.loggedDays,
    recordStart: logged.recordStart,
  });
  const lineWithheld = weekLineWithheld(weekly, { finding: cached.finding, symptom, notEating, gateLoggedDays, trial, trialUnanswered });
  return { title, weekly, line: weekLine(weekly, lineWithheld != null), lineWithheld, noun: symptomWord(symptom), trial };
}

/**
 * The running trial alone, for a Signal row that names it (CUL-1270): the trial card's
 * title reads the local trial's identity and day, exactly as the lead card and the screen
 * do, so the row and the screen it opens print the same day. Null when there is no pet,
 * no trial, or the read failed — the title then falls back to the cache's own day. The row
 * passes it through `signalTrialWindowFor` before titling (CUL-1360).
 */
export async function loadSignalRowTrial(petId: string, nowMs: number = Date.now()): Promise<SignalTrialWindow | null> {
  const pet = usePetStore.getState().pets.find((p) => p.id === petId) ?? null;
  if (!pet) return null;
  return readSignalTrial({ id: pet.id, name: pet.name, species: pet.species, sex: pet.sex }, nowMs).catch((e) => {
    console.warn('[signal-row] trial read failed:', e);
    return null;
  });
}

/** What a Signal row takes from its screen (CUL-1569):
 *  - `ready`: the title and counts the screen states;
 *  - `set_aside`: the screen sets the finding aside (a masking span beside a compared window,
 *    CUL-1440) and states no comparing count, so neither does its row — except a trial that
 *    ROSE over a masked baseline zero, whose trial count the screen keeps (`riseKeptSentence`),
 *    and the row keeps it too (the accusing number is never the one dropped, C-37);
 *  - `unanswered`: the read failed, or the screen had nothing to show for this finding. The
 *    masking rule fails CLOSED on a failed read (`screenMasking.ts`), so the row cannot know a
 *    falling pair is safe to print and an insight row prints none (the adversarial passes on
 *    #1053). Home never draws a falling pair the screen it opens would refuse to. */
export type SignalRowScreen =
  | ({ kind: 'ready' } & Pick<SignalScreenModel, 'title' | 'composed' | 'trialLineShown'>)
  | { kind: 'set_aside'; keptLine: string | null }
  | { kind: 'unanswered' };

/**
 * The screen's own model for a Signal row (CUL-1569, GC-4 PR 2): the SAME loader the door
 * opens (`loadSignalScreen`), for the same pet, identity and clock, so the row's numbers are
 * the screen's by construction rather than by a second count that could drift. Never rejects.
 */
export async function loadSignalRowScreen(petId: string, finding: SignalFinding, nowMs: number = Date.now()): Promise<SignalRowScreen> {
  try {
    const load = await loadSignalScreen(petId, foldIdentity(finding), nowMs);
    if (load.status === 'set_aside') {
      const kept = finding.type === 'trial_response' ? riseKeptSentence(finding, symptomWord('vomit')) : null;
      return { kind: 'set_aside', keptLine: kept && load.lines.includes(kept) ? trialSoFarClause(finding) : null };
    }
    if (load.status !== 'ready') return { kind: 'unanswered' };
    // The loader finds the finding by identity in the pet's cache, which may have been
    // rewritten since the zone read it: a row only takes words for the finding it draws.
    if (load.model.finding.type !== finding.type) return { kind: 'unanswered' };
    return { kind: 'ready', title: load.model.title, composed: load.model.composed, trialLineShown: load.model.trialLineShown };
  } catch (e) {
    console.warn('[signal-row] screen read failed:', e);
    return { kind: 'unanswered' };
  }
}

