// The Home Signal card's data (D2-3 · CUL-1065): the title, the weekly bars and the one
// line, for the lead finding — read from the same modules the screen reads, through the
// same window predicate, so the card's bars and the screen's are one chart (`§06`: "the
// card's bars and its line must read the same weeks and sum to the sentence").
//
// The reads are the screen's own (`lib/signalScreen.ts`), minus the verdicts and the
// doses the card never shows. Nothing here reads the active pet: the zone hands the pet
// the findings belong to.

import { readSignalEpisodes, readLoggedDays, readSignalTrial } from './signalScreen';
import type { CachedFinding } from './signal';
import { symptomWord } from './signalCopy';
import { signalTitle } from './signalTitle';
import { signalSymptomOf, signalWeeks, weekLine, type SignalTrialWindow } from './signalWindows';
import type { WeeklyBucketsModel } from './chartModels';
import { toLocalDayKey } from './utils';
import { usePetStore } from '../store/petStore';

export interface SignalLeadModel {
  title: string;
  /** Null for a finding that counts no symptom (the card then carries the title alone). */
  weekly: WeeklyBucketsModel | null;
  line: string | null;
  noun: string | null;
  trial: SignalTrialWindow | null;
}

/** Everything the lead card draws for one finding of one pet. */
export async function loadSignalLead(petId: string, cached: CachedFinding, nowMs: number = Date.now()): Promise<SignalLeadModel> {
  const today = toLocalDayKey(new Date(nowMs));
  const pet = usePetStore.getState().pets.find((p) => p.id === petId) ?? null;
  const symptom = signalSymptomOf(cached.finding);
  const [trial, episodes, logged] = await Promise.all([
    pet ? readSignalTrial({ id: pet.id, name: pet.name, species: pet.species, sex: pet.sex }, nowMs).catch(() => null) : Promise.resolve(null),
    symptom ? readSignalEpisodes(petId, symptom) : Promise.resolve([]),
    readLoggedDays(petId),
  ]);
  const title = signalTitle(cached.finding, trial);
  if (!symptom) return { title, weekly: null, line: null, noun: null, trial };
  const weekly = signalWeeks({
    finding: cached.finding,
    today,
    trial,
    episodeDays: episodes.map((e) => e.dayKey),
    loggedDays: logged.loggedDays,
    recordStart: logged.recordStart,
  });
  return { title, weekly, line: weekLine(weekly), noun: symptomWord(symptom), trial };
}

/**
 * The running trial alone, for a Signal row that names it (CUL-1270): the trial card's
 * title reads the local trial's identity and day, exactly as the lead card and the screen
 * do, so the row and the screen it opens print the same day. Null when there is no pet,
 * no trial, or the read failed — the title then falls back to the cache's own day.
 */
export async function loadSignalRowTrial(petId: string, nowMs: number = Date.now()): Promise<SignalTrialWindow | null> {
  const pet = usePetStore.getState().pets.find((p) => p.id === petId) ?? null;
  if (!pet) return null;
  return readSignalTrial({ id: pet.id, name: pet.name, species: pet.species, sex: pet.sex }, nowMs).catch((e) => {
    console.warn('[signal-row] trial read failed:', e);
    return null;
  });
}
