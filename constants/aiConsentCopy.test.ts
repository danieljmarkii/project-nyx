import {
  consentPetName,
  consentSheetCopy,
  offLine,
  onSinceLine,
  readBenefit,
  settingsDisclosure,
  SETTINGS_WITHOUT,
  whatsSentSections,
  AI_NAMED,
} from './aiConsentCopy';

// Panel 1's rules (CUL-1833), pinned on the shipped strings rather than remembered:
// every ask says the read can't tell the owner the pet is fine, every ask carries a
// "Without it" line naming what still works, and Claude and Anthropic are named.

const PETS = ['Mochi', null] as const;

describe('every ask keeps panel 1 rules', () => {
  for (const pet of PETS) {
    for (const door of ['label', 'ask'] as const) {
      it(`${door} door, pet ${pet ?? 'fallback'}`, () => {
        const c = consentSheetCopy(door, pet);
        const all = [c.headline, ...c.benefits.flatMap((b) => [b.title, b.detail]), c.disclosureBefore, c.disclosureAfter, c.without].join(' ');
        expect(all).toMatch(/can't tell you (Mochi|your pet) is fine/);
        expect(c.without).toMatch(/^Without it, /);
        expect(c.without).toContain('Checks that need no photo, like repeated vomiting, still work.');
        expect(`${c.disclosureBefore}${AI_NAMED}${c.disclosureAfter}`).toContain('Claude, an AI made by Anthropic');
        expect(all).not.toContain('!');
        // "Worth a call" promised a verdict the engine never gives (F1).
        expect(all).not.toMatch(/worth a call/i);
      });
    }
  }

  it('Settings carries the same rules', () => {
    expect(readBenefit('Mochi').detail).toContain("It can't tell you Mochi is fine.");
    expect(SETTINGS_WITHOUT).toContain('Checks that need no photo');
    expect(settingsDisclosure('Mochi', false, false)).toContain(AI_NAMED);
    expect(offLine('Mochi', false)).toContain('Checks that need no photo still work and can tell you to call your vet.');
  });
});

describe('the pet name', () => {
  it('names a single pet, and falls back for none or several', () => {
    expect(consentPetName(['Mochi'])).toBe('Mochi');
    expect(consentPetName([])).toBeNull();
    expect(consentPetName(['Mochi', 'Pixel'])).toBeNull();
    expect(consentPetName(['  '])).toBeNull();
  });

  it('the fallback reads as a sentence, never "null"', () => {
    const c = consentSheetCopy('label', null);
    const all = JSON.stringify(c) + JSON.stringify(whatsSentSections(null));
    expect(all).not.toMatch(/null|undefined/);
    expect(c.benefits[1].title).toBe("A read on your pet's photos");
    expect(whatsSentSections(null)[2].title).toBe("Your pet's patterns");
  });
});

describe('Settings', () => {
  it('names Ask only where it is on (panel 1 condition 3)', () => {
    expect(settingsDisclosure('Mochi', true, false)).toContain('Ask sends your question');
    expect(settingsDisclosure('Mochi', false, false)).not.toContain('Ask');
    expect(offLine('Mochi', true)).toContain('Ask stays closed.');
    expect(offLine('Mochi', false)).not.toContain('Ask');
  });

  it('the Off disclosure is conditional, never a claim that something is being sent', () => {
    expect(settingsDisclosure('Mochi', false, true)).toMatch(/^When AI reading is on, Culprit sends/);
  });

  it('On since names a local calendar day with its year', () => {
    const iso = new Date(2026, 9, 14, 12, 0, 0).toISOString();
    expect(onSinceLine(iso)).toBe('On since 14 Oct 2026.');
    expect(onSinceLine('not a date')).toBe('On.');
  });
});
