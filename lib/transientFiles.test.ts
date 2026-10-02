// The sign-out wipe's folder half (CUL-1045 and the picker caches). Its own in-memory
// cache directory, so what the wipe leaves behind is asserted by enumerating files.
// `cacheThrows` makes the cache path itself unreachable; `undeletable` names files whose
// delete throws (mock-prefixed so jest can hoist the factory over it).

const mockFs = {
  files: new Set<string>(),
  cacheThrows: false,
  undeletable: new Set<string>(),
};
jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) =>
    parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) { this.uri = join(parts); }
    get exists() { return [...mockFs.files].some((k) => k.startsWith(`${this.uri}/`)); }
    delete() { for (const k of [...mockFs.files]) if (k.startsWith(`${this.uri}/`)) mockFs.files.delete(k); }
    list() {
      const prefix = `${this.uri}/`;
      return [...mockFs.files]
        .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .map((k) => new File(k));
    }
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) { this.uri = join(parts); }
    get name() { return this.uri.slice(this.uri.lastIndexOf('/') + 1); }
    delete() {
      if (mockFs.undeletable.has(this.uri)) throw new Error(`busy: ${this.uri}`);
      mockFs.files.delete(this.uri);
    }
  }
  return {
    Paths: {
      get cache() {
        if (mockFs.cacheThrows) throw new Error('no cache directory');
        return { uri: 'file:///cache' };
      },
    },
    Directory,
    File,
  };
});

import { clearTransientFiles } from './transientFiles';

const ROOT = 'file:///cache';

beforeEach(() => {
  mockFs.files.clear();
  mockFs.undeletable.clear();
  mockFs.cacheThrows = false;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

it("every folder no row can name goes: the transient folder, expo-print's, and the three pickers'", () => {
  const leaving = [
    `${ROOT}/transient/Pixel-lab-result-2026-07-14.pdf`,
    `${ROOT}/Print/5F2C.pdf`,
    `${ROOT}/ImagePicker/0A1B.jpg`, // the original vomit photo
    `${ROOT}/ImageManipulator/9C8D.jpg`, // its compressed copy
    `${ROOT}/DocumentPicker/lab-results.pdf`, // a picked vet PDF
  ];
  const staying = [`${ROOT}/ExponentAsset/font.ttf`, `${ROOT}/notes.pdf`];
  for (const f of [...leaving, ...staying]) mockFs.files.add(f);
  clearTransientFiles();
  expect([...mockFs.files].sort()).toEqual([...staying].sort());
});

it('a cache that cannot be reached is logged, never thrown: the row wipe runs after this', () => {
  mockFs.cacheThrows = true;
  expect(() => clearTransientFiles()).not.toThrow();
});

it('one old report copy that will not delete does not shield the next', () => {
  const stuck = `${ROOT}/Pixel-vet-report.pdf`;
  const next = `${ROOT}/Pixel-vet-report-2026-08-01-to-2026-08-31.pdf`;
  mockFs.files.add(stuck);
  mockFs.files.add(next);
  mockFs.undeletable.add(stuck);
  clearTransientFiles();
  expect(mockFs.files.has(next)).toBe(false);
  expect(mockFs.files.has(stuck)).toBe(true);
});
