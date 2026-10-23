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
  recordAskCopy,
  recordOffBesideCall,
  recordOffBody,
  recordVetLine,
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

// CUL-1835 — the record frames, verbatim from mock round 4 §3.
describe('the vomit and stool record', () => {
  it('the card keeps panel 1 rules: Claude named, the read cannot tell you the pet is fine, a Without it line', () => {
    for (const kind of ['vomit', 'stool'] as const) {
      for (const pet of PETS) {
        const c = recordAskCopy(kind, pet);
        const all = Object.values(c).join(' ');
        expect(c.body).toMatch(/^Claude, an AI, can say what's in /);
        expect(c.body).toMatch(/It isn't a vet, and it can't tell you (Mochi|your pet) is fine\.$/);
        expect(c.disclosure).toMatch(/^Claude is made by Anthropic, which never trains its AI on any of it\./);
        expect(c.without).toMatch(/^Without it, the photo is kept but not read\. Checks that need no photo/);
        expect(c.vetLine).toMatch(/^Whatever you choose, if /);
        expect(all).not.toMatch(/null|undefined|!/);
        expect(all).not.toMatch(/worth a call/i);
      }
    }
  });

  // The vet line never names blood alone (PM, 2026-10-12); stool stays event neutral,
  // because it also renders over a normal stool.
  it('the vet lines, word for word', () => {
    expect(recordVetLine('vomit', 'Mochi')).toBe('If Mochi keeps vomiting, brings up something unusual, or seems unwell, call your vet.');
    expect(recordVetLine('stool', 'Mochi')).toBe("If Mochi's stool stays unusual, has something odd in it, or Mochi seems unwell, call your vet.");
    expect(recordVetLine('stool', null)).toBe("If your pet's stool stays unusual, has something odd in it, or your pet seems unwell, call your vet.");
    for (const kind of ['vomit', 'stool'] as const) {
      expect(recordVetLine(kind, 'Mochi')).not.toMatch(/blood|diarrh/i);
    }
    expect(recordAskCopy('vomit', 'Mochi').vetLine).toBe('Whatever you choose, if Mochi keeps vomiting, brings up something unusual, or seems unwell, call your vet.');
  });

  // Each "Without it" names a check that really runs without a photo: analyze-vomit's
  // repeated vomiting and analyze-stool's `repeated_loose_stool`.
  it('the photoless check each card names', () => {
    expect(recordAskCopy('vomit', 'Mochi').without).toContain('like repeated vomiting, still work.');
    expect(recordAskCopy('stool', 'Mochi').without).toContain('like repeated loose stool, still work.');
  });

  it('F and G: a status, never a verdict', () => {
    expect(recordOffBody('Mochi')).toBe("Mochi's photo is saved but wasn't read. If you turn AI reading on, you can send this photo to Claude, an AI, for a read.");
    expect(recordOffBody(null)).toMatch(/^Your pet's photo/);
    expect(recordOffBesideCall('Mochi')).toBe("AI reading is off. Mochi's log alone is reason to call your vet.");
  });
});
