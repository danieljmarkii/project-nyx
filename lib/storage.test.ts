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
// module loads under jest (./supabase otherwise fail-fasts on missing env). The
// storage shim is driven by mockStorageControl so getSignedUrls' batch-signing
// can be exercised (mock-prefixed for jest's hoist-out-of-scope rule).
const mockStorageControl = {
  createSignedUrls: jest.fn(),
  createSignedUrl: jest.fn(),
};
jest.mock('./supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrls: (...args: unknown[]) => mockStorageControl.createSignedUrls(...args),
        createSignedUrl: (...args: unknown[]) => mockStorageControl.createSignedUrl(...args),
      }),
    },
  },
}));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockManipulateAsync = require('expo-image-manipulator').manipulateAsync as jest.Mock;

import {
  persistCapture, getSignedUrl, getSignedUrls, buildMedicationPhotoPath,
  compressForUpload, MAX_EDGE_PX,
} from './storage';

// B-352 / B-206 — compressForUpload's contract is "longest edge ≤ MAX_EDGE_PX".
// expo-image-manipulator's `resize` preserves aspect from whichever single edge
// you pin, so pinning the WRONG edge silently leaves the long one uncapped: a 3:4
// portrait pinned at width:1600 lands at 1600×2133. These tests assert which edge
// is chosen and how many passes run — the re-encode itself is expo's job.
describe('compressForUpload (B-352 / B-206 — longest-edge cap)', () => {
  const SRC = 'file:///cache/capture.jpg';
  const SAVE_OPTS = { compress: 0.75, format: 'jpeg' };

  beforeEach(() => mockManipulateAsync.mockReset());

  /** Emulate expo's aspect-preserving resize so the mock reports honest dims. */
  function resized(uri: string, srcW: number, srcH: number, resize: { width?: number; height?: number }) {
    const scale = resize.width ? resize.width / srcW : (resize.height as number) / srcH;
    return { uri, width: Math.round(srcW * scale), height: Math.round(srcH * scale) };
  }

  describe('with source dimensions from the picker asset (B-352)', () => {
    it('pins HEIGHT for a portrait photo so the LONG edge lands on the cap', async () => {
      mockManipulateAsync.mockResolvedValue({ uri: 'file:///out.jpg', width: 1200, height: 1600 });

      const out = await compressForUpload(SRC, 3024, 4032);

      expect(out).toBe('file:///out.jpg');
      expect(mockManipulateAsync).toHaveBeenCalledTimes(1);
      expect(mockManipulateAsync).toHaveBeenCalledWith(
        SRC, [{ resize: { height: MAX_EDGE_PX } }], SAVE_OPTS,
      );
      // The regression this test exists for: pinning width here produced a
      // 1600×2133 upload — 33% over the contract on the edge that matters.
      expect(mockManipulateAsync.mock.calls[0][1][0].resize).not.toHaveProperty('width');
    });

    it('pins WIDTH for a landscape photo', async () => {
      mockManipulateAsync.mockResolvedValue({ uri: 'file:///out.jpg', width: 1600, height: 1200 });

      const out = await compressForUpload(SRC, 4032, 3024);

      expect(out).toBe('file:///out.jpg');
      expect(mockManipulateAsync).toHaveBeenCalledTimes(1);
      expect(mockManipulateAsync).toHaveBeenCalledWith(
        SRC, [{ resize: { width: MAX_EDGE_PX } }], SAVE_OPTS,
      );
    });

    it('pins WIDTH for a square photo (either edge satisfies the cap)', async () => {
      mockManipulateAsync.mockResolvedValue({ uri: 'file:///out.jpg', width: 1600, height: 1600 });

      await compressForUpload(SRC, 2048, 2048);

      expect(mockManipulateAsync).toHaveBeenCalledWith(
        SRC, [{ resize: { width: MAX_EDGE_PX } }], SAVE_OPTS,
      );
    });

    it('takes the measure path when only ONE dimension is known', async () => {
      // A half-supplied pair cannot decide orientation, so it must measure rather
      // than guess landscape — the `sourceWidth && sourceHeight` guard.
      mockManipulateAsync.mockResolvedValue({ uri: 'file:///pass1.jpg', width: 1600, height: 900 });

      const out = await compressForUpload(SRC, 4032, undefined);

      expect(out).toBe('file:///pass1.jpg');
      expect(mockManipulateAsync).toHaveBeenCalledWith(
        SRC, [{ resize: { width: MAX_EDGE_PX } }], SAVE_OPTS,
      );
    });
  });

  describe('without source dimensions — the re-upload path (B-206)', () => {
    it('resizes ONCE for a landscape source (no second encode on the common path)', async () => {
      mockManipulateAsync.mockImplementation(async (_uri: string, actions: { resize: object }[]) =>
        resized('file:///pass1.jpg', 4032, 3024, actions[0].resize),
      );

      const out = await compressForUpload(SRC);

      expect(out).toBe('file:///pass1.jpg');
      expect(mockManipulateAsync).toHaveBeenCalledTimes(1);
    });

    it('redoes the resize on HEIGHT when the width pass leaves height over the cap', async () => {
      // 3:4 source. Pass 1 pins width → 1600×2133, over the cap — so pass 2 runs,
      // and reads from the ORIGINAL uri: re-resizing pass 1's output would stack a
      // second lossy JPEG encode on top of the first.
      mockManipulateAsync
        .mockResolvedValueOnce(resized('file:///pass1.jpg', 3024, 4032, { width: MAX_EDGE_PX }))
        .mockResolvedValueOnce(resized('file:///pass2.jpg', 3024, 4032, { height: MAX_EDGE_PX }));

      const out = await compressForUpload(SRC);

      expect(out).toBe('file:///pass2.jpg');
      expect(mockManipulateAsync).toHaveBeenCalledTimes(2);
      expect(mockManipulateAsync).toHaveBeenNthCalledWith(
        1, SRC, [{ resize: { width: MAX_EDGE_PX } }], SAVE_OPTS,
      );
      expect(mockManipulateAsync).toHaveBeenNthCalledWith(
        2, SRC, [{ resize: { height: MAX_EDGE_PX } }], SAVE_OPTS,
      );
      // And the emitted image actually honours the contract.
      const final = resized('file:///pass2.jpg', 3024, 4032, { height: MAX_EDGE_PX });
      expect(Math.max(final.width, final.height)).toBeLessThanOrEqual(MAX_EDGE_PX);
    });

    it('does NOT run a second pass when the width pass is exactly at the cap', async () => {
      // Square source → 1600×1600. `<=` not `<`: an off-by-one here would double
      // the work on every square re-upload for no pixel difference.
      mockManipulateAsync.mockResolvedValueOnce({ uri: 'file:///pass1.jpg', width: 1600, height: 1600 });

      const out = await compressForUpload(SRC);

      expect(out).toBe('file:///pass1.jpg');
      expect(mockManipulateAsync).toHaveBeenCalledTimes(1);
    });
  });
});

