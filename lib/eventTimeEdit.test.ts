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
  reconstructTimeControl,
  sourceAfterPointEdit,
  buildTimeFields,
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

  describe('tapping a segment from unclassified (B-527)', () => {
    // Once B-527 seeds a NULL row to mode `null` (neither segment on), the FIRST
    // tap on either segment is a genuine claim — never a no-op — so it must assert.
    // This is the counterpart to the no-op re-tap: from null there is nothing to
    // re-tap, so both directions are real assertions that classify the row.
    it('asserts witnessed when "Saw it happen" is tapped from null', () => {
      expect(resolveTimeModeChange(null, 'saw', false)).toEqual({
        noOp: false,
        seedFoundMode: null,
        seedLatestFrom: null,
        asserted: true,
      });
    });

    it('asserts found and opens a window when "Found it" is tapped from null', () => {
      expect(resolveTimeModeChange(null, 'found', false)).toEqual({
        noOp: false,
        seedFoundMode: 'before',
        seedLatestFrom: 'now',
        asserted: true,
      });
    });

    it('seeds the window edge from a photo when entering found from null', () => {
      expect(resolveTimeModeChange(null, 'found', true).seedLatestFrom).toBe('point');
    });
  });
});

describe('reconstructTimeControl (B-527)', () => {
  it('seeds a witnessed row to the "Saw it happen" segment', () => {
    expect(reconstructTimeControl({ confidence: 'witnessed', earliest: null, latest: null }))
      .toEqual({ mode: 'saw', foundMode: null, earliest: null, latest: null });
  });

  it('seeds an estimated row to found / around', () => {
    expect(reconstructTimeControl({ confidence: 'estimated', earliest: null, latest: null }))
      .toEqual({ mode: 'found', foundMode: 'around', earliest: null, latest: null });
  });

  it('seeds a bounded window to found / between with both edges', () => {
    expect(reconstructTimeControl({
      confidence: 'window',
      earliest: '2026-07-01T02:00:00.000Z',
      latest: '2026-07-01T04:00:00.000Z',
    })).toEqual({
      mode: 'found',
      foundMode: 'between',
      earliest: '2026-07-01T02:00:00.000Z',
      latest: '2026-07-01T04:00:00.000Z',
    });
  });

  it('seeds an open-ended "before" window from the latest edge alone', () => {
    expect(reconstructTimeControl({
      confidence: 'window',
      earliest: null,
      latest: '2026-07-01T04:00:00.000Z',
    })).toEqual({
      mode: 'found',
      foundMode: 'before',
      earliest: null,
      latest: '2026-07-01T04:00:00.000Z',
    });
  });

  it('maps a degenerate lower-edge-only window to "before" off that edge', () => {
    // A window with only an earliest edge is not a shape the UI produces, but a
    // reconstruct must not throw on it — render it as an open-ended "before".
    expect(reconstructTimeControl({
      confidence: 'window',
      earliest: '2026-07-01T02:00:00.000Z',
      latest: null,
    })).toEqual({
      mode: 'found',
      foundMode: 'before',
      earliest: null,
      latest: '2026-07-01T02:00:00.000Z',
    });
  });

  it('seeds a NULL (unclassified) row to NEITHER segment — the B-527 fix', () => {
    // The whole point: an unclassified row holds no claim, so the control must
    // render with neither segment selected (mode null) rather than borrow
    // "Saw it happen". Before B-527 this returned mode 'saw', so a NULL row was
    // pixel-identical to a witnessed one and one tap could make the lie real.
    expect(reconstructTimeControl({ confidence: null, earliest: null, latest: null }))
      .toEqual({ mode: null, foundMode: null, earliest: null, latest: null });
  });

  it('never seeds a NULL row to a segment, whatever stray bounds it carries', () => {
    // Bounds are illegal on a non-window row (chk_occurred_window_fields), but a
    // malformed legacy row must still reconstruct to the absence, never to a
    // borrowed classification.
    expect(reconstructTimeControl({
      confidence: null,
      earliest: '2026-07-01T02:00:00.000Z',
      latest: '2026-07-01T04:00:00.000Z',
    }).mode).toBeNull();
  });
});

describe('sourceAfterPointEdit (B-525)', () => {
  it('flips a picker-edited now-sourced time to manual — the B-525 leak', () => {
    // The live proof: a vomit set to a round 09:00:00 whose source stayed 'now'.
    // A picker edit is an explicit choice, so its provenance is 'manual'.
    expect(sourceAfterPointEdit('now', true)).toBe('manual');
  });

  it('flips a picker-edited exif-sourced time to manual', () => {
    expect(sourceAfterPointEdit('exif', true)).toBe('manual');
  });

  it('keeps now on a peek that changes nothing', () => {
    // Opening the picker and closing it without moving the value asserts nothing.
    expect(sourceAfterPointEdit('now', false)).toBe('now');
  });

  it('keeps exif on a peek so the photo attribution is never silently dropped', () => {
    expect(sourceAfterPointEdit('exif', false)).toBe('exif');
  });

  it('leaves manual as manual either way', () => {
    expect(sourceAfterPointEdit('manual', true)).toBe('manual');
    expect(sourceAfterPointEdit('manual', false)).toBe('manual');
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

// The one derivation shared by the full-screen simple step and the in-sheet
// confirm (B-745 PR 3) — occurred_at is always the single point every reader keys
// off; confidence + bounds carry the uncertainty. Pinned here so the two entry
// points can't derive different rows from the same control state.
describe('buildTimeFields', () => {
  const point = new Date(2026, 7, 13, 17, 33);
  const estimatedAt = new Date(2026, 7, 13, 12, 0);
  const earliest = new Date(2026, 7, 13, 14, 0);
  const latest = new Date(2026, 7, 13, 17, 33);

  it('saw → witnessed at the point, source preserved, no bounds', () => {
    expect(buildTimeFields({
      timeMode: 'saw', foundMode: 'before', point, pointSource: 'exif',
      estimatedAt, earliest: null, latest,
    })).toEqual({ confidence: 'witnessed', occurredAt: point, earliest: null, latest: null, source: 'exif' });
  });

  it('found + before → open-ended window, latest edge only, source manual', () => {
    const tf = buildTimeFields({
      timeMode: 'found', foundMode: 'before', point, pointSource: 'now',
      estimatedAt, earliest: null, latest,
    });
    expect(tf.confidence).toBe('window');
    expect(tf.earliest).toBeNull();          // open-ended: no lower bound
    expect(tf.latest).toBe(latest);
    expect(tf.occurredAt).toBe(latest);      // derived point = latest edge
    expect(tf.source).toBe('manual');
  });

  it('found + between → bounded window with both edges', () => {
    const tf = buildTimeFields({
      timeMode: 'found', foundMode: 'between', point, pointSource: 'now',
      estimatedAt, earliest, latest,
    });
    expect(tf.confidence).toBe('window');
    expect(tf.earliest).toBe(earliest);
    expect(tf.latest).toBe(latest);
    expect(tf.occurredAt).toBe(latest);
  });

  it('found + around → estimated at the estimate, no bounds (full-screen path only)', () => {
    const tf = buildTimeFields({
      timeMode: 'found', foundMode: 'around', point, pointSource: 'now',
      estimatedAt, earliest, latest,
    });
    expect(tf).toEqual({ confidence: 'estimated', occurredAt: estimatedAt, earliest: null, latest: null, source: 'manual' });
  });
});
