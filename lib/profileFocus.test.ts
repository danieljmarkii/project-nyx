// The Pet-tab doorway vocabulary — CUL-170.
//
// The screen half of this fix is a scroll, which no jest assertion can meaningfully
// judge; everything that can actually be WRONG about it is here — which route a
// strip names, which row a strip key resolves to, and how two coordinate spaces
// compose into one offset. So this file carries the weight, and the screen test
// asserts only that the wiring reaches these answers.
import {
  PROFILE_FOCUS_INSET,
  PROFILE_ROUTE,
  coerceProfileFocus,
  focusScrollY,
  medFocusScrollY,
  profileFocusHref,
  resolveMedAnchorRegimenId,
  type FocusableRegimen,
} from './profileFocus';
import { medStripKeyForRegimen, resolveMedStrips, type MedStripInput } from './medStrip';

describe('coerceProfileFocus', () => {
  it('accepts the two sections a doorway can name', () => {
    expect(coerceProfileFocus('trial')).toBe('trial');
    expect(coerceProfileFocus('medications')).toBe('medications');
  });

  it('refuses anything it has no anchor for, rather than guessing', () => {
    // A focus nothing can service is a scroll to nowhere; `null` is the unchanged
    // top-of-profile arrival, which is the honest degradation.
    expect(coerceProfileFocus('conditions')).toBeNull();
    expect(coerceProfileFocus(undefined)).toBeNull();
    expect(coerceProfileFocus('')).toBeNull();
    // expo-router hands back string[] for a repeated param.
    expect(coerceProfileFocus(['trial'])).toBeNull();
    expect(coerceProfileFocus(7)).toBeNull();
  });
});

describe('profileFocusHref', () => {
  it('names the Pet tab and carries the clock it was given as the nonce', () => {
    const href = profileFocusHref({ focus: 'trial', nowMs: 1_700_000_000_000 });
    expect(href.pathname).toBe(PROFILE_ROUTE);
    expect(href.params.focus).toBe('trial');
    expect(href.params.ts).toBe('1700000000000');
  });

  it('omits `med` entirely on a trial door — never an empty string', () => {
    // An empty `med` would reach `resolveMedAnchorRegimenId` as a falsy key, which
    // is handled — but it would also show up in the URL as a med link that names
    // no med. Absent is the accurate statement.
    expect('med' in profileFocusHref({ focus: 'trial', nowMs: 1 }).params).toBe(false);
    expect('med' in profileFocusHref({ focus: 'medications', medKey: null, nowMs: 1 }).params)
      .toBe(false);
  });

  it('carries the strip key on a med door', () => {
    const href = profileFocusHref({ focus: 'medications', medKey: 'item-amox', nowMs: 5 });
    expect(href.params).toEqual({ focus: 'medications', med: 'item-amox', ts: '5' });
  });

  it('mints a DIFFERENT nonce for a second tap, or the door works once per session', () => {
    // The Pet tab persists across switches, so identical params on a re-push are
    // indistinguishable from a re-render. This is the whole reason the nonce exists.
    const a = profileFocusHref({ focus: 'trial', nowMs: 1000 });
    const b = profileFocusHref({ focus: 'trial', nowMs: 1001 });
    expect(a.params.ts).not.toBe(b.params.ts);
  });
});

