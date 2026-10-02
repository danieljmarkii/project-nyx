import { isCustomWindowEdit, CUSTOM_RANGE_SETTLE_MS, reportScopeLine } from './reportRange';

// CUL-371 — the one predicate behind the report's settle timer. Only an edit of a
// custom window already on screen waits; every other change regenerates at once.

const custom = (startDate: string, endDate: string, petId = 'p1') => ({ petId, startDate, endDate });
const dflt = (petId = 'p1') => ({ petId });

describe('isCustomWindowEdit', () => {
  it('From moved inside Custom — waits', () => {
    expect(isCustomWindowEdit(custom('2026-06-01', '2026-07-01'), custom('2026-06-10', '2026-07-01'))).toBe(true);
  });

  it('To moved inside Custom — waits', () => {
    expect(isCustomWindowEdit(custom('2026-06-01', '2026-07-01'), custom('2026-06-01', '2026-07-10'))).toBe(true);
  });

  it('Default → Custom is a new report, not an edit — immediate', () => {
    expect(isCustomWindowEdit(dflt(), custom('2026-06-01', '2026-07-01'))).toBe(false);
  });

  it('Custom → Default is a new report — immediate', () => {
    expect(isCustomWindowEdit(custom('2026-06-01', '2026-07-01'), dflt())).toBe(false);
  });

  it('a pet change is a new report even when both sides are custom — immediate', () => {
    expect(isCustomWindowEdit(custom('2026-06-01', '2026-07-01', 'p1'), custom('2026-06-01', '2026-07-01', 'p2'))).toBe(false);
  });

  it('the first request (no previous) and a lost pet (no next) are immediate', () => {
    expect(isCustomWindowEdit(null, custom('2026-06-01', '2026-07-01'))).toBe(false);
    expect(isCustomWindowEdit(custom('2026-06-01', '2026-07-01'), null)).toBe(false);
  });

  it('nothing moved is not an edit', () => {
    expect(isCustomWindowEdit(custom('2026-06-01', '2026-07-01'), custom('2026-06-01', '2026-07-01'))).toBe(false);
  });

  it('the settle window covers a From tap followed by a To tap without feeling ignored', () => {
    expect(CUSTOM_RANGE_SETTLE_MS).toBeGreaterThanOrEqual(300);
    expect(CUSTOM_RANGE_SETTLE_MS).toBeLessThanOrEqual(1000);
  });
});

describe('reportScopeLine (H-10, CUL-1126)', () => {
  const TODAY = '2026-09-25';

  it('names the visit rung as History names the window, the range bare in the current year', () => {
    expect(reportScopeLine('since_visit', '2026-07-02', '2026-09-25', TODAY)).toBe(
      'Since the last vet visit · Jul 2 – Sep 25',
    );
  });

  it('stamps the year a visit fourteen months back needs (the issue\'s counterexample)', () => {
    expect(reportScopeLine('since_visit', '2025-07-02', '2026-09-25', TODAY)).toBe(
      'Since the last vet visit · Jul 2, 2025 – Sep 25',
    );
  });

  it('a window wholly in another year states its year once', () => {
    expect(reportScopeLine('custom', '2025-06-01', '2025-08-30', TODAY)).toBe(
      'Custom range · Jun 1 – Aug 30, 2025',
    );
  });

  it('keeps the other bases\' names', () => {
    expect(reportScopeLine('diet_trial', '2026-07-26', '2026-09-25', TODAY)).toBe(
      'Active diet trial · Jul 26 – Sep 25',
    );
    expect(reportScopeLine('fallback_90d', '2026-06-28', '2026-09-25', TODAY)).toBe(
      'Last 90 days · Jun 28 – Sep 25',
    );
    expect(reportScopeLine('something_new', '2026-09-01', '2026-09-25', TODAY)).toBe(
      'Report range · Sep 1 – 25',
    );
  });

  it('an unreadable or inverted pair prints the basis alone, never a window the report never had', () => {
    expect(reportScopeLine('since_visit', 'garbage', '2026-09-25', TODAY)).toBe('Since the last vet visit');
    expect(reportScopeLine('custom', '2026-09-25', '2026-09-01', TODAY)).toBe('Custom range');
  });
});
