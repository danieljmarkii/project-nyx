// CUL-2176 — the editor's photo state, the two cases that disagreed with the record
// screen, and the rule that Save removes only rows the owner was shown.

import {
  resolveEditorPhoto,
  existingLocalUri,
  needsSignedUrl,
  priorsToDetach,
  photoPickerCopy,
} from './editEventPhoto';

const HYDRATED = { id: 'att-old', local_uri: '', storage_path: 'pet/evt/att-old.jpg' };
const LOCAL = { id: 'att-old', local_uri: 'file:///docs/att-old.jpg', storage_path: 'pet/evt/att-old.jpg' };
const base = { loaded: true, localFileUsable: false, remoteUrl: null, newUri: null };

describe('resolveEditorPhoto (CUL-2176)', () => {
  it('a hydrated row (empty local_uri) is attached, never the Attach row', () => {
    expect(resolveEditorPhoto({ ...base, existing: HYDRATED })).toEqual({ kind: 'attached', thumbUri: null, replacing: false });
  });

  it('a hydrated row draws its signed URL once it resolves', () => {
    expect(resolveEditorPhoto({ ...base, existing: HYDRATED, remoteUrl: 'https://signed/old' }))
      .toEqual({ kind: 'attached', thumbUri: 'https://signed/old', replacing: false });
  });

  it('a local row draws its on-device file', () => {
    expect(resolveEditorPhoto({ ...base, existing: LOCAL, localFileUsable: true }))
      .toEqual({ kind: 'attached', thumbUri: LOCAL.local_uri, replacing: false });
  });

  it('a local row whose file the OS reclaimed is still attached and falls to the signed URL', () => {
    expect(resolveEditorPhoto({ ...base, existing: LOCAL, remoteUrl: 'https://signed/old' }))
      .toEqual({ kind: 'attached', thumbUri: 'https://signed/old', replacing: false });
  });

  it('no row is the only state that offers Attach', () => {
    expect(resolveEditorPhoto({ ...base, existing: null })).toEqual({ kind: 'none' });
  });

  it('a failed read offers no control, even with a picked photo', () => {
    expect(resolveEditorPhoto({ ...base, loaded: false, failed: true, existing: null })).toEqual({ kind: 'unknown' });
    expect(resolveEditorPhoto({ ...base, failed: true, existing: null, newUri: 'file:///x.jpg' })).toEqual({ kind: 'unknown' });
  });

  it('nothing is offered until the read answers', () => {
    expect(resolveEditorPhoto({ ...base, loaded: false, existing: null })).toEqual({ kind: 'loading' });
  });

  it('a picked photo over an existing one is a replace', () => {
    expect(resolveEditorPhoto({ ...base, existing: HYDRATED, newUri: 'file:///cache/new.jpg' }))
      .toEqual({ kind: 'attached', thumbUri: 'file:///cache/new.jpg', replacing: true });
  });
});

describe('existingLocalUri / needsSignedUrl', () => {
  it('routes the sentinel and a dead path to the signed URL, a live file to itself', () => {
    expect(existingLocalUri(HYDRATED, true)).toBeNull();
    expect(existingLocalUri(LOCAL, false)).toBeNull();
    expect(existingLocalUri(LOCAL, true)).toBe(LOCAL.local_uri);
    expect(needsSignedUrl(HYDRATED, false)).toBe(true);
    expect(needsSignedUrl(LOCAL, true)).toBe(false);
  });
});

describe('priorsToDetach (CUL-2176)', () => {
  it('removes the rows shown at load, keeps a row that arrived later, never the new row', () => {
    const priors = [{ id: 'late' }, { id: 'att-old' }, { id: 'dup' }, { id: 'new' }];
    const out = priorsToDetach(priors, new Set(['att-old', 'dup', 'new']), 'new');
    expect(out.map((p) => p.id)).toEqual(['att-old', 'dup']);
  });

  it('a record that showed no photo removes nothing', () => {
    expect(priorsToDetach([{ id: 'late' }], new Set(), 'new')).toEqual([]);
  });
});

describe('photoPickerCopy', () => {
  it('names what goes, and how many, when a photo is attached', () => {
    expect(photoPickerCopy(1)).toEqual({ title: 'Replace photo', message: 'This replaces the photo on this record.' });
    // An older duplicate is swept too (B-105), so the sheet counts it rather than hide it.
    expect(photoPickerCopy(2).message).toBe('This replaces the 2 photos on this record.');
    expect(photoPickerCopy(0).title).toBe('Attach photo');
  });
});
