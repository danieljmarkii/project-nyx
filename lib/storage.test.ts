// B-104 — persistCapture copies a freshly-captured photo off the OS cache
// directory (which the system reclaims under storage pressure) into the
// app-owned document directory, so the stored local_uri survives. The two
// load-bearing properties this pins:
//   1. on success it returns the PERSISTENT document-directory URI (not the
//      cache source) — that durability is the whole point; and
//   2. it NEVER throws — a copy failure falls back to the source URI so
//      attaching a photo is never blocked.
//
// expo-file-system's File/Directory are native-backed, so we mock them to drive
// both paths. jest hoists jest.mock() above the imports, so the control object
// the factory closes over must be `mock`-prefixed (jest's out-of-scope escape
// hatch). The factory only CLOSES OVER mockFsControl — it never reads it at
// registration time — so there's no temporal-dead-zone trap (same shape as
// lib/meals.test.ts).

const mockFsControl = {
  copy: jest.fn(),
  del: jest.fn(),
  create: jest.fn(),
  destExists: false,
};

jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) =>
    parts
      .map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri))
      .join('/');
  return {
    Paths: { document: { uri: 'file:///document' } },
    Directory: class {
      uri: string;
      constructor(...parts: unknown[]) { this.uri = join(parts); }
      create(...a: unknown[]) { mockFsControl.create(...a); }
    },
    File: class {
      uri: string;
      constructor(...parts: unknown[]) { this.uri = join(parts); }
      get exists() { return mockFsControl.destExists; }
      delete() { mockFsControl.del(this.uri); }
      copy(dest: { uri: string }) { mockFsControl.copy(this.uri, dest.uri); }
    },
  };
});

// storage.ts imports these at module scope; neutralize their side effects so the
// module loads under jest (./supabase otherwise fail-fasts on missing env).
jest.mock('./supabase', () => ({ supabase: {} }));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));

import { persistCapture } from './storage';

describe('persistCapture (B-104)', () => {
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    mockFsControl.copy.mockReset();
    mockFsControl.del.mockReset();
    mockFsControl.create.mockReset();
    mockFsControl.destExists = false;
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warnSpy.mockRestore());

  it('returns the document-directory path and copies the cache source there', () => {
    const out = persistCapture('file:///cache/ImagePicker/abc.jpg', 'att-1.jpg');
    // Persisted under document/attachments, named by the attachment id.
    expect(out).toBe('file:///document/attachments/att-1.jpg');
    // It actually copied the cache source INTO that destination.
    expect(mockFsControl.copy).toHaveBeenCalledWith(
      'file:///cache/ImagePicker/abc.jpg',
      'file:///document/attachments/att-1.jpg',
    );
    // The attachments directory is ensured idempotently (no throw on re-create).
    expect(mockFsControl.create).toHaveBeenCalledWith({ intermediates: true, idempotent: true });
  });

  it('does NOT return the cache source path on success (durability is the point)', () => {
    const cacheUri = 'file:///cache/ImagePicker/xyz.jpg';
    expect(persistCapture(cacheUri, 'att-2.jpg')).not.toBe(cacheUri);
  });

  it('falls back to the source uri (never throws) when the copy fails', () => {
    mockFsControl.copy.mockImplementation(() => { throw new Error('ENOSPC'); });
    const cacheUri = 'file:///cache/ImagePicker/def.jpg';
    // Attaching a photo must never be blocked by a persistence failure.
    expect(() => persistCapture(cacheUri, 'att-3.jpg')).not.toThrow();
    expect(persistCapture(cacheUri, 'att-3.jpg')).toBe(cacheUri);
  });

  it('clears a pre-existing destination before copying (uuid-collision guard)', () => {
    mockFsControl.destExists = true;
    persistCapture('file:///cache/ImagePicker/ghi.jpg', 'att-4.jpg');
    expect(mockFsControl.del).toHaveBeenCalledWith('file:///document/attachments/att-4.jpg');
    expect(mockFsControl.copy).toHaveBeenCalled();
  });

  it('skips a non-file:// source unchanged (Android content:// 0-byte-copy guard)', () => {
    const contentUri = 'content://media/external/images/media/42';
    // Returns the source untouched and never attempts a copy — a silent 0-byte
    // copy of a content:// source would store a doc-dir path to an empty file.
    expect(persistCapture(contentUri, 'att-5.jpg')).toBe(contentUri);
    expect(mockFsControl.copy).not.toHaveBeenCalled();
    expect(mockFsControl.create).not.toHaveBeenCalled();
  });
});
