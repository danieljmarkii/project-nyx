// "Part of a pattern": a calm read that is evidence for a live Home finding (EN-3 remainder
// ⑨, CUL-1515; K2 ruled 2026-09-28 in CUL-1389; docs/nyx-incident-tiers-requirements.md §2,
// §4, §11; mock `docs/culprit-incident-tiers-mockups.html` §02 and §03).
//
// A single vomit read as "Keep an eye out" can still be one of several behind a finding Home
// is tracking. K2 ruled the fourth word DRAWN AT RENDER, never stored: it is not a tier, it is
// a `logged` read seen beside the finding it belongs to, so it can never go stale against Home
// (a September read pointing at a concern Home stood down in October was the stored option's
// failure). It is drawn on exactly two surfaces, the record and the Signal screen's gallery,
// and never in History, the month, chart text or the shown-tier log (spec §4).
//
// ── ONE POPULATION FOR BOTH SURFACES (C-4) ──────────────────────────────────────
// No finding carries event ids: the phone knows a finding's episodes only as the Signal
// screen draws them (`lib/signalScreen.ts`: the finding's sign, inside the drawn weeks, after
// the engine's re-log collapse, bounded by today). That set IS the evidence set here, for
// both surfaces. The gallery draws it directly; the record asks the same loader the screen
// runs (`loadSignalScreen`) and looks for its own row among the episodes, so the record says
// "Part of a pattern" exactly when the finding's gallery would put the read under it, and
// the door it carries opens that screen. Every gate the screen keeps (Home's visibility
// stack, the not-eating register, a masked or set-aside finding, an unsupported type) is
// therefore the record's gate too, and a finding the screen will not draw marks nothing.
// Which findings count as TRACKING, and so whose drawn episodes are their evidence, is
// `findingTracksPattern` (the frequency findings; never one about improvement, a timing
// claim, a correlation, a photo red flag or the stood-down line).
//
// ── WHICH WAY IT FAILS ───────────────────────────────────────────────────────────
// The word is louder than "Keep an eye out" (a dashed pale rose against grey) and never a
// call. Every failure here (no cache, a read that throws, a finding the screen refuses)
// leaves the read saying "Keep an eye out", the shipped words: nothing in this file can make
// a read calmer than it was, and nothing in it touches a call or `not_enough_to_say`.
// Earlier-rule `monitor` reads never take it either: K2 names `logged`, and the change is
// dark until `engines_v3_en3` is seeded (CUL-1407), because nothing stamps a `logged` read
// before then.
//
// These words live here, not in `lib/incidentTierWords.ts`, because that map is in Ask's
// shipping closure (C-26) and Ask never says this word (spec §2: "not used"): a client-only
// word in the map would redeploy Ask for nothing.

import { signalScreenHref } from './signalRoute';
import { readSignalCacheOrLast } from './signal';
import { foldIdentity } from './signalFold';
import { signalChartSymptomOf } from './signalWindows';
import type { TierDisplay } from './incidentTierWords';
import { findingTracksPattern, loadSignalScreen, type SignalScreenEpisodes, type SignalScreenLoad } from './signalScreen';

export const PATTERN_WORDS = {
  /** The chip on the record's card. */
  label: 'Part of a pattern',
  /** A narrow tile's word. The phrase is already short; the accessible label is the same. */
  short: 'Part of a pattern',
  /** The record's door to the finding (mock §02): the only link, never a restatement. */
  door: 'See what Home is tracking',
  /** What a screen reader hears when such a read lands, after "{Pet}'s read: " (mock §04,
   *  spoken through `readLandedLine`): "Nyx's read: part of a pattern Home is tracking." */
  spoken: 'part of a pattern Home is tracking',
} as const;

/** The record's line under the chip (spec §2): "Home is tracking Nyx's vomiting, and this one
 *  is part of it." It never restates Home's ask or quotes a care state, so it cannot
 *  contradict Home (mock §02's caption, GAP-11). `noun` is the screen's own lower-case noun. */
