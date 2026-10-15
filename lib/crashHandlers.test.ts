import { readFileSync } from 'fs';
import { join } from 'path';
import { installCrashHandlers, resetCrashHandlersForTest } from './crashHandlers';
import { useCrashStore } from '../store/crashStore';

// CUL-1841: the two crash doors outside React. Each test installs the handlers against
// fakes of ErrorUtils and Hermes, so it drives the real handler code, never a copy.

type Handler = (error: unknown, isFatal?: boolean) => void;

function fakeErrorUtils(previous: Handler) {
  let current: Handler = previous;
  return {
    getGlobalHandler: () => current,
    setGlobalHandler: (h: Handler) => {
      current = h;
    },
    fire: (error: unknown, isFatal: boolean) => current(error, isFatal),
  };
}

function fakeHermes() {
  const holder: { options?: { onUnhandled: (id: number, r: unknown) => void; allRejections: boolean } } = {};
  return {
    enablePromiseRejectionTracker: (o: { onUnhandled: (id: number, r: unknown) => void; allRejections: boolean; onHandled: (id: number) => void }) => {
      holder.options = o;
    },
    holder,
  };
}

beforeEach(() => {
  resetCrashHandlersForTest();
  useCrashStore.getState().clearCrash();
});

describe('the global handler', () => {
  it('a fatal error sets the crash flag and, in a release build, never reaches the aborting handler', () => {
    const previous = jest.fn();
    const eu = fakeErrorUtils(previous);
    installCrashHandlers({ errorUtils: eu, isDev: false });

    eu.fire(new Error('boom'), true);

    expect(useCrashStore.getState().crashed).toBe(true);
    expect(previous).not.toHaveBeenCalled();
  });

  it('a fatal error in development still reaches the previous handler, so the red box shows', () => {
    const previous = jest.fn();
    const eu = fakeErrorUtils(previous);
    installCrashHandlers({ errorUtils: eu, isDev: true });
    const err = new Error('boom');

    eu.fire(err, true);

    expect(useCrashStore.getState().crashed).toBe(true);
    expect(previous).toHaveBeenCalledWith(err, true);
  });

  it('a non-fatal report goes to the previous handler unchanged and opens no screen', () => {
    const previous = jest.fn();
    const eu = fakeErrorUtils(previous);
    installCrashHandlers({ errorUtils: eu, isDev: false });
    const err = new Error('soft');

    eu.fire(err, false);

    expect(useCrashStore.getState().crashed).toBe(false);
    expect(previous).toHaveBeenCalledWith(err, false);
  });

  it('installs once: a second call does not wrap the handler around itself', () => {
    const previous = jest.fn();
    const eu = fakeErrorUtils(previous);
    const setSpy = jest.spyOn(eu, 'setGlobalHandler');
    installCrashHandlers({ errorUtils: eu, isDev: false });
    installCrashHandlers({ errorUtils: eu, isDev: false });
    expect(setSpy).toHaveBeenCalledTimes(1);
  });
});

describe('the unhandled rejection tracker', () => {
  it('tracks every rejection and an unhandled one sets the crash flag', () => {
    const hermes = fakeHermes();
    installCrashHandlers({ hermes, isDev: false });

    expect(hermes.holder.options?.allRejections).toBe(true);
    hermes.holder.options?.onUnhandled(1, new Error('nobody caught me'));

    expect(useCrashStore.getState().crashed).toBe(true);
  });

  it('without Hermes, installing is a no-op rather than a throw', () => {
    expect(() => installCrashHandlers({ isDev: false })).not.toThrow();
    expect(useCrashStore.getState().crashed).toBe(false);
  });
});

describe('nothing leaves the phone (D9 (a), CUL-1825)', () => {
  const ROOT = join(__dirname, '..');
  const FILES = [
    'lib/crashHandlers.ts',
    'store/crashStore.ts',
    'components/CrashBoundary.tsx',
    'components/CrashScreen.tsx',
  ];
  // Every module the crash path may import. A network client, a storage write or an
  // analytics SDK joining this list is the change D9 ruled out; it fails here first.
  const ALLOWED_IMPORTS = new Set([
    'react',
    'react-native',
    'zustand',
    'expo-status-bar',
    'expo-splash-screen',
    '../store/crashStore',
    '../constants/theme',
    './CrashScreen',
    './ui/ThemedText',
    './ui/PrimaryButton',
  ]);

  it.each(FILES)('%s imports only the allowed modules', (file) => {
    const src = readFileSync(join(ROOT, file), 'utf8');
    const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports.filter((i) => !ALLOWED_IMPORTS.has(i))).toEqual([]);
  });

  it.each(FILES)('%s makes no network or storage call', (file) => {
    const src = readFileSync(join(ROOT, file), 'utf8');
    expect(src).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|supabase|AsyncStorage|SecureStore|getDb\(/);
  });

  it('the failure paths call no network', () => {
    const fetchSpy = jest.fn();
    const g = globalThis as { fetch?: unknown };
    const realFetch = g.fetch;
    g.fetch = fetchSpy;
    try {
      const eu = fakeErrorUtils(jest.fn());
      const hermes = fakeHermes();
      installCrashHandlers({ errorUtils: eu, hermes, isDev: false });
      eu.fire(new Error('boom'), true);
      hermes.holder.options?.onUnhandled(2, 'rejected');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      g.fetch = realFetch;
    }
  });
});
