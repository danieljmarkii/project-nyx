// The exam room's offline copy (CUL-2299). A TRUST & SAFETY guard: the copy is the whole clinical
// record, so it must sit where the sign-out wipe deletes it, and the room keeps at most one.
//
// The file system is an in-memory map keyed by path; `clearTransientFiles` runs FOR REAL against
// it, so "the sign-out sweep removes the copy" is the sweep's own behaviour, not a restatement.
const mockFiles = new Map<string, string>();
let mockFailWrite = false;

jest.mock('expo-file-system', () => {
  const join = (parent: unknown, name?: string): string => {
    const p = typeof parent === 'string' ? parent : (parent as { uri: string }).uri;
    return name ? `${p}/${name}` : p;
  };
  class Directory {
    uri: string;
    constructor(parent: unknown, name?: string) {
      this.uri = join(parent, name);
    }
    get exists() {
      return [...mockFiles.keys()].some((k) => k.startsWith(`${this.uri}/`));
    }
    create() {}
    delete() {
      for (const k of [...mockFiles.keys()]) if (k.startsWith(`${this.uri}/`)) mockFiles.delete(k);
    }
    list() {
      return [];
    }
  }
  class File {
    uri: string;
    name: string;
    constructor(parent: unknown, name?: string) {
      this.uri = join(parent, name);
      this.name = name ?? this.uri;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    writeSync(content: string) {
      if (mockFailWrite && this.uri.endsWith('print.html')) throw new Error('disk full');
      mockFiles.set(this.uri, content);
    }
    textSync() {
      return mockFiles.get(this.uri) ?? '';
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  }
  return { Directory, File, Paths: { cache: 'cache' } };
});

import { EXAM_ROOM_ROUTE, clearExamCopy, examCopyDirectory, openExamRoom, readExamCopy, stageExamCopy } from './examRoomCopy';
import { TRANSIENT_DIR, clearTransientFiles, transientDirectory } from './transientFiles';

beforeEach(() => {
  mockFiles.clear();
  mockFailWrite = false;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

const copy = { phoneHtml: '<html>Mochi phone</html>', printHtml: '<html>Mochi print</html>' };

it('stages the copy inside the transient directory, and nowhere else', () => {
  expect(stageExamCopy(copy)).toBe(true);
  const root = `${transientDirectory().uri}/`;
  expect(root).toBe(`cache/${TRANSIENT_DIR}/`);
  expect(examCopyDirectory().uri.startsWith(root)).toBe(true);
  expect(mockFiles.size).toBe(2);
  for (const k of mockFiles.keys()) expect(k.startsWith(root)).toBe(true);
  expect(readExamCopy()).toEqual(copy);
});

it('the sign-out sweep (clearTransientFiles, run by clearLocalData) removes the copy', () => {
  stageExamCopy(copy);
  clearTransientFiles();
  expect(mockFiles.size).toBe(0);
  expect(readExamCopy()).toBeNull();
});

it('keeps at most one copy: a second open replaces the first, and its missing print leaves none behind', () => {
  stageExamCopy(copy);
  stageExamCopy({ phoneHtml: '<html>Cooper phone</html>', printHtml: null });
  expect(mockFiles.size).toBe(1);
  expect(readExamCopy()).toEqual({ phoneHtml: '<html>Cooper phone</html>', printHtml: null });
});

it('closing the room deletes the copy', () => {
  stageExamCopy(copy);
  clearExamCopy();
  expect(mockFiles.size).toBe(0);
});

it('a write that fails leaves nothing on the phone and never opens the room', () => {
  mockFailWrite = true;
  const push = jest.fn();
  expect(openExamRoom(copy, push)).toBe(false);
  expect(push).not.toHaveBeenCalled();
  expect(mockFiles.size).toBe(0);
});

it('opens the room only after the copy is staged', () => {
  const push = jest.fn(() => {
    expect(readExamCopy()).toEqual(copy);
  });
  expect(openExamRoom(copy, push)).toBe(true);
  expect(push).toHaveBeenCalledWith(EXAM_ROOM_ROUTE);
});
