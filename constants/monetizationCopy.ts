// The monetization copy pack (spec §7). Centralized so the whole set is reviewed
// as one — nyx-voice, Designer, clinical-guardrails/Dr. Chen (vomit) and
// pm-feature-review all read this file, and the two extraction surfaces share the
// early-access label + care-first line verbatim instead of drifting.
//
// House rules baked in: warm, specific, no exclamation marks, second-person owner;
// no reassurance and no transaction word ("Premium"/"upgrade") anywhere near a
// symptom (§16.1 #3); the record-is-saved fact stated plainly on every cap state.
// Punctuation matches the spec §7.3 verbatim (straight apostrophes, em-dashes).

// D-M6 early-access label (§7.2) — dual-signals free-NOW and may-be-paid-LATER.
// Same string on both extraction surfaces. Retired in T3-E when the gate flips.
export const EARLY_ACCESS_LABEL =
  'Label reading is free during early access — it may become part of Premium later.';

// B-333 care-first commitment line (§7.6). Its first surface is the extraction
// cap states (spec §16). Possessive pet name when we have one; the pet-less variant
// matches the Settings/About wording.
export function careFirstLine(petName?: string | null): string {
  const name = petName?.trim();
  const subject = name ? `${name}'s care` : "Your pet's care";
  return `${subject} is never behind this door — logging, health alerts, trends and the vet report are free, always.`;
}

// §7.3 extraction cap states. Daily/monthly differ only in when reading resumes.
export function foodCapCopy(cap: 'daily' | 'monthly'): string {
  const resume = cap === 'monthly' ? 'at the start of next month' : 'tomorrow';
  return `You've hit today's limit for label reading. The photo is saved — fill in what you know below, and reading picks back up ${resume}.`;
}

export function medicationCapCopy(cap: 'daily' | 'monthly'): string {
  const resume = cap === 'monthly' ? 'at the start of next month' : 'tomorrow';
  return `You've hit today's limit for label reading. The label photo is saved — fill in the details below, and reading picks back up ${resume}.`;
}

// §7.3 vomit read cap — the sensitive one. No reassurance, no transaction word,
// the record-is-saved fact plain, and the escalation guidance present. Reviewed by
// clinical-guardrails + Dr. Chen. Deliberately carries NO B-333/care-first line
// (that line is money-adjacent copy and must never sit next to a symptom, §16.1 #3).
export function vomitCapCopy(petName: string | null | undefined, cap: 'daily' | 'monthly'): string {
  const name = petName?.trim() || 'your pet';
  const resume = cap === 'monthly' ? 'at the start of next month' : 'tomorrow';
  return `Today's photo reads are used up, so this read will run ${resume}. Everything you logged is saved. If ${name} keeps vomiting or seems off, don't wait for the read — check in with your vet.`;
}

// §7.3 stool read cap (B-247) — the sibling of the vomit cap, same sensitive class.
// No reassurance, no transaction word, record-is-saved plain, escalation guidance
// present. The symptom wording is stool-specific ("keeps having diarrhea"). Carries
// NO B-333/care-first line (money-adjacent copy never sits next to a symptom, §16.1 #3).
export function stoolCapCopy(petName: string | null | undefined, cap: 'daily' | 'monthly'): string {
  const name = petName?.trim() || 'your pet';
  const resume = cap === 'monthly' ? 'at the start of next month' : 'tomorrow';
  return `Today's photo reads are used up, so this read will run ${resume}. Everything you logged is saved. If ${name} keeps having diarrhea or seems off, don't wait for the read — check in with your vet.`;
}
