// The Signal's falling-pair gates (CUL-1216). The surface-level cases live with the card and
// the screen (`signalLead.test.ts`, `signalScreen.test.ts`); these pin the shared ratio and
// its edges, derived from the shipped constant rather than restated (C-34).

import { loggingComparable } from './signalWithhold';
import { TRIAL_RESPONSE_COUNTS_DEFAULTS } from './trialResponseCounts';

const RATIO = TRIAL_RESPONSE_COUNTS_DEFAULTS.densityComparableMinRatio;

describe('loggingComparable — the strip’s and the engine’s ratio, mirrored', () => {
  it('equal fractions are comparable; the boundary is the shipped ratio, both directions', () => {
    expect(loggingComparable({ logged: 7, loggable: 7 }, { logged: 7, loggable: 7 })).toBe(true);
    // Exactly at the ratio: comparable. One logged day under it: not.
    const at = Math.ceil(100 * RATIO);
    expect(loggingComparable({ logged: 100, loggable: 100 }, { logged: at, loggable: 100 })).toBe(true);
    expect(loggingComparable({ logged: 100, loggable: 100 }, { logged: at - 1, loggable: 100 })).toBe(false);
    expect(loggingComparable({ logged: at - 1, loggable: 100 }, { logged: 100, loggable: 100 })).toBe(false);
  });

  it('the issue’s counterexample: 4 of 7 days against 7 of 7 is not comparable', () => {
    expect(loggingComparable({ logged: 7, loggable: 7 }, { logged: 4, loggable: 7 })).toBe(false);
  });

  it('fractions, not counts: a partial week logged every day it has had is comparable with a full one', () => {
    expect(loggingComparable({ logged: 7, loggable: 7 }, { logged: 3, loggable: 3 })).toBe(true);
  });

  it('a window with no loggable day has nothing to compare: never comparable', () => {
    expect(loggingComparable({ logged: 0, loggable: 0 }, { logged: 7, loggable: 7 })).toBe(false);
    expect(loggingComparable({ logged: 7, loggable: 7 }, { logged: 0, loggable: 0 })).toBe(false);
  });

  it('two windows with no logging at all are alike (nothing to withhold — and no fall to show)', () => {
    expect(loggingComparable({ logged: 0, loggable: 7 }, { logged: 0, loggable: 7 })).toBe(true);
  });
});