export function patternActionLine(petName: string | null | undefined, noun: string): string {
  const name = typeof petName === 'string' && petName.trim().length > 0 ? `${petName.trim()}'s` : 'your pet’s';
  return `Home is tracking ${name} ${noun}, and this one is part of it.`;
}

/** The words a read takes beside a finding: "Part of a pattern" on a new-rule `logged` read
 *  that is in a tracked finding's evidence, and nothing else. A call, `not_enough_to_say`, an
 *  earlier-rule `monitor` and a read with no verdict keep their own words. */
export function isPatternRead(verdict: TierDisplay | null | undefined, inTrackedEvidence: boolean): boolean {
  return verdict === 'logged' && inTrackedEvidence;
}

/** Every record row in the screen's episodes: each tile's row and its bout's rows, and each
 *  photoless episode's bout. A re-log that joined a bout is the same episode (the tile is
 *  read across the whole bout), so the record of any of its rows is in the evidence. */
export function evidenceIdsOf(episodes: SignalScreenEpisodes | null | undefined): ReadonlySet<string> {
  const ids = new Set<string>();
  if (!episodes) return ids;
  for (const t of episodes.tiles) {
    ids.add(t.eventId);
    for (const id of t.boutIds ?? []) ids.add(id);
  }
  for (const p of episodes.photoless) {
    ids.add(p.eventId);
    for (const id of p.boutKey.split('|')) if (id) ids.add(id);
  }
  return ids;
}

export interface PatternMembership {
  /** The finding's identity, the Signal screen's route key. */
  identity: string;
  /** The screen's lower-case noun for the finding's sign ("vomiting"). */
  noun: string;
  /** The door's destination: the finding's own screen, for the record's pet. */
  href: string;
}

/**
 * The tracked finding whose evidence holds this record, or null. Findings are asked in Home's
 * rank order, and the first whose screen draws this row wins. Only findings whose chart counts
 * the record's own sign are loaded (a correlation counts no episodes on the phone and marks
 * nothing, `signalChartSymptomOf`). Never throws: a failure is null, which leaves the read in
 * its shipped words.
 *
 * `petId` is the RECORD's pet (C-9), never the active pet. `load` is the screen's own loader,
 * injectable for tests only.
 */
export async function readPatternMembership(
  input: { petId: string; eventId: string; eventType: string; nowMs?: number },
  load: (petId: string, identity: string, nowMs: number) => Promise<SignalScreenLoad> = loadSignalScreen,
): Promise<PatternMembership | null> {
  const nowMs = input.nowMs ?? Date.now();
  let row;
  try {
    ({ row } = await readSignalCacheOrLast(input.petId));
  } catch (e) {
    console.warn('[incident-pattern] signal cache read failed:', e);
    return null;
  }
  const candidates = [...(row?.findings ?? [])]
    .sort((a, b) => a.rank - b.rank)
    .filter((f) => findingTracksPattern(f.finding) && signalChartSymptomOf(f.finding) === input.eventType);
  const asked = new Set<string>();
  for (const c of candidates) {
    const identity = foldIdentity(c.finding);
    if (asked.has(identity)) continue;
    asked.add(identity);
    // Each finding on its own: one that cannot load (offline with a pet the list lacks, an
    // unanswered register) must not hide a lower-ranked one the gallery would mark (C-4).
    let screen: SignalScreenLoad;
    try {
      screen = await load(input.petId, identity, nowMs);
    } catch (e) {
      console.warn('[incident-pattern] finding load failed:', e);
      continue;
    }
    if (screen.status !== 'ready') continue;
    const { model } = screen;
    if (!model.noun || !model.episodes?.tracksPattern) continue;
    if (!evidenceIdsOf(model.episodes).has(input.eventId)) continue;
    return { identity, noun: model.noun, href: signalScreenHref(input.petId, identity) };
  }
  return null;
}
