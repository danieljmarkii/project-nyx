// CUL-612 — the discard guard's predicate and copy. Pure, so the interesting
// cases (what counts as "half-filled") are asserted without a render.

import { isConfirmDirty, discardGuardCopy, type ConfirmDraft } from './discardGuard';

const clean: ConfirmDraft = { hasPhoto: false, timeTouched: false, hasNote: false };

describe('isConfirmDirty', () => {
  it('is false on an untouched confirm — no dialog between the FAB and closing it', () => {
    expect(isConfirmDirty(clean)).toBe(false);
  });

  it.each([
    ['a photo', { hasPhoto: true }],
    ['an adjusted time', { timeTouched: true }],
    ['a typed note', { hasNote: true }],
  ])('is true with %s', (_label, over) => {
    expect(isConfirmDirty({ ...clean, ...over })).toBe(true);
  });
});

describe('discardGuardCopy', () => {
  it('returns null when there is nothing to lose', () => {
    expect(discardGuardCopy(clean)).toBeNull();
  });

  it('names the ONE thing at stake', () => {
    // Specific over generic (nyx-voice Pattern 2) — and here it does real work: an
    // owner who tapped the backdrop by accident needs to know in one glance whether
    // the photo they just took at 2am is what is about to go.
    expect(discardGuardCopy({ ...clean, hasPhoto: true })?.body).toBe('The photo won’t be saved.');
    expect(discardGuardCopy({ ...clean, hasNote: true })?.body).toBe('The note won’t be saved.');
    expect(discardGuardCopy({ ...clean, timeTouched: true })?.body).toBe(
      'The time you set won’t be saved.',
    );
  });

  it('names two, and three, in reading order', () => {
    expect(discardGuardCopy({ hasPhoto: true, timeTouched: false, hasNote: true })?.body).toBe(
      'The photo and the note won’t be saved.',
    );
    expect(discardGuardCopy({ hasPhoto: true, timeTouched: true, hasNote: true })?.body).toBe(
      'The photo, the time you set and the note won’t be saved.',
    );
  });

  it('asks about a "log" — the same noun the Remove alerts use', () => {
    expect(discardGuardCopy({ ...clean, hasPhoto: true })?.title).toBe('Discard this log?');
  });

  it('holds to the voice: no exclamation mark anywhere (nyx-voice Pattern 4)', () => {
    const every: ConfirmDraft[] = [
      { hasPhoto: true, timeTouched: true, hasNote: true },
      { hasPhoto: true, timeTouched: false, hasNote: false },
      { hasPhoto: false, timeTouched: true, hasNote: true },
    ];
    for (const d of every) {
      const copy = discardGuardCopy(d);
      expect(`${copy?.title} ${copy?.body}`).not.toContain('!');
    }
  });
});
