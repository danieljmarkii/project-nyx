import { resolveEventPhotoDisplay, EventPhotoInput } from './eventPhoto';

// No-photo, non-meal, nothing resolved — the baseline each case overrides.
const base: EventPhotoInput = {
  localUri: null,
  remoteUrl: null,
  remoteUrlFull: null,
  transformFailed: false,
  isMeal: false,
  hasAttachment: false,
};

describe('resolveEventPhotoDisplay (B-200 — transform→raw fallback + empty-state gating)', () => {
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

  it('shows the add-photo empty state for a photo-less non-meal event (incl. after a photo is removed and all URLs are cleared)', () => {
    expect(resolveEventPhotoDisplay({ ...base, hasAttachment: false, isMeal: false })).toEqual({
      photoUri: null,
      showEmptyHero: true,
    });
  });

  it('never shows the empty hero for a meal (its artifact is the food name, not a photo)', () => {
    expect(resolveEventPhotoDisplay({ ...base, isMeal: true }).showEmptyHero).toBe(false);
  });
});
