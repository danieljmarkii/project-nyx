// Tests for the AI summary's PURE client helpers (B-023 PR 4).
//
// The supabase cache READ (readSummaryCache) is thin I/O, exercised by the Manual QA Script
// (the repo convention — I/O wrappers aren't jest-mocked; pure logic is tested). These cover
// the staleness/state logic the dashboard branches on and the never-reassure invariant on the
// client building copy (the client mirror of clinical-guardrails Pattern 8).

import {
  isSummaryCacheStale,
  deriveSummaryState,
  summaryBuildingCopy,
  summaryGroundingLabel,
  type CachedSummary,
  type SummaryCacheRow,
} from './summaryCopy';

const NOW = Date.parse('2026-06-14T12:00:00.000Z');

function summary(over: Partial<CachedSummary> = {}): CachedSummary {
  return { text: 'Pixel was quiet this month.', source: 'template', evidence: ['intake'], hasSafety: false, quiet: true, ...over };
}
function row(over: Partial<SummaryCacheRow> = {}): SummaryCacheRow {
  return { summary: summary(), expiresAt: new Date(NOW + 60_000).toISOString(), ...over };
}

describe('isSummaryCacheStale', () => {
  it('is stale when there is no row', () => {
    expect(isSummaryCacheStale(null, NOW)).toBe(true);
  });
  it('is fresh before the TTL', () => {
    expect(isSummaryCacheStale(row({ expiresAt: new Date(NOW + 60_000).toISOString() }), NOW)).toBe(false);
  });
  it('is stale at/after the TTL', () => {
    expect(isSummaryCacheStale(row({ expiresAt: new Date(NOW - 1).toISOString() }), NOW)).toBe(true);
  });
  it('is stale when expiresAt is unparseable', () => {
    expect(isSummaryCacheStale(row({ expiresAt: 'not-a-date' }), NOW)).toBe(true);
  });
});

describe('deriveSummaryState', () => {
  it('is building with no summary', () => {
    expect(deriveSummaryState(null)).toBe('building');
  });
  it('is building when the text is empty/whitespace', () => {
    expect(deriveSummaryState(summary({ text: '   ' }))).toBe('building');
  });
  it('is ready with summary text', () => {
    expect(deriveSummaryState(summary({ text: 'Pixel had vomiting on 5 of the last 7 days — see your vet.' }))).toBe('ready');
  });
});

describe('summaryBuildingCopy', () => {
  it('names the pet, is forward-looking, never reassures, no "!"', () => {
    const copy = summaryBuildingCopy('Pixel');
    expect(copy).toContain('Pixel');
    expect(copy).not.toContain('!');
    expect(/\b(fine|okay|healthy|all clear|doing well|nothing to worry|no concern)\b/i.test(copy)).toBe(false);
  });
  it('falls back to a generic subject for a blank name', () => {
    expect(summaryBuildingCopy('  ')).toContain('your pet');
  });
});

describe('summaryGroundingLabel', () => {
  it('names both areas when present', () => {
    expect(summaryGroundingLabel(['symptom', 'intake'])).toBe('Based on the symptom and meal cards below');
  });
  it('names one area', () => {
    expect(summaryGroundingLabel(['intake'])).toBe('Based on the meal cards below');
  });
  it('degrades gracefully with no evidence', () => {
    expect(summaryGroundingLabel([])).toBe('Based on the cards below');
  });
});
