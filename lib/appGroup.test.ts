// CUL-2570: the capture inbox opens to one of three answers. A container whose inbox folder
// would not open is `unavailable`, never `none`: `none` reads as "no inbox here", which zeroes
// every unsent count while the sign-out wipe still deletes the folder.
const mockContainer = { id: 'container' };
let mockCreateThrows = false;
let mockHasContainer = true;
let mockLookupThrows = false;

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-file-system', () => ({
  Directory: class {
    create() {
      if (mockCreateThrows) throw new Error('io');
    }
  },
  Paths: {
    get appleSharedContainers() {
      if (mockLookupThrows) throw new Error('lookup');
      return mockHasContainer ? { 'group.com.projectnyx.app': mockContainer } : {};
    },
  },
}));

import { getCaptureInboxDirectory, openCaptureInbox } from './appGroup';

describe('openCaptureInbox (CUL-2570)', () => {
  beforeEach(() => {
    mockCreateThrows = false;
    mockHasContainer = true;
    mockLookupThrows = false;
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('opens the inbox when the container and folder are there', () => {
    expect(openCaptureInbox().status).toBe('ok');
    expect(getCaptureInboxDirectory()).not.toBeNull();
  });

  it('no container is none', () => {
    mockHasContainer = false;
    expect(openCaptureInbox()).toEqual({ status: 'none' });
  });

  it('adversarial pass 1: a container lookup that throws on iOS is unavailable, never none', () => {
    mockLookupThrows = true;
    expect(openCaptureInbox()).toEqual({ status: 'unavailable' });
  });

  it('a container whose folder will not open is unavailable, never none', () => {
    mockCreateThrows = true;
    expect(openCaptureInbox()).toEqual({ status: 'unavailable' });
    // The ingest and the extension's write still see null: both no-op or fail the tap either way.
    expect(getCaptureInboxDirectory()).toBeNull();
  });
});
