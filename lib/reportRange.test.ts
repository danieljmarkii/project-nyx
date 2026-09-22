import { isCustomWindowEdit, CUSTOM_RANGE_SETTLE_MS } from './reportRange';

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
