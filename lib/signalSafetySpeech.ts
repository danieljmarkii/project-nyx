import type { CachedFinding } from './signal';
import { careStateQuietsAsk } from './careState';
import { foldIdentity } from './signalFold';
import { incidentAskLevel, incidentRedFlagSentenceAt, intakeSentenceAt, safetyAskLevel } from './signalCopy';

// GAP-13 (CUL-1566; PMD-21 ruled (a), PM 2026-10-04): an escalation that reaches a focused
// Home is SPOKEN once. "Safety is silent" means no sound and no haptic, never no speech: the
// arrival moment withholds its tap and its sentence on a safety finding (CUL-601 §4), and
// before this nothing took their place, so a blind owner heard a photo's verdict and never
// the more serious thing.
//
// What this module decides, so the zone only has to ask it: WHICH findings speak, and WHAT
// is said. When and whether Home may speak is the screen's (`components/dayRow/rowSpeech.ts`).
//
// THE WORDS ARE THE FINDING'S OWN. The spoken string is the pet's name and the phrased
// sentence (`cached.text`, the server's sentence, which the shipped card prints), verbatim:
// no "new", no "good news", no softening, nothing the record did not already say
// (clinical-guardrails: the speech never reassures and never adds to the card). Under
// Design v2 a counted row may re-compose its count from a fresher local record, so the
// spoken number can trail the row's; it is never higher and never softer.
//
// A pet named like a word in its own sentence ("Vet", "Today") reads as already named and
// gets no lead: anonymous, never the wrong pet.

/**
 * The findings whose arrival is spoken: the safety class, and only while it still asks.
 * A stand-down line is a sentence about absence, never an escalation; a concern the owner
 * told the vet about (`with_vet` / `recheck_booked`) has had its ask quieted by the server
 * and arriving quieted is not an escalation either (EN-9).
 */
export function speakableSafety(findings: CachedFinding[]): CachedFinding[] {
  return findings.filter(
    // The stand-down check comes first: the marker is typed insight-class today, and this
    // keeps it out should a cache ever carry it otherwise.
    (f) => f.finding.type !== 'stood_down' && f.finding.priorityClass === 'safety' && !careStateQuietsAsk(f.finding),
  );
}

/** The identity a spoken arrival is remembered by: the fold's, so a re-rank is not new. */
export function safetySpeechIdentity(cached: CachedFinding): string {
  return foldIdentity(cached.finding);
}

/**
 * CUL-2604: how loud a spoken card's ask is, inside its identity. A card that keeps its identity
 * while its ask gets louder (an eating card going to a call today, a burden card from "soon" to
 * "today", a chronicity or worsening tier firming, a red-flag read moving to a call) is said again.
 */
export function safetySpeechLevel(cached: CachedFinding): number {
  const f = cached.finding;
  return f.type === 'incident_red_flag' ? incidentAskLevel(f) : safetyAskLevel(f);
}

/** What the zone remembers of a set it has said: each identity, with the ask level last heard. */
export type HeardSafety = ReadonlyMap<string, number>;

/**
 * One answered set against what was heard before. A card arrives when its identity is new, or when
 * its ask is louder than the level last heard for that identity (CUL-2604). An identity that left
 * the set is forgotten, so a concern that comes back arrives again. A softer ask is never an
 * arrival; it lowers what is held, so a later rise is said again. `heard` is what to hold if the
 * arrivals are NOT said now; the zone marks them heard (`markHeard`) only once it speaks them.
 */
export function safetyArrivals(
  prior: HeardSafety,
  safety: CachedFinding[],
): { arriving: CachedFinding[]; heard: Map<string, number> } {
  // Identities are unique within one set by construction (`findingIdentity.engine.test.ts`).
  const heard = new Map<string, number>();
  const arriving: CachedFinding[] = [];
  for (const f of safety) {
    const id = safetySpeechIdentity(f);
    const level = safetySpeechLevel(f);
    const before = prior.get(id);
    if (before === undefined || level > before) {
      arriving.push(f);
      // Unsaid, it keeps what it held (or nothing), so it stays an arrival until it is said.
      if (before !== undefined) heard.set(id, before);
    } else {
      // The same ask or a softer one: held at the level now showing.
      heard.set(id, level);
    }
  }
  return { arriving, heard };
}

/** The held set once `arriving` has been said: each at the level it was said at. */
export function markHeard(heard: ReadonlyMap<string, number>, arriving: CachedFinding[]): Map<string, number> {
  const next = new Map(heard);
  for (const f of arriving) next.set(safetySpeechIdentity(f), safetySpeechLevel(f));
  return next;
}

function namesPet(sentence: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(sentence);
}

/**
 * What is said: each arriving sentence in rank order, always carrying the pet's name and
 * never adding it where a sentence already says it. Most phrased sentences open on the name
 * ("Biscuit has vomited 4 times this week — worth a call to your vet today."), so those are
 * said as they are, and a set that never names the pet is led by the name. Null when there
 * is nothing to say.
 */
export function safetyArrivalSpoken(
  petName: string | null,
  arriving: CachedFinding[],
  /** The clock a call now is read against (PR-30c, CUL-1739): past its first day it is said in
   *  its dated form, as the screen shows it. Absent keeps the server's sentence. */
  nowMs?: number,
): string | null {
  const named = petName?.trim() ? petName.trim() : null;
  const sentences = [...arriving]
    .sort((a, b) => a.rank - b.rank)
    // CUL-2680: an intake card past D3 since its run is said in the floor's form, as the card shows it.
    .map((f) => (named ? intakeSentenceAt(f.finding, named, incidentRedFlagSentenceAt(f.finding, named, f.text, nowMs), nowMs) : f.text).trim())
    .filter((t) => t.length > 0);
  if (sentences.length === 0) return null;
  const name = petName?.trim() ?? '';
  const joined = sentences.map((t) => (/[.?]$/.test(t) ? t : `${t}.`)).join(' ');
  if (!name || sentences.some((t) => namesPet(t, name))) return joined;
  // A spoken lead opens the utterance, so `useSignal`'s 'your pet' fallback is capitalised.
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}: ${joined}`;
}
