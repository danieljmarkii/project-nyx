// CUL-690 — `lib/appInfo.ts` must survive a device with no `expo-updates` native
// module, because it is imported at the top of `app/settings.tsx` and
// `app/settings/feedback.tsx`. A throw here is a blank screen on a screen every
// owner opens, caused by a line whose only job is to report a diagnostic.
//
// This file exists because the bug it pins shipped in the first draft and no test
// could see it. Two reasons, both worth stating:
//
//  1. jest-expo auto-mocks native modules, so `expo-updates` resolves to a generic
//     stub in this environment and `require` never throws. The "native module
//     absent" path is therefore UNREACHABLE from a normal test and has to be
//     constructed — which is what `jest.mock` with a throwing factory does below.
//  2. `app/settings.test.tsx` asserts the foot's second line MOUNTS, deriving its
//     expected value from the same exports it is checking. That is the right test
//     for "is the line rendered" and is structurally incapable of catching this:
//     it never varies the environment the exports are read from.
//
// So the guard is here, at the boundary the failure actually crosses.

describe('lib/appInfo — a missing expo-updates native module (CUL-690)', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('expo-updates');
  });

  it('does not throw while loading, and degrades to the unreadable state', () => {
    // The real failure, reproduced: `expo-updates/build/ExpoUpdates.js` calls
    // `requireNativeModule('ExpoUpdates')` at ITS module scope, and that throws
    // `Cannot find native module 'ExpoUpdates'` when the native side is absent. A
    // factory that throws puts the error at the same point — module evaluation of
    // `expo-updates`, i.e. while `lib/appInfo` is resolving it.
    jest.doMock('expo-updates', () => {
      throw new Error("Cannot find native module 'ExpoUpdates'");
    });

    jest.resetModules();
    let appInfo: typeof import('./appInfo') | null = null;
    // The assertion is on the LOAD, not on a call: with a static top-level import
    // of expo-updates this line throws and the module never evaluates, which is
    // precisely the blank screen. `toThrow` on a require is the only place that
    // distinguishes a static import from a require inside the try.
    expect(() => {
      appInfo = require('./appInfo');
    }).not.toThrow();

    const info = appInfo as unknown as typeof import('./appInfo');
    expect(info.JS_UPDATE_ID).toBeNull();
    expect(info.JS_CHANNEL).toBeNull();
    expect(info.JS_IS_EMBEDDED).toBe(false);
  });

  it('still reports the binary identifiers, which do not depend on expo-updates', () => {
    // The degradation must be LOCAL to the JS-bundle line. A device that cannot
    // read its update id can still name its binary, and losing both would make the
    // support mail worse than before this feature existed.
    jest.doMock('expo-updates', () => {
      throw new Error("Cannot find native module 'ExpoUpdates'");
    });

    jest.resetModules();
    const info = require('./appInfo') as typeof import('./appInfo');
    expect(info.APP_VERSION).not.toBeUndefined();
    expect(info.PLATFORM).toContain('ios');
  });

  it('reads the module when it IS present, rather than always reporting unknown', () => {
    // The other direction, and the one that stops the fix degenerating into "always
    // return the unreadable state": a catch wide enough to swallow a working read
    // would pass every assertion above while reporting nothing on a real device.
    jest.doMock('expo-updates', () => ({
      updateId: '9f6c6d92-b104-45f1-a6e8-5073b9597174',
      channel: 'production',
      isEmbeddedLaunch: false,
    }));

    jest.resetModules();
    const info = require('./appInfo') as typeof import('./appInfo');
    expect(info.JS_UPDATE_ID).toBe('9f6c6d92-b104-45f1-a6e8-5073b9597174');
    expect(info.JS_CHANNEL).toBe('production');
    expect(info.JS_IS_EMBEDDED).toBe(false);
  });

  it('reports an embedded launch as embedded', () => {
    jest.doMock('expo-updates', () => ({
      updateId: null,
      channel: null,
      isEmbeddedLaunch: true,
    }));

    jest.resetModules();
    const info = require('./appInfo') as typeof import('./appInfo');
    expect(info.JS_IS_EMBEDDED).toBe(true);
  });

  it('treats a property that throws on READ the same as a missing module', () => {
    // The failure the original try/catch DID cover, kept covered by the move: a
    // module that resolves but whose getters throw.
    jest.doMock('expo-updates', () => ({
      get updateId(): string | null {
        throw new Error('native call failed');
      },
      get channel(): string | null {
        return null;
      },
      isEmbeddedLaunch: false,
    }));

    jest.resetModules();
    let appInfo: typeof import('./appInfo') | null = null;
    expect(() => {
      appInfo = require('./appInfo');
    }).not.toThrow();
    expect((appInfo as unknown as typeof import('./appInfo')).JS_UPDATE_ID).toBeNull();
  });
});
