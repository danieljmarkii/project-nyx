let mockExists: boolean | Error = true;
jest.mock('expo-file-system', () => ({
  File: class {
    constructor(_uri: string) {
      if (mockExists instanceof Error) throw mockExists;
    }
    get exists() {
      return mockExists as boolean;
    }
  },
}));

import { localFileExists } from './localFile';

describe('localFileExists (shared by the record hero and the Signal gallery, CUL-1269)', () => {
  it('is true only when the file is still on the device', () => {
    mockExists = true;
    expect(localFileExists('file:///cache/a.jpg')).toBe(true);
    mockExists = false;
    expect(localFileExists('file:///cache/evicted.jpg')).toBe(false);
  });

  it('treats a path the file API cannot open (a content:// URI) as unavailable, so the signed URL takes over', () => {
    mockExists = new Error('not a managed path');
    expect(localFileExists('content://media/1')).toBe(false);
  });
});
