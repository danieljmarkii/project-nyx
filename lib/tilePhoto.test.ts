import { resolveTilePhoto, tileNeedsRemote } from './tilePhoto';

const NONE: ReadonlySet<string> = new Set();

describe('resolveTilePhoto (CUL-1269)', () => {
  it('prefers the on-device file when it exists', () => {
    expect(resolveTilePhoto({ local: 'file:///a.jpg', transform: undefined, raw: undefined }, NONE)).toEqual({
      kind: 'photo',
      uri: 'file:///a.jpg',
    });
  });

  it('waits on the transform rather than jumping to the raw original that signed first', () => {
    expect(resolveTilePhoto({ local: null, transform: undefined, raw: 'https://raw' }, NONE)).toEqual({ kind: 'loading' });
  });

  it('shows the transform once signed', () => {
    expect(resolveTilePhoto({ local: null, transform: 'https://t', raw: undefined }, NONE)).toEqual({ kind: 'photo', uri: 'https://t' });
  });

  it('falls from a failed local file to the transform', () => {
    expect(resolveTilePhoto({ local: 'file:///a.jpg', transform: 'https://t', raw: 'https://raw' }, new Set(['file:///a.jpg']))).toEqual({
      kind: 'photo',
      uri: 'https://t',
    });
  });

  it('falls from a failed transform to the raw original (B-207)', () => {
    expect(resolveTilePhoto({ local: null, transform: 'https://t', raw: 'https://raw' }, new Set(['https://t']))).toEqual({
      kind: 'photo',
      uri: 'https://raw',
    });
  });

  it('falls past a transform that could not be signed', () => {
    expect(resolveTilePhoto({ local: null, transform: null, raw: 'https://raw' }, NONE)).toEqual({ kind: 'photo', uri: 'https://raw' });
  });

  it('ends at failed, never at a blank tile, when every source is gone', () => {
    expect(resolveTilePhoto({ local: null, transform: null, raw: null }, NONE)).toEqual({ kind: 'failed' });
    expect(resolveTilePhoto({ local: null, transform: 'https://t', raw: 'https://raw' }, new Set(['https://t', 'https://raw']))).toEqual({
      kind: 'failed',
    });
  });
});

describe('tileNeedsRemote', () => {
  it('signs only when there is no usable local file, or it failed to load', () => {
    expect(tileNeedsRemote('file:///a.jpg', NONE)).toBe(false);
    expect(tileNeedsRemote(null, NONE)).toBe(true);
    expect(tileNeedsRemote('file:///a.jpg', new Set(['file:///a.jpg']))).toBe(true);
  });
});
