// The "recurring undefined" class, closed structurally (CUL-676 PR-3a, 2026-08-27 review).
//
// Release order (client mirrors before engine — HR-2) is PROCESS: it makes an unknown
// symptomType rare, not impossible. A finding comes off the server payload and the 24h
// `ai_signals` cache, so an installed build can always meet a type its union has never
// heard of — a later wave's leaf, exactly how a cough finding would have rendered
// literal "recurring undefined" on the cross-pet safety banner before this PR. Every
// label read in lib/signalCopy.ts routes through `symptomWord`, whose fallback is the
// humanized token — the `incidentFlagPhrase` cache-defense precedent, one shelf over.
//
// This suite pins BOTH halves: the W1 leaves render their real words, and an
// out-of-union type renders plainly on every consumer that speaks a symptom name.

import type { SignalSymptomType, SymptomChronicityFinding } from './signal';
import { bannerCopy, evidenceText, phoneScript, validateBannerPhrasing } from './signalCopy';

const chronicity = (over: Partial<SymptomChronicityFinding> = {}): SymptomChronicityFinding => ({
  type: 'symptom_chronicity',
  priorityClass: 'safety',
  symptomType: 'vomit',
  episodeCount: 20,
  spanDays: 42,
  activeWeeks: 6,
  symptomDays: 18,
  daysSinceLastEpisode: 0,
  firstOnsetIso: '2026-05-15T08:00:00.000Z',
  tier: 'firm',
  windowDays: 56,
  ...over,
});

// A W2-era type this build's union does not carry — the cast is the point: it is how a
// server payload actually arrives at a client that shipped before the leaf existed.
const OUT_OF_UNION = 'labored_breathing' as SignalSymptomType;

describe('W1 leaves speak their real words (the PR-3a mirror)', () => {
  it('a cough chronicity finding reads "recurring coughing" on the cross-pet banner', () => {
    const c = bannerCopy(chronicity({ symptomType: 'cough' }), 'Juniper');
    expect(c.text).toBe('Juniper has had recurring coughing since May — worth a look.');
    expect(validateBannerPhrasing(c.text)).toBe(true);
  });

  it('sneeze carries its own word through the evidence text', () => {
    const text = evidenceText(chronicity({ symptomType: 'sneeze' }), 'Juniper');
    expect(text).toContain('sneezing');
    expect(text).not.toContain('undefined');
  });
});

describe('an out-of-union symptomType renders plainly, never "undefined"', () => {
  it('cross-pet safety banner: humanized token, phrasing screen still passes', () => {
    const c = bannerCopy(chronicity({ symptomType: OUT_OF_UNION }), 'Juniper');
    expect(c.text).toContain('recurring labored breathing');
    expect(c.text).not.toContain('undefined');
    expect(c.text).not.toContain('_');
    expect(validateBannerPhrasing(c.text)).toBe(true);
  });

  it('expanded evidence text: humanized token, never "undefined"', () => {
    const text = evidenceText(chronicity({ symptomType: OUT_OF_UNION }), 'Juniper');
    expect(text).toContain('labored breathing');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('labored_breathing');
  });

  it('the vet phone script names the sign with the humanized token', () => {
    const facts = phoneScript(chronicity({ symptomType: OUT_OF_UNION }), 'Juniper');
    expect(facts).not.toBeNull();
    const sign = facts!.find((f) => f.label === 'Sign');
    expect(sign?.value).toBe('labored breathing');
  });
});