describe('getSignedUrl (B-207 — transform passthrough for screen-sized photos)', () => {
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    mockStorageControl.createSignedUrl.mockReset();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warnSpy.mockRestore());

  it('passes an imgproxy transform through to createSignedUrl', async () => {
    mockStorageControl.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x/y?token=1' }, error: null });
    const url = await getSignedUrl('nyx-event-attachments', 'p/q.jpg', 3600, { width: 1600, height: 1600, resize: 'contain' });
    expect(url).toBe('https://x/y?token=1');
    expect(mockStorageControl.createSignedUrl).toHaveBeenCalledWith('p/q.jpg', 3600, {
      transform: { width: 1600, height: 1600, resize: 'contain' },
    });
  });

  it('omits the options arg entirely when no transform is given (raw fallback URL)', async () => {
    mockStorageControl.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x/y' }, error: null });
    await getSignedUrl('nyx-event-attachments', 'p/q.jpg');
    expect(mockStorageControl.createSignedUrl).toHaveBeenCalledWith('p/q.jpg', 3600, undefined);
  });

  it('returns null (not a throw) when signing fails, so the caller can fall back', async () => {
    mockStorageControl.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'transform unavailable' } });
    expect(await getSignedUrl('nyx-event-attachments', 'p/q.jpg', 3600, { width: 1600 })).toBeNull();
  });
});

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

