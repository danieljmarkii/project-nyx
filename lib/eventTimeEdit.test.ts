// The two counterexamples the `adversarial-reviewer` broke B-448's first cut
// with, plus the transitions that must keep working around them.
//
// Both defects were the same missing line — a segmented control fires its
// handler on the segment that is ALREADY selected, and neither screen checked.
// The damage was asymmetric and worst on the edit screen, where there is a
// stored classification to destroy.

import {
  resolveTimeModeChange,
  resolveFoundModeChange,
  DEFAULT_WINDOW_SPAN_MS,
} from './eventTimeEdit';

describe('resolveTimeModeChange', () => {
  describe('the no-op re-tap (adversarial counterexamples 1 and 2)', () => {
    it('does nothing when "Found it" is re-tapped while already on found', () => {
      // Counterexample 1, the worst of the two. A row stored `estimated` at
      // 04:10 reconstructs to mode 'found'. Re-tapping the highlighted "Found
      // it" used to reset the sub-mode to 'before' and the latest edge to now —
      // so the save wrote confidence 'window' AND, because occurred_at for a
      // window derives from the latest edge (migration 012), re-dated the event
      // to the moment of editing. Nothing on screen changed to warn the owner.
      const t = resolveTimeModeChange('found', 'found', false);
      expect(t).toEqual({
        noOp: true,
        seedFoundMode: null,
        seedLatestFrom: null,
        asserted: false,
      });
    });

    it('asserts nothing when "Saw it happen" is re-tapped while already on saw', () => {
      // Counterexample 2 — B-448 itself surviving its own fix, at a cost of one
      // tap. An unclassified (NULL) row renders identically to a witnessed one,
      // so the control already displays a claim the record does not hold; one
      // tap on the highlighted segment used to make that display permanent.
      expect(resolveTimeModeChange('saw', 'saw', false).asserted).toBe(false);
      expect(resolveTimeModeChange('saw', 'saw', false).noOp).toBe(true);
    });

    it('re-tapping is a no-op regardless of the EXIF seed', () => {
      expect(resolveTimeModeChange('found', 'found', true).noOp).toBe(true);
    });
  });

  describe('a real switch still seeds and still asserts', () => {
    it('entering found opens an open-ended window seeded at now', () => {
      expect(resolveTimeModeChange('saw', 'found', false)).toEqual({
        noOp: false,
        seedFoundMode: 'before',
        seedLatestFrom: 'now',
        asserted: true,
      });
    });

    it('entering found from a photo seeds the edge from the EXIF point', () => {
      // A photo of discovered evidence is stamped at discovery — the window's
      // latest edge — so it is the honest seed.
      expect(resolveTimeModeChange('saw', 'found', true).seedLatestFrom).toBe('point');
    });

    it('returning to saw asserts witnessed and seeds nothing', () => {
      expect(resolveTimeModeChange('found', 'saw', false)).toEqual({
        noOp: false,
        seedFoundMode: null,
        seedLatestFrom: null,
        asserted: true,
      });
    });

    it('gives an owner a real route to classify a NULL row as witnessed', () => {
      // The cost of fixing counterexample 2: asserting 'witnessed' on a row that
      // already displays "Saw it happen" now takes two taps (out and back). That
      // is the correct trade — the one-tap version was indistinguishable from
      // not touching the control at all.
      expect(resolveTimeModeChange('saw', 'found', false).asserted).toBe(true);
      expect(resolveTimeModeChange('found', 'saw', false).asserted).toBe(true);
    });
  });
});

describe('resolveFoundModeChange', () => {
  it('does nothing when the current sub-mode is re-tapped', () => {
    // Same class as counterexample 1. The old handler's seeds were internally
    // guarded (`m === 'around' && foundMode !== 'around'`) so state survived —
    // but it still marked the confidence owner-asserted, which is a claim the
    // owner did not make.
    for (const m of ['around', 'before', 'between'] as const) {
      expect(resolveFoundModeChange(m, m, false)).toEqual({
        noOp: true,
        seedEstimatedFromLatest: false,
        seedEarliest: false,
        asserted: false,
      });
    }
  });

  it('seeds the estimate from the discovery time when switching to around', () => {
    expect(resolveFoundModeChange('before', 'around', false)).toEqual({
      noOp: false,
      seedEstimatedFromLatest: true,
      seedEarliest: false,
      asserted: true,
    });
  });

  it('opens a lower bound the first time a window is opened', () => {
    expect(resolveFoundModeChange('before', 'between', false).seedEarliest).toBe(true);
  });

  it('does not clobber a lower bound the owner already set', () => {
    // Re-entering 'between' after stepping away must keep their edge.
    expect(resolveFoundModeChange('around', 'between', true).seedEarliest).toBe(false);
  });

  it('exposes the default span as a constant both screens share', () => {
    expect(DEFAULT_WINDOW_SPAN_MS).toBe(2 * 60 * 60 * 1000);
  });
});
