// applyMealTrialFlag — the one log-time trial-flag orchestration (CUL-354 / B-711).
//
// Two halves, two directions:
//   • ORDER — every gate stops the next, and the ledger write is last. The call
//     order is asserted off a single shared log rather than per-mock call counts,
//     because `toHaveBeenCalled` cannot see that the budget was spent BEFORE the
//     card was patched (the exact regression B-710's shape would reintroduce).
//   • ONE COPY — a source scan of the two meal-entry screens. Both used to carry a
//     byte-identical `applyTrialFlag` with a "kept identical" comment; this test
//     reds the build if either grows one back, or reaches past this module to the
//     evaluator / waiter / ledger directly. Read the guard, not the sentence about
//     it: it matches the CALL SHAPES, so a renamed local copy that still wires the
//     evaluator to the store by hand is caught by the import assertions, not the name.

import { readFileSync } from 'fs';
import { join } from 'path';
import { blankComments } from '../guards/blankComments';

const calls: string[] = [];
const mockEvaluate = jest.fn();
const mockNote = jest.fn();
const mockWhenVisible = jest.fn();
const mockPatch = jest.fn();
const mockReschedule = jest.fn();

jest.mock('./trialContaminant', () => ({
  evaluateMealLogTimeFlag: (...a: unknown[]) => { calls.push('evaluate'); return mockEvaluate(...a); },
  noteTrialFlagShown: (...a: unknown[]) => { calls.push('note'); return mockNote(...a); },
}));
jest.mock('../store/momentStore', () => ({
  MEAL_FLAGGED_DURATION_MS: 7000,
  whenMealCardVisible: (...a: unknown[]) => { calls.push('wait'); return mockWhenVisible(...a); },
  useMomentStore: {
    getState: () => ({
      patchTrialFlag: (...a: unknown[]) => { calls.push('patch'); return mockPatch(...a); },
      rescheduleHide: (...a: unknown[]) => { calls.push('reschedule'); return mockReschedule(...a); },
    }),
  },
}));

import { applyMealTrialFlag } from './mealTrialFlag';

const ARGS = { eventId: 'ev1', petId: 'pet1', foodId: 'food1', occurredAt: '2026-09-22T08:00:00.000Z' };
const FLAG = { kind: 'membership', trialId: 'trial1', foodId: 'food1' };

beforeEach(() => {
  calls.length = 0;
  mockEvaluate.mockReset().mockResolvedValue(FLAG);
  mockNote.mockReset().mockResolvedValue(undefined);
  mockWhenVisible.mockReset().mockResolvedValue(true);
  mockPatch.mockReset().mockReturnValue(true);
  mockReschedule.mockReset();
});

describe('applyMealTrialFlag — the gates, in order', () => {
  it('no flag → stops before the card is even waited on', async () => {
    mockEvaluate.mockResolvedValue(null);
    await expect(applyMealTrialFlag(ARGS)).resolves.toBe('no_flag');
    expect(mockEvaluate).toHaveBeenCalledWith({ petId: 'pet1', foodId: 'food1', occurredAt: ARGS.occurredAt });
    expect(calls).toEqual(['evaluate']);
  });

  it('a superseded card → no patch, no dwell, and the budget is NOT spent', async () => {
    // whenMealCardVisible resolves false when a newer log replaced the card before
    // it revealed; recording the ledger here would burn the food's one heads-up on
    // something nobody saw (rule 3).
    mockWhenVisible.mockResolvedValue(false);
    await expect(applyMealTrialFlag(ARGS)).resolves.toBe('card_gone');
    expect(mockWhenVisible).toHaveBeenCalledWith('ev1');
    expect(calls).toEqual(['evaluate', 'wait']);
    expect(mockNote).not.toHaveBeenCalled();
  });

  it('a refused patch (dismissed / undone / another meal) → no dwell, budget NOT spent', async () => {
    mockPatch.mockReturnValue(false);
    await expect(applyMealTrialFlag(ARGS)).resolves.toBe('patch_refused');
    expect(mockPatch).toHaveBeenCalledWith('ev1', FLAG);
    expect(calls).toEqual(['evaluate', 'wait', 'patch']);
    expect(mockReschedule).not.toHaveBeenCalled();
    expect(mockNote).not.toHaveBeenCalled();
  });

  it('landed → waits, patches, extends the dwell, and spends the budget LAST', async () => {
    await expect(applyMealTrialFlag(ARGS)).resolves.toBe('shown');
    expect(calls).toEqual(['evaluate', 'wait', 'patch', 'reschedule', 'note']);
    expect(mockReschedule).toHaveBeenCalledWith(7000);
    expect(mockNote).toHaveBeenCalledWith(FLAG);
  });

  it('the picker path is the reason for the wait: the evaluation resolves before the card reveals', async () => {
    // Model the picker path: the card reveals on a later tick than the (all-local)
    // evaluation. The patch must still land — i.e. it must run AFTER the reveal,
    // never race ahead of it (B-710).
    let reveal!: () => void;
    mockWhenVisible.mockImplementation(() => new Promise<boolean>((res) => { reveal = () => res(true); }));
    const pending = applyMealTrialFlag(ARGS);
    await Promise.resolve(); // let the evaluation settle
    expect(calls).toEqual(['evaluate', 'wait']);
    expect(mockPatch).not.toHaveBeenCalled();
    reveal();
    await expect(pending).resolves.toBe('shown');
    expect(calls).toEqual(['evaluate', 'wait', 'patch', 'reschedule', 'note']);
  });
});

