import { proteinProvenanceLine, proteinSummaryLine } from './ProteinDisclosure';

const PANEL = 'Duck, duck meal, chicken by-product meal, brewers rice, salmon oil.';
const READ = { proteins: 0.9 };

// The single property that matters across every case below: NO string may claim
// a food has nothing else in it unless the D10 gate says the panel was actually
// read. Absence of secondaries in an unread set means "nobody looked", and
// rendering it as "nothing else" is reassurance-on-absence — the
// `clinical-guardrails` asymmetry, on the surface a vet trusts most.
describe('proteinSummaryLine (the library-row form)', () => {
  it('lists the secondaries behind the primary when the panel was read', () => {
    expect(proteinSummaryLine({
      proteins: ['duck', 'chicken', 'salmon'],
      ingredientsNotes: PANEL,
      extractionConfidence: READ,
    })).toBe('Duck · also contains chicken, salmon');
  });

  it('may say "nothing else" ONLY on a read panel', () => {
    expect(proteinSummaryLine({
      proteins: ['duck'], ingredientsNotes: PANEL, extractionConfidence: READ,
    })).toBe('Duck · nothing else on the label');
  });

  it('says the list was not read instead of implying a single-protein food', () => {
    // The exact B-413 provenance: a front-of-pack read yields ['duck'], byte
    // identical to a real single-protein panel read.
    expect(proteinSummaryLine({
      proteins: ['duck'], ingredientsNotes: null, extractionConfidence: { proteins: 1 },
    })).toBe('Duck · ingredient list not read');
    // …and a manual food, where no extraction ever ran.
    expect(proteinSummaryLine({
      proteins: ['duck'], ingredientsNotes: PANEL, extractionConfidence: null,
    })).toBe('Duck · ingredient list not read');
  });

  it('stays silent for an unread food with no captured proteins', () => {
    // A library of legacy manual foods must not become a wall of "not read".
    expect(proteinSummaryLine({
      proteins: [], ingredientsNotes: null, extractionConfidence: null,
    })).toBeNull();
  });

  it('reports a read panel that genuinely lists no animal protein', () => {
    // Rare but real: a hydrolysed or vegetarian diet. Only sayable because the
    // panel was read.
    expect(proteinSummaryLine({
      proteins: [], ingredientsNotes: PANEL, extractionConfidence: READ,
    })).toBe('No animal proteins on the label');
  });

  it('never claims completeness on any un-gated input', () => {
    const ungated = [
      { proteins: ['duck'], ingredientsNotes: null, extractionConfidence: null },
      { proteins: ['duck'], ingredientsNotes: '', extractionConfidence: READ },
      { proteins: ['duck'], ingredientsNotes: PANEL, extractionConfidence: { proteins: 0.1 } },
      { proteins: ['duck', 'chicken'], ingredientsNotes: 'Ingredients:', extractionConfidence: READ },
    ];
    for (const input of ungated) {
      expect(proteinSummaryLine(input)).not.toMatch(/nothing else|no animal proteins/i);
    }
  });
});

describe('proteinProvenanceLine (the under-the-picker form)', () => {
  it('always says something — silence is the ambiguity D10 was ruled on', () => {
    expect(proteinProvenanceLine({
      proteins: ['duck'], ingredientsNotes: PANEL, extractionConfidence: READ,
    })).toBe('Read from the ingredient list on the label.');
  });

  it('warns that the captured set may be partial when the panel was not read', () => {
    expect(proteinProvenanceLine({
      proteins: ['duck'], ingredientsNotes: null, extractionConfidence: null,
    })).toContain('there may be more proteins');
  });

  it('says the proteins are unknown when nothing was captured at all', () => {
    expect(proteinProvenanceLine({
      proteins: [], ingredientsNotes: null, extractionConfidence: null,
    })).toContain("aren't known yet");
  });

  it('carries no exclamation and no reassurance (nyx-voice + guardrails)', () => {
    const lines = [
      proteinProvenanceLine({ proteins: ['duck'], ingredientsNotes: PANEL, extractionConfidence: READ }),
      proteinProvenanceLine({ proteins: ['duck'], ingredientsNotes: null, extractionConfidence: null }),
      proteinProvenanceLine({ proteins: [], ingredientsNotes: null, extractionConfidence: null }),
    ];
    for (const line of lines) {
      expect(line).not.toContain('!');
      expect(line.toLowerCase()).not.toMatch(/safe|fine|all clear|no problem/);
    }
  });
});
