// The haptic vocabulary's contract (CUL-604 · `docs/nyx-app-polish-requirements.md` §5.6).
//
// Two things are worth a test here, and neither is "does expo-haptics work":
//
//   1. THE TONE SPLIT. `commitSymptom` must not play the success pattern. That is the
//      §5.6 rule with clinical weight behind it — a 2am vomit log acknowledged, never
//      congratulated — and it is exactly the kind of rule a later refactor collapses
//      ("both are commits, share the verb"). Asserting the two map to DIFFERENT
//      expo-haptics APIs makes that collapse fail the build.
//
//   2. NEVER FATAL. A haptic sits on the critical path of a health write. If the
//      taptic engine rejects, the log must still land, so every verb swallows both
//      rejections and synchronous throws and returns void — not a promise a caller
//      could await into their write.

// `mock`-prefixed so jest's hoisting allows the factory to close over them.
const mockImpact = jest.fn(async () => {});
const mockNotification = jest.fn(async () => {});
const mockSelection = jest.fn(async () => {});

jest.mock('expo-haptics', () => ({
  impactAsync: (...a: unknown[]) => mockImpact(...(a as [])),
  notificationAsync: (...a: unknown[]) => mockNotification(...(a as [])),
  selectionAsync: (...a: unknown[]) => mockSelection(...(a as [])),
  ImpactFeedbackStyle: { Light: 'light', Soft: 'soft', Rigid: 'rigid', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

import * as haptics from './haptics';

beforeEach(() => {
  mockImpact.mockClear().mockResolvedValue(undefined);
  mockNotification.mockClear().mockResolvedValue(undefined);
  mockSelection.mockClear().mockResolvedValue(undefined);
});

describe('§5.6 — each moment maps to its documented pattern', () => {
  it('a routine commit plays the success notification', () => {
    haptics.commitRoutine();
    expect(mockNotification).toHaveBeenCalledWith('success');
    expect(mockImpact).not.toHaveBeenCalled();
  });

  it('a symptom commit plays a single soft impact — NEVER the success pattern', () => {
    haptics.commitSymptom();
    expect(mockImpact).toHaveBeenCalledWith('soft');
    // The rule, stated as an assertion: a symptom log must never reach the
    // notification API at all, which is where the celebratory double-tap lives.
    expect(mockNotification).not.toHaveBeenCalled();
  });

  it('symptom and routine are genuinely different patterns', () => {
    haptics.commitRoutine();
    haptics.commitSymptom();
    // Guards the "both are commits, collapse them" refactor: if a future edit points
    // both verbs at one API, one of these two calls disappears and this fails.
    expect(mockNotification).toHaveBeenCalledTimes(1);
    expect(mockImpact).toHaveBeenCalledTimes(1);
  });

  it('a chip select plays the selection tick', () => {
    haptics.selectChip();
    expect(mockSelection).toHaveBeenCalledTimes(1);
  });

  it('opening the FAB / switching pets plays a light impact — not a commit pattern', () => {
    haptics.openMenu();
    expect(mockImpact).toHaveBeenCalledWith('light');
    expect(mockNotification).not.toHaveBeenCalled();
  });

  it('a pull-to-refresh threshold plays a light impact', () => {
    haptics.pullThreshold();
    expect(mockImpact).toHaveBeenCalledWith('light');
  });

  it('a confirmed destructive action plays the rigid impact', () => {
    haptics.destructiveConfirm();
    expect(mockImpact).toHaveBeenCalledWith('rigid');
  });
});

describe('silence on safety (D7) — the absence is the API', () => {
  it('exports exactly the six verbs, and nothing a safety surface could call', () => {
    // There is no `safetyArrival` / `alert` / `warn` verb, deliberately: plainness is
    // the severity signal, and a buzz on bad news is the phone rewarding it. Pinning
    // the export list means adding one is a visible, argued change — not a slip.
    expect(Object.keys(haptics).sort()).toEqual([
      'commitRoutine',
      'commitSymptom',
      'destructiveConfirm',
      'openMenu',
      'pullThreshold',
      'selectChip',
    ]);
  });
});

describe('cosmetic, never fatal', () => {
  it('swallows a rejected haptic — a busy taptic engine cannot break a log write', async () => {
    mockNotification.mockRejectedValue(new Error('Haptics unavailable'));
    expect(() => haptics.commitRoutine()).not.toThrow();
    // Flush the microtask queue: an unhandled rejection here would surface as a test
    // failure/warning, which is the point — the .catch() has to be real.
    await Promise.resolve();
    await Promise.resolve();
  });

  it('swallows a synchronous throw (module absent in a bare context)', () => {
    mockImpact.mockImplementation(() => {
      throw new Error('native module not linked');
    });
    expect(() => haptics.commitSymptom()).not.toThrow();
    expect(() => haptics.destructiveConfirm()).not.toThrow();
  });

  it('returns void, so no verb can be awaited into a write path', () => {
    // A verb that returned the promise would eventually be `await`ed by a caller,
    // putting a cosmetic effect on the critical path of a health record.
    expect(haptics.commitRoutine()).toBeUndefined();
    expect(haptics.selectChip()).toBeUndefined();
  });
});
