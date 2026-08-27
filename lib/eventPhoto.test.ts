import { resolveEventPhotoDisplay, addPhotoHeroCopy, EventPhotoInput } from './eventPhoto';

// No-photo, non-meal, nothing resolved — the baseline each case overrides.
const base: EventPhotoInput = {
  localUri: null,
  remoteUrl: null,
  remoteUrlFull: null,
  transformFailed: false,
  offersPhoto: true,
  hasAttachment: false,
};

describe('resolveEventPhotoDisplay (B-207 — transform→raw fallback + empty-state gating)', () => {
  it('prefers the on-device local file over any remote URL', () => {
    expect(
      resolveEventPhotoDisplay({
        ...base,
        localUri: 'file:///a.jpg',
        remoteUrl: 'https://transform',
        remoteUrlFull: 'https://raw',
        hasAttachment: true,
      }),
    ).toEqual({ photoUri: 'file:///a.jpg', showEmptyHero: false });
  });

  it('prefers the transform URL over the raw URL', () => {
    expect(
      resolveEventPhotoDisplay({ ...base, remoteUrl: 'https://transform', remoteUrlFull: 'https://raw', hasAttachment: true }).photoUri,
    ).toBe('https://transform');
  });

  it('falls back to the raw URL when the transform failed to load (add-on unavailable)', () => {
    expect(
      resolveEventPhotoDisplay({
        ...base,
        remoteUrl: 'https://transform',
        remoteUrlFull: 'https://raw',
        transformFailed: true,
        hasAttachment: true,
      }).photoUri,
    ).toBe('https://raw');
  });

  it('falls back to the raw URL when the transform URL has not resolved yet', () => {
    expect(
      resolveEventPhotoDisplay({ ...base, remoteUrl: null, remoteUrlFull: 'https://raw', hasAttachment: true }).photoUri,
    ).toBe('https://raw');
  });

  it('does NOT show the empty hero while an attachment exists but its URL is still resolving (the mid-fallback flash bug)', () => {
    expect(resolveEventPhotoDisplay({ ...base, hasAttachment: true })).toEqual({
      photoUri: null,
      showEmptyHero: false,
    });
  });

  it('shows the add-photo empty state for a photo-less event that offers one (incl. after a photo is removed and all URLs are cleared)', () => {
    expect(resolveEventPhotoDisplay({ ...base, hasAttachment: false, offersPhoto: true })).toEqual({
      photoUri: null,
      showEmptyHero: true,
    });
  });

  it('never shows the empty hero on a leaf without a photo affordance (meal — the artifact is the food name; cough/sneeze — no visual evidence, §7)', () => {
    expect(resolveEventPhotoDisplay({ ...base, offersPhoto: false }).showEmptyHero).toBe(false);
  });

  it('still renders an existing photo on such a leaf (offersPhoto suppresses only the BEG, never the evidence — e.g. a swapped other→cough row keeps its photo)', () => {
    expect(
      resolveEventPhotoDisplay({ ...base, offersPhoto: false, remoteUrl: 'https://transform', hasAttachment: true }),
    ).toEqual({ photoUri: 'https://transform', showEmptyHero: false });
  });
});

describe('addPhotoHeroCopy (B-371 — the add-photo hero teaches what a photo is for)', () => {
  const READ_TYPES = ['vomit', 'diarrhea', 'stool_normal'];
  // Every type the quick-log can produce that has NO shipped photo read.
  // (cough/sneeze never render the hero at all — hasPhoto false — but the copy
  // fallback must still hold if one is ever reached with them.)
  const NO_READ_TYPES = [
    'lethargy', 'itch', 'meal', 'medication', 'weight_check', 'other', 'cough', 'sneeze',
  ];

  it('always keeps "Add photo" as the tap-target action label', () => {
    for (const t of [...READ_TYPES, ...NO_READ_TYPES, null, undefined, 'unknown_type']) {
      expect(addPhotoHeroCopy(t).action).toBe('Add photo');
    }
  });

  it.each(READ_TYPES)('teaches the read on %s — names the observations a photo produces', (t) => {
    const { hint } = addPhotoHeroCopy(t);
    expect(hint).toBeTruthy();
    // Specific over generic (nyx-voice P2): the actual fields, not "get insights".
    expect(hint).toMatch(/colour/);
    expect(hint).toMatch(/consistency/);
    expect(hint).toMatch(/blood/);
  });

  it('names mucus on stool only — it is a stool observation, not a vomit one', () => {
    expect(addPhotoHeroCopy('diarrhea').hint).toMatch(/mucus/);
    expect(addPhotoHeroCopy('stool_normal').hint).toMatch(/mucus/);
    expect(addPhotoHeroCopy('vomit').hint).not.toMatch(/mucus/);
  });

  it.each(NO_READ_TYPES)('leaves %s on the bare action label — no read is shipped to promise', (t) => {
    expect(addPhotoHeroCopy(t).hint).toBeNull();
  });

  it('falls back to the bare action label on a null / unknown event type', () => {
    expect(addPhotoHeroCopy(null).hint).toBeNull();
    expect(addPhotoHeroCopy(undefined).hint).toBeNull();
    expect(addPhotoHeroCopy('skin_reaction').hint).toBeNull();
  });

  // clinical-guardrails Pattern 8 — the never-reassure invariant is an assertion,
  // not a comment. This copy sits on a symptom event, one tap from the AI read, so
  // it inherits the same bar: it may describe what CAN be looked at, and may never
  // imply that a photo (or the lack of one) says the pet is well.
  it('never reassures and never promises a verdict', () => {
    for (const t of READ_TYPES) {
      const hint = addPhotoHeroCopy(t).hint as string;
      expect(/\b(fine|okay|ok|healthy|normal|safe|all clear|nothing to worry)\b/i.test(hint)).toBe(false);
      // No verdict language: the read may come back "Not enough to say".
      expect(/\b(tell you if|confirm|diagnos\w*|rule out)\b/i.test(hint)).toBe(false);
    }
  });

  // nyx-voice P4 (no manufactured enthusiasm) + P5 (plain language, not jargon).
  it('stays in voice — no exclamation marks, no clinical jargon', () => {
    for (const t of READ_TYPES) {
      const hint = addPhotoHeroCopy(t).hint as string;
      expect(hint.includes('!')).toBe(false);
      expect(/\b(bristol|emesis|haematochezia|hematochezia|melena|mucoid)\b/i.test(hint)).toBe(false);
    }
  });
});
