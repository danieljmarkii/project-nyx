import type { CachedFinding } from './signal';
import { careStateQuietsAsk } from './careState';
import { foldIdentity } from './signalFold';

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
export function safetyArrivalSpoken(petName: string | null, arriving: CachedFinding[]): string | null {
  const sentences = [...arriving]
    .sort((a, b) => a.rank - b.rank)
    .map((f) => f.text.trim())
    .filter((t) => t.length > 0);
  if (sentences.length === 0) return null;
  const name = petName?.trim() ?? '';
  const joined = sentences.map((t) => (/[.?]$/.test(t) ? t : `${t}.`)).join(' ');
  if (!name || sentences.some((t) => namesPet(t, name))) return joined;
  // A spoken lead opens the utterance, so `useSignal`'s 'your pet' fallback is capitalised.
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}: ${joined}`;
}