// B-004 PR 6 — getSignedUrls batch-signs the Foods-tab row thumbnails in one
// request. The load-bearing properties: it signs the whole set in a SINGLE call
// (not N round-trips), it OMITS any path that fails to sign (so the row shows a
// placeholder, never a torn image), and it NEVER throws (thumbnails degrade to
// placeholders rather than blanking the always-present text rows).
describe('getSignedUrls (B-004 PR 6 — Foods-tab thumbnails)', () => {
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    mockStorageControl.createSignedUrls.mockReset();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warnSpy.mockRestore());

  it('signs the whole set in ONE request and returns a path→url map', async () => {
    mockStorageControl.createSignedUrls.mockResolvedValue({
      data: [
        { path: 'a/0-front.jpg', signedUrl: 'https://signed/a', error: null },
        { path: 'b/0-front.jpg', signedUrl: 'https://signed/b', error: null },
      ],
      error: null,
    });
    const map = await getSignedUrls('nyx-food-photos', ['a/0-front.jpg', 'b/0-front.jpg']);
    // One batch call, not one per path.
    expect(mockStorageControl.createSignedUrls).toHaveBeenCalledTimes(1);
    expect(mockStorageControl.createSignedUrls).toHaveBeenCalledWith(
      ['a/0-front.jpg', 'b/0-front.jpg'],
      60 * 60,
    );
    expect(map.get('a/0-front.jpg')).toBe('https://signed/a');
    expect(map.get('b/0-front.jpg')).toBe('https://signed/b');
  });

  it('omits a path that failed to sign (deleted object / RLS) — no broken image', async () => {
    mockStorageControl.createSignedUrls.mockResolvedValue({
      data: [
        { path: 'ok.jpg', signedUrl: 'https://signed/ok', error: null },
        { path: 'gone.jpg', signedUrl: '', error: 'Object not found' },
      ],
      error: null,
    });
    const map = await getSignedUrls('nyx-food-photos', ['ok.jpg', 'gone.jpg']);
    expect(map.get('ok.jpg')).toBe('https://signed/ok');
    // Absent (not a falsy entry) so the caller renders the placeholder.
    expect(map.has('gone.jpg')).toBe(false);
  });

  it('returns an empty map WITHOUT a network call for empty input', async () => {
    const map = await getSignedUrls('nyx-food-photos', []);
    expect(map.size).toBe(0);
    expect(mockStorageControl.createSignedUrls).not.toHaveBeenCalled();
  });

  it('returns an empty map (never throws) when the API returns an error', async () => {
    mockStorageControl.createSignedUrls.mockResolvedValue({ data: null, error: new Error('network') });
    const map = await getSignedUrls('nyx-food-photos', ['a.jpg']);
    expect(map.size).toBe(0);
  });

  it('returns an empty map (never throws) when the call itself rejects', async () => {
    mockStorageControl.createSignedUrls.mockRejectedValue(new Error('boom'));
    await expect(getSignedUrls('nyx-food-photos', ['a.jpg'])).resolves.toBeInstanceOf(Map);
    const map = await getSignedUrls('nyx-food-photos', ['a.jpg']);
    expect(map.size).toBe(0);
  });
});

// B-117 PR 4 / B-124 — buildMedicationPhotoPath centralises the per-user RLS
// prefix for the nyx-medication-photos bucket. The load-bearing property: the
// path MUST start with `${userId}/`, because the bucket's RLS (migration 021)
// gates every read/write on (storage.foldername(name))[1] = auth.uid(). A path
// without that prefix is silently rejected, so the helper both enforces the
// prefix and fails fast when the prefix segment would be empty.
describe('buildMedicationPhotoPath (B-124 per-user RLS prefix)', () => {
  it('puts the user id FIRST so it is the RLS foldername[1] segment', () => {
    const path = buildMedicationPhotoPath('user-abc', 'item-123', '0-label');
    expect(path).toBe('user-abc/item-123/0-label.jpg');
    // The security-critical invariant, asserted directly: first path segment === uid.
    expect(path.split('/')[0]).toBe('user-abc');
  });

  it('defaults the slot to 0-label (the front/label photo)', () => {
    expect(buildMedicationPhotoPath('u', 'i')).toBe('u/i/0-label.jpg');
  });

  it('supports additional slots (e.g. back of the label)', () => {
    expect(buildMedicationPhotoPath('u', 'i', '1-back')).toBe('u/i/1-back.jpg');
  });

  it('throws on an empty userId (an empty RLS prefix segment is silently rejected)', () => {
    expect(() => buildMedicationPhotoPath('', 'item-123')).toThrow(/userId is required/);
    expect(() => buildMedicationPhotoPath('   ', 'item-123')).toThrow(/userId is required/);
  });

  it('throws on an empty medicationItemId', () => {
    expect(() => buildMedicationPhotoPath('user-abc', '')).toThrow(/medicationItemId is required/);
  });

  it('rejects a segment that would break out of its slot (/, \\, ..)', () => {
    // The chokepoint guard: a '/' or '..' in any segment could inject an extra
    // path part or traverse — rejected even though RLS would still pin a hostile
    // key to its first segment (defense in depth for a future user-typed slot).
    expect(() => buildMedicationPhotoPath('u', 'i', '../other-uid/evil')).toThrow(/illegal path segment/);
    expect(() => buildMedicationPhotoPath('u', 'i/extra')).toThrow(/illegal path segment/);
    expect(() => buildMedicationPhotoPath('u', 'i', 'a\\b')).toThrow(/illegal path segment/);
  });
});
