// CUL-786 — the labeled stand-down marker's client helpers. Pure; no supabase, no store.

import { isStoodDown, stoodDownExpired, STOOD_DOWN_TTL_DAYS } from './signalCopy';
import type { SignalFinding, StoodDownMarker } from './signal';

const DAY_MS = 86_400_000;
const NOW_MS = Date.parse('2026-09-03T12:00:00.000Z');

const marker = (over: Partial<StoodDownMarker> = {}): StoodDownMarker => ({
  type: 'stood_down',
  priorityClass: 'insight',
  symptomType: 'vomit',
  recencyDays: 14,
  tier: 'firm',
  lastEpisodeIso: '2026-08-19T11:00:00.000Z',
  stoodDownAt: new Date(NOW_MS - 2 * DAY_MS).toISOString(),
  formerRank: 0,
  ...over,
});

describe('isStoodDown', () => {
  it('is true only for the marker type', () => {
    expect(isStoodDown(marker())).toBe(true);
    const chronicity: SignalFinding = {
      type: 'symptom_chronicity',
      priorityClass: 'safety',
      symptomType: 'vomit',
      episodeCount: 12,
      spanDays: 40,
      activeWeeks: 5,
      symptomDays: 12,
      daysSinceLastEpisode: 1,
      firstOnsetIso: '2026-07-05T00:00:00.000Z',
      tier: 'firm',
      windowDays: 56,
    };
    expect(isStoodDown(chronicity)).toBe(false);
  });

  it('a marker is never safety class — it can never lead, rail, or raise the banner', () => {
    expect(marker().priorityClass).toBe('insight');
  });
});

describe('stoodDownExpired', () => {
  it('is live inside the TTL and expired at exactly seven days', () => {
    expect(stoodDownExpired(marker(), NOW_MS)).toBe(false);
    const justInside = marker({ stoodDownAt: new Date(NOW_MS - STOOD_DOWN_TTL_DAYS * DAY_MS + 1).toISOString() });
    expect(stoodDownExpired(justInside, NOW_MS)).toBe(false);
    const atTtl = marker({ stoodDownAt: new Date(NOW_MS - STOOD_DOWN_TTL_DAYS * DAY_MS).toISOString() });
    expect(stoodDownExpired(atTtl, NOW_MS)).toBe(true);
    const past = marker({ stoodDownAt: new Date(NOW_MS - 30 * DAY_MS).toISOString() });
    expect(stoodDownExpired(past, NOW_MS)).toBe(true);
  });

  it('treats an unparseable mint time as expired — no honest clock, no line', () => {
    expect(stoodDownExpired(marker({ stoodDownAt: 'not-a-date' }), NOW_MS)).toBe(true);
    expect(stoodDownExpired(marker({ stoodDownAt: '' }), NOW_MS)).toBe(true);
  });

  it('the TTL mirrors the engine (seven days)', () => {
    expect(STOOD_DOWN_TTL_DAYS).toBe(7);
  });
});
