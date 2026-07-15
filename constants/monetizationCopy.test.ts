// Copy-pack invariants as fixtures (spec §7 / §16.1 #3, clinical-guardrails). The
// vomit cap string is the sensitive one: it sits next to a symptom, so the
// never-reassure / no-transaction rules are enforced here as tests, not left to a
// review pass alone.
import {
  EARLY_ACCESS_LABEL,
  careFirstLine,
  foodCapCopy,
  medicationCapCopy,
  vomitCapCopy,
} from './monetizationCopy';

const NO_EXCLAMATION = /!/;
// Reassurance the n=1 invariant forbids near a symptom (absence ≠ wellness).
const REASSURANCE = /\b(fine|okay|ok|no worries|nothing to worry|probably|likely fine|all clear|don't worry)\b/i;
// Transaction words that must never appear next to a symptom (§16.1 #3).
const TRANSACTION = /\b(premium|upgrade|subscribe|pay|unlock|purchase)\b/i;

describe('early-access label (§7.2)', () => {
  it('dual-signals free-now AND may-be-paid-later, no exclamation', () => {
    expect(EARLY_ACCESS_LABEL).toMatch(/free during early access/i);
    expect(EARLY_ACCESS_LABEL).toMatch(/premium/i); // the "later" half is explicit here (a heads-up surface, not a symptom)
    expect(EARLY_ACCESS_LABEL).not.toMatch(NO_EXCLAMATION);
  });
});

describe('care-first line (§7.6)', () => {
  it('uses the pet name possessively when present', () => {
    expect(careFirstLine('Rex')).toMatch(/^Rex's care is never behind this door/);
  });
  it('falls back to a pet-less variant', () => {
    expect(careFirstLine()).toMatch(/^Your pet's care is never behind this door/);
    expect(careFirstLine('  ')).toMatch(/^Your pet's care/);
  });
  it('names the free-forever care surfaces, no exclamation', () => {
    const line = careFirstLine('Rex');
    expect(line).toMatch(/logging, health alerts, trends and the vet report are free/i);
    expect(line).not.toMatch(NO_EXCLAMATION);
  });
});

describe('extraction cap copy (§7.3)', () => {
  it('food: states the photo is saved + when reading resumes', () => {
    expect(foodCapCopy('daily')).toMatch(/photo is saved/i);
    expect(foodCapCopy('daily')).toMatch(/picks back up tomorrow/i);
    expect(foodCapCopy('monthly')).toMatch(/at the start of next month/i);
    expect(foodCapCopy('daily')).not.toMatch(NO_EXCLAMATION);
  });
  it('medication: states the label photo is saved + when reading resumes', () => {
    expect(medicationCapCopy('daily')).toMatch(/label photo is saved/i);
    expect(medicationCapCopy('monthly')).toMatch(/at the start of next month/i);
  });
});

describe('vomit cap copy (§7.3) — the sensitive one', () => {
  const daily = vomitCapCopy('Rex', 'daily');
  const monthly = vomitCapCopy('Rex', 'monthly');

  it('contains NO reassurance (n=1 never reassures on absence)', () => {
    expect(daily).not.toMatch(REASSURANCE);
    expect(monthly).not.toMatch(REASSURANCE);
  });
  it('contains NO transaction word near the symptom (§16.1 #3)', () => {
    expect(daily).not.toMatch(TRANSACTION);
    expect(monthly).not.toMatch(TRANSACTION);
  });
  it('states the record is saved and gives escalation guidance', () => {
    expect(daily).toMatch(/everything you logged is saved/i);
    expect(daily).toMatch(/check in with your vet/i);
    expect(daily).toMatch(/keeps vomiting or seems off/i);
  });
  it('uses the pet name and the right reset wording, no exclamation', () => {
    expect(daily).toMatch(/If Rex keeps vomiting/);
    expect(daily).toMatch(/run tomorrow/i);
    expect(monthly).toMatch(/at the start of next month/i);
    expect(daily).not.toMatch(NO_EXCLAMATION);
  });
  it('falls back to "your pet" when the name is absent', () => {
    expect(vomitCapCopy(null, 'daily')).toMatch(/If your pet keeps vomiting/);
  });
});
