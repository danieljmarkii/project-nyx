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

/** What a Signal row takes from its screen (CUL-1569): the title and counts of a ready screen,
 *  or that the screen SETS THE FINDING ASIDE (a masking span beside a compared window, CUL-1440).
 *  A set-aside screen states no count, so neither does its row: Home never draws the falling
 *  pair the screen it opens refuses to (the adversarial pass on #1053). */
export type SignalRowScreen =
  | ({ setAside: false } & Pick<SignalScreenModel, 'title' | 'composed' | 'trialLineShown'>)
  | { setAside: true };

/**
 * The screen's own model for a Signal row (CUL-1569, GC-4 PR 2): the SAME loader the door
 * opens (`loadSignalScreen`), for the same pet, identity and clock, so the row's numbers are
 * the screen's by construction rather than by a second count that could drift. Null when the
 * screen is missing, withheld or unsupported (Home's own predicates drop those rows), or the
 * read failed — the row then keeps the finding's own words, which is what it drew before the
 * read answered. Never rejects.
 */
export async function loadSignalRowScreen(petId: string, finding: SignalFinding, nowMs: number = Date.now()): Promise<SignalRowScreen | null> {
  try {
    const load = await loadSignalScreen(petId, foldIdentity(finding), nowMs);
    if (load.status === 'set_aside') return { setAside: true };
    if (load.status !== 'ready') return null;
    // The loader finds the finding by identity in the pet's cache, which may have been
    // rewritten since the zone read it: a row only takes words for the finding it draws.
    if (load.model.finding.type !== finding.type) return null;
    return { setAside: false, title: load.model.title, composed: load.model.composed, trialLineShown: load.model.trialLineShown };
  } catch (e) {
    console.warn('[signal-row] screen read failed:', e);
    return null;
  }
}
