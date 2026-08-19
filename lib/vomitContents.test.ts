import { hasBile, hasFood, hasHair } from './vomitContents';

// lib/vomitContents.ts — the shared vomit-contents presence leaves (CUL-226 / B-759).
//
// These three atoms were hand-duplicated inside generate-signal/photoComposition.ts
// (`readFlags`) and generate-report/report.ts (`classifyVomitContents`). This suite pins
// the leaf semantics both callers depend on, so a future token edit that would silently
// diverge the Signal card from the vet report fails HERE instead. The two callers' own
// suites (photoComposition.test.ts, report.test.ts) remain the regression guard that the
// extraction changed no behaviour on either side.
//
// TIMEZONE HONESTY (B-514): nothing here reads a clock — the predicates are pure token
// membership over a string[]. The non-UTC CI job exercises this file unchanged.

describe('hasFood — retained (undigested / partially-digested) food', () => {
  it('is true for either food token', () => {
    expect(hasFood(['undigested_food'])).toBe(true);
    expect(hasFood(['partially_digested_food'])).toBe(true);
    expect(hasFood(['hair', 'partially_digested_food'])).toBe(true);
  });

  it('is false when neither food token is present', () => {
    expect(hasFood(['hair'])).toBe(false);
    expect(hasFood(['bile', 'foam'])).toBe(false);
    expect(hasFood([])).toBe(false);
  });

  it('treats a null (illegible) read as absence, never a crash', () => {
    expect(hasFood(null)).toBe(false);
  });
});

describe('hasHair — the hairball marker', () => {
  it('is true only when the hair token is present', () => {
    expect(hasHair(['hair'])).toBe(true);
    expect(hasHair(['undigested_food', 'hair'])).toBe(true);
    expect(hasHair(['undigested_food'])).toBe(false);
    expect(hasHair([])).toBe(false);
  });

  it('treats a null read as absence', () => {
    expect(hasHair(null)).toBe(false);
  });
});

describe('hasBile — fuses the authoritative bile_present tristate with a contents token', () => {
  it('is true when the authoritative tristate is yes, regardless of contents', () => {
    expect(hasBile(null, 'yes')).toBe(true);
    expect(hasBile(['undigested_food'], 'yes')).toBe(true);
    expect(hasBile([], 'yes')).toBe(true);
  });

  it('is true when a bile token is in contents, regardless of the tristate', () => {
    // present-wins across the two sources — a contents-bile sighting counts even when the
    // authoritative field abstained (null) or read no/unsure.
    expect(hasBile(['bile'], null)).toBe(true);
    expect(hasBile(['bile'], 'no')).toBe(true);
    expect(hasBile(['bile'], 'unsure')).toBe(true);
  });

  it('is false when neither source asserts bile', () => {
    // Only 'yes' on the tristate asserts presence here; no / unsure / null do not, and this
    // leaf never infers "no bile" from a legible non-bile read — that lives in the callers.
    expect(hasBile(['undigested_food'], 'no')).toBe(false);
    expect(hasBile(['hair'], 'unsure')).toBe(false);
    expect(hasBile([], null)).toBe(false);
    expect(hasBile(null, null)).toBe(false);
    expect(hasBile(null, 'no')).toBe(false);
  });
});

describe('leaf independence — no token leaks across predicates', () => {
  it('each predicate reads only its own marker', () => {
    const foodOnly = ['undigested_food'];
    expect(hasFood(foodOnly)).toBe(true);
    expect(hasHair(foodOnly)).toBe(false);
    expect(hasBile(foodOnly, null)).toBe(false);

    const hairOnly = ['hair'];
    expect(hasHair(hairOnly)).toBe(true);
    expect(hasFood(hairOnly)).toBe(false);
    expect(hasBile(hairOnly, null)).toBe(false);
  });

  it('an unknown / future token triggers nothing', () => {
    const unknown = ['some_future_token'];
    expect(hasFood(unknown)).toBe(false);
    expect(hasHair(unknown)).toBe(false);
    expect(hasBile(unknown, null)).toBe(false);
  });
});
