// CUL-2106 (adversarial pass 1) — isMealInRunningTrial: a heads-up waiting on a meal's
// screen asks whether the meal, as it stands now, is still a feeding inside the running
// trial. An edit can backdate it to before the trial; spending the food's one warning
// on that pre-trial feeding would silence its next real one.
//
// Timezone-honest (C-29): the trial's start is a local DATE and every meal time is built
// from local components, so the day boundary is the one the app reads.
jest.mock('./supabase', () => ({ supabase: {} }));

let mockTrialRow: { id: string; started_at: string; ended_at: string | null; target_duration_days: number; target_protein: null } | null = null;
let mockEventRow: { occurred_at: string } | null = null;
let mockThrow = false;
jest.mock('./db', () => ({
  getDb: () => ({
    getFirstAsync: async (sql: string) => {
      if (mockThrow) throw new Error('disk');
      if (sql.includes('diet_trials')) return mockTrialRow;
      if (sql.includes('FROM events')) return sql.includes('deleted_at IS NULL') ? mockEventRow : null;
      return null;
    },
    getAllAsync: async () => [],
  }),
}));

import { clearTrialContextCache, isMealInRunningTrial } from './trialContaminant';

function localDay(daysAgo: number): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysAgo);
}
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function mealAt(daysAgo: number, hour: number): string {
  const d = localDay(daysAgo);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour).toISOString();
}

beforeEach(() => {
  clearTrialContextCache();
  mockThrow = false;
  mockTrialRow = { id: 'trial-1', started_at: isoDate(localDay(10)), ended_at: null, target_duration_days: 42, target_protein: null };
  mockEventRow = { occurred_at: mealAt(0, 8) };
});

describe('isMealInRunningTrial (CUL-2106)', () => {
  it('a meal inside the running trial: true', async () => {
    await expect(isMealInRunningTrial('pet-1', 'trial-1', 'ev-1')).resolves.toBe(true);
  });

  it('the trial\'s first day counts', async () => {
    mockEventRow = { occurred_at: mealAt(10, 0) };
    await expect(isMealInRunningTrial('pet-1', 'trial-1', 'ev-1')).resolves.toBe(true);
  });

  it('a meal moved to before the trial started: false, so the line never spends on it', async () => {
    mockEventRow = { occurred_at: mealAt(11, 23) };
    await expect(isMealInRunningTrial('pet-1', 'trial-1', 'ev-1')).resolves.toBe(false);
  });

  it('a deleted meal is not a feeding', async () => {
    mockEventRow = null;
    await expect(isMealInRunningTrial('pet-1', 'trial-1', 'ev-1')).resolves.toBe(false);
  });

  it('another trial, or none running: false', async () => {
    await expect(isMealInRunningTrial('pet-1', 'trial-2', 'ev-1')).resolves.toBe(false);
    clearTrialContextCache();
    mockTrialRow = null;
    await expect(isMealInRunningTrial('pet-1', 'trial-1', 'ev-1')).resolves.toBe(false);
  });

  it('a failed read keeps the line as it was before this check', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockThrow = true;
    await expect(isMealInRunningTrial('pet-1', 'trial-1', 'ev-1')).resolves.toBe(true);
    warn.mockRestore();
  });
});