describe('one copy — the meal-entry doors call this module and re-implement nothing', () => {
  const ROOT = join(__dirname, '..');
  // The picker, the FAB quick-add, and the Noticed card's *Didn't eat* door (CUL-893).
  // `app/food-capture.tsx` is not here on purpose: it writes a brand-new food that is
  // not in the cache yet, so it surfaces the CONTENTS flag through its own path and
  // never calls the evaluator (see its attemptCommit).
  const SCREENS = ['app/log.tsx', 'components/log/FAB.tsx', 'components/log/IntakeFirstMealSheet.tsx'];

  // The three pieces a local re-copy would have to reach for. A screen that imports
  // any of them has the makings of a second orchestration, whatever it names it.
  const REACHED_PAST = ['evaluateMealLogTimeFlag', 'noteTrialFlagShown', 'whenMealCardVisible'];

  it.each(SCREENS)('%s calls applyMealTrialFlag and declares no local orchestration', (rel) => {
    // Comments blanked first (C-18): a screen's prose may legitimately NAME the
    // waiter or the evaluator while explaining why it no longer calls them.
    const src = blankComments(readFileSync(join(ROOT, rel), 'utf8'));
    // Non-vacuity: the screen still logs meals through this module.
    expect(src).toMatch(/import \{[^}]*\bapplyMealTrialFlag\b[^}]*\} from '[./]+\/lib\/mealTrialFlag'/);
    expect(src).toMatch(/\bapplyMealTrialFlag\(/);
    expect(src).not.toMatch(/function\s+applyTrialFlag\s*\(/);
    for (const name of REACHED_PAST) {
      expect(src).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  it('this module is the only non-test app source that wires the evaluator to the store', () => {
    // Beyond the known doors: nobody else composes evaluateMealLogTimeFlag with
    // patchTrialFlag. A new meal-entry door must come through here.
    const { readdirSync } = require('fs') as typeof import('fs');
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full); continue; }
        if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
        const rel = full.slice(ROOT.length + 1);
        if (rel === 'lib/mealTrialFlag.ts' || rel === 'lib/trialContaminant.ts') continue;
        const src = blankComments(readFileSync(full, 'utf8'));
        // CALL shapes, not bare names: momentStore DEFINES `patchTrialFlag:` and prose
        // elsewhere names the evaluator; only a file that CALLS both is a second door.
        if (/\bevaluateMealLogTimeFlag\s*\(/.test(src) && /\bpatchTrialFlag\s*\(/.test(src)) offenders.push(rel);
      }
    };
    for (const dir of ['app', 'components', 'lib', 'store', 'hooks']) walk(join(ROOT, dir));
    expect(offenders).toEqual([]);
  });
});