describe('resolveMedAnchorRegimenId', () => {
  function reg(over: Partial<FocusableRegimen> = {}): FocusableRegimen {
    return { id: 'reg-1', medication_item_id: 'item-amox', started_at: '2026-07-27', ...over };
  }

  it('resolves a library-backed strip to its regimen row', () => {
    expect(resolveMedAnchorRegimenId([reg()], 'item-amox')).toBe('reg-1');
  });

  it('resolves a free-text course through its regimen-scoped key', () => {
    const free = reg({ id: 'reg-free', medication_item_id: null });
    expect(resolveMedAnchorRegimenId([free], 'regimen:reg-free')).toBe('reg-free');
  });

  it('answers null for an ad-hoc course, which has no row to land on', () => {
    // Not a failure: `buildCandidates` mints a strip from recent doses alone, and
    // "Current medications" lists active regimens only. The screen falls back to
    // the section rather than inventing a target.
    expect(resolveMedAnchorRegimenId([reg()], 'item-gabapentin')).toBeNull();
    expect(resolveMedAnchorRegimenId([reg()], null)).toBeNull();
    expect(resolveMedAnchorRegimenId([reg()], undefined)).toBeNull();
    expect(resolveMedAnchorRegimenId([], 'item-amox')).toBeNull();
  });

  it('breaks a two-regimen tie the way the strip did — most recently started', () => {
    // Two active regimens for one drug collapse into ONE strip, and that strip
    // describes the newer course. Landing on the older row would name a different
    // course than the line the owner just read.
    const older = reg({ id: 'reg-old', started_at: '2026-06-01' });
    const newer = reg({ id: 'reg-new', started_at: '2026-07-27' });
    expect(resolveMedAnchorRegimenId([older, newer], 'item-amox')).toBe('reg-new');
    expect(resolveMedAnchorRegimenId([newer, older], 'item-amox')).toBe('reg-new');
  });
});

describe('the key the strip minted is the key the row resolves on', () => {
  // The failure this guards is silent: two spellings of the same key drift, and
  // every med doorway quietly degrades to the section — looking exactly like the
  // defect CUL-170 fixed, with nothing red. So the key is read off a REAL resolved
  // strip rather than restated here.
  const NOW = Date.parse('2026-07-31T18:00:00.000Z');
  const rows = [
    {
      id: 'reg-amox',
      medication_item_id: 'item-amox',
      drug_name: 'Amoxicillin',
      dose_amount: '250 mg',
      doses_per_day: 2,
      started_at: '2026-07-27',
      target_duration_days: 14,
    },
    {
      id: 'reg-free',
      medication_item_id: null,
      drug_name: 'Compounded thing',
      dose_amount: null,
      doses_per_day: 1,
      started_at: '2026-07-20',
      target_duration_days: null,
    },
  ];
  const input: MedStripInput = {
    petId: 'pet-1',
    regimens: rows,
    doses: [],
    items: { 'item-amox': { generic_name: 'Amoxicillin', brand_name: null } },
    nowMs: NOW,
    timeZone: 'UTC',
  };

  it('round-trips every resolved strip back to the regimen it came from', () => {
    const strips = resolveMedStrips(input);
    expect(strips.length).toBe(2);
    for (const strip of strips) {
      const resolved = resolveMedAnchorRegimenId(
        rows.map((r) => ({ ...r })),
        strip.key,
      );
      expect(resolved).not.toBeNull();
      expect(medStripKeyForRegimen(rows.find((r) => r.id === resolved)!)).toBe(strip.key);
    }
  });
});

describe('the scroll offset', () => {
  it('waits when the section has not laid out — never scrolls to a guess', () => {
    expect(medFocusScrollY({ sectionY: null, rowOffsetY: 40, isFirstRow: false })).toBeNull();
    expect(focusScrollY(null)).toBeNull();
  });

  it('lands the FIRST row on the section top, keeping its header on screen', () => {
    // A first row sits a card header below the card edge, so its own top would
    // slice "Current medications" in half — for nothing, since the row is already
    // the first thing under that header.
    expect(medFocusScrollY({ sectionY: 600, rowOffsetY: 70, isFirstRow: true }))
      .toBe(600 - PROFILE_FOCUS_INSET);
  });

  it('lands a LATER row on itself, composing the two coordinate spaces', () => {
    // The row's y is reported inside the card; the card's inside the scroll
    // content. Adding them anywhere but here is an off-by-a-card waiting to happen.
    expect(medFocusScrollY({ sectionY: 600, rowOffsetY: 240, isFirstRow: false }))
      .toBe(840 - PROFILE_FOCUS_INSET);
  });

  it('falls back to the section for a strip that names no row', () => {
    expect(medFocusScrollY({ sectionY: 600, rowOffsetY: null, isFirstRow: false }))
      .toBe(600 - PROFILE_FOCUS_INSET);
  });

  it('never asks for a negative offset', () => {
    expect(medFocusScrollY({ sectionY: 4, rowOffsetY: null, isFirstRow: true })).toBe(0);
    expect(focusScrollY(0)).toBe(0);
  });
});
