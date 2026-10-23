// CUL-2106 — a fresh log whose card is lost before its trial heads-up shows hands the
// heads-up to the meal's own screen. Against the REAL card store, the REAL meal-screen
// store and the REAL one-per-food ledger (AsyncStorage's jest mock); only the evaluator,
// the read, is stubbed.
//
// What must hold: a lost card (`card_gone`, or `patch_refused` on a dismissed or replaced
// card) hands the heads-up on as a fresh log's; the hand-off spends nothing; an undone meal
// or a card already flagged hands nothing; an edit of the meal made meanwhile wins.

import { readFileSync } from 'fs';
import { join } from 'path';
import { blankComments } from '../guards/blankComments';

jest.mock('./haptics', () => ({
  commitRoutine: jest.fn(),
  commitSymptom: jest.fn(),
  selectChip: jest.fn(),
  destructiveConfirm: jest.fn(),
}));
jest.mock('./undoLog', () => ({ reverseLoggedEvent: jest.fn() }));
jest.mock('../store/eventStore', () => ({
  useEventStore: { getState: () => ({ removeFromToday: jest.fn() }) },
}));
const mockFirst = jest.fn();
jest.mock('./db', () => ({ getDb: () => ({ getFirstAsync: (...a: unknown[]) => mockFirst(...a) }) }));

const mockEvaluateMeal = jest.fn();
jest.mock('./trialContaminant', () => ({
  ...jest.requireActual('./trialContaminant'),
  evaluateMealLogTimeFlag: (...a: unknown[]) => mockEvaluateMeal(...a),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMomentStore, type MealPayload } from '../store/momentStore';
import { useMealScreenFlagStore } from '../store/mealScreenFlagStore';
import { applyMealScreenTrialFlag, applyMealTrialFlag, claimLostLogHandOff } from './mealTrialFlag';
import { clearTrialHeadsUpLedger, hasFlaggedFoodInTrial, type LogTimeTrialFlag } from './trialContaminant';

const TRIAL = 'trial-1';
const EVENT = 'ev-1';
const ARGS = { eventId: EVENT, petId: 'pet-1', foodId: 'turkey', occurredAt: '2026-10-22T07:30:00.000Z' };
const FLAG: LogTimeTrialFlag = {
  kind: 'off_trial_list', trialId: TRIAL, foodId: 'turkey',
  trialStartedAt: '2026-10-01T07:00:00.000Z', trialTargetDurationDays: 42,
};
const TURKEY = { id: 'turkey', brand: 'Hill’s', product_name: 'Turkey', food_type: 'meal' };

function card(eventId: string, extra: Partial<MealPayload> = {}): MealPayload {
  return { kind: 'meal', eventId, ...extra } as MealPayload;
}

/** Runs the log path with the card's reveal wait timed out. */
async function withCardWaitTimedOut<T>(run: () => Promise<T>): Promise<T> {
  jest.useFakeTimers();
  try {
    const out = run();
    await jest.advanceTimersByTimeAsync(5000);
    return await out;
  } finally {
    jest.useRealTimers();
  }
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await clearTrialHeadsUpLedger();
  useMealScreenFlagStore.getState().reset();
  useMomentStore.setState({ visible: false, payload: null, removed: false, undoing: null });
  mockEvaluateMeal.mockResolvedValue(FLAG);
  mockFirst.mockImplementation(async (sql: string) =>
    sql.includes('FROM events')
      ? { pet_id: 'pet-1', occurred_at: ARGS.occurredAt }
      : { brand: 'Hill’s', product_name: 'Turkey', food_type: 'meal' });
});

describe('a fresh log whose card is lost hands its heads-up to the meal\'s screen (CUL-2106)', () => {
  it('card_gone: a newer log took the card first; handed on as a fresh log\'s, nothing spent', async () => {
    // The newer log's card is up; this meal's never reveals.
    useMomentStore.setState({ visible: true, payload: card('ev-newer') });
    await expect(withCardWaitTimedOut(() => applyMealTrialFlag(ARGS))).resolves.toBe('card_gone');
    expect(useMealScreenFlagStore.getState().pending[EVENT]).toEqual({ flag: FLAG, food: TURKEY, origin: 'log' });
    expect(await hasFlaggedFoodInTrial(TRIAL, 'turkey')).toBe(false);
  });

  it('patch_refused: the card revealed, then went before the patch; handed on, nothing spent', async () => {
    const out = applyMealTrialFlag(ARGS);
    // Reveal, and in the same tick the owner dismisses it (or a newer log replaces it):
    // the wait has resolved, so the patch meets a card that is no longer up.
    await Promise.resolve();
    useMomentStore.setState({ visible: true, payload: card(EVENT) });
    useMomentStore.setState({ visible: false });
    await expect(out).resolves.toBe('patch_refused');
    expect(useMealScreenFlagStore.getState().pending[EVENT]).toEqual({ flag: FLAG, food: TURKEY, origin: 'log' });
    expect(await hasFlaggedFoodInTrial(TRIAL, 'turkey')).toBe(false);
  });

  it('patch_refused on an undone meal hands nothing: the meal is gone', async () => {
    useMomentStore.setState({ visible: true, payload: card(EVENT), removed: true });
    await expect(applyMealTrialFlag(ARGS)).resolves.toBe('patch_refused');
    expect(useMealScreenFlagStore.getState().pending[EVENT]).toBeUndefined();
  });

  it('patch_refused on a card already showing a heads-up hands nothing: it is on screen', async () => {
    useMomentStore.setState({ visible: true, payload: card(EVENT, { trialFlag: FLAG }) });
    await expect(applyMealTrialFlag(ARGS)).resolves.toBe('patch_refused');
    expect(useMealScreenFlagStore.getState().pending[EVENT]).toBeUndefined();
  });

  it('a card that shows it keeps it there and hands nothing on', async () => {
    useMomentStore.setState({ visible: true, payload: card(EVENT) });
    await expect(applyMealTrialFlag(ARGS)).resolves.toBe('shown');
    expect(useMealScreenFlagStore.getState().pending[EVENT]).toBeUndefined();
    expect(await hasFlaggedFoodInTrial(TRIAL, 'turkey')).toBe(true);
  });

  it('an edit of the meal made while the log waited wins over the lost log\'s hand-off', async () => {
    const out = withCardWaitTimedOut(async () => {
      const log = applyMealTrialFlag(ARGS);
      // The owner changes the meal to a food with nothing to say before the wait ends.
      mockEvaluateMeal.mockResolvedValueOnce(null);
      await applyMealScreenTrialFlag(EVENT, 'rabbit');
      return log;
    });
    await expect(out).resolves.toBe('card_gone');
    expect(useMealScreenFlagStore.getState().pending[EVENT]).toBeUndefined();
  });
});

describe('the photo-capture log hands a lost heads-up on too (CUL-2106)', () => {
  it('the claimed hand-off hands it as a fresh log\'s and spends nothing', async () => {
    await claimLostLogHandOff(EVENT)(FLAG);
    expect(useMealScreenFlagStore.getState().pending[EVENT]).toEqual({ flag: FLAG, food: TURKEY, origin: 'log' });
    expect(await hasFlaggedFoodInTrial(TRIAL, 'turkey')).toBe(false);
  });

  it('claimed at commit: an edit made while the card wait runs out wins over it', async () => {
    const handOff = claimLostLogHandOff(EVENT);
    // The owner changes the meal to a food with nothing to say before the wait times out.
    mockEvaluateMeal.mockResolvedValueOnce(null);
    await applyMealScreenTrialFlag(EVENT, 'rabbit');
    await handOff(FLAG);
    expect(useMealScreenFlagStore.getState().pending[EVENT]).toBeUndefined();
  });

  it('app/food-capture.tsx claims at commit, spends on a shown card and hands on a lost one', () => {
    const src = blankComments(readFileSync(join(__dirname, '..', 'app', 'food-capture.tsx'), 'utf8'));
    expect(src).toMatch(
      /const handOff = claimLostLogHandOff\(loggedMeal\.eventId\);\s*void whenMealCardVisible\(loggedMeal\.eventId\)\s*\.then\(\(shown\) => \(shown\s*\?\s*noteTrialFlagShown\(cardTrialFlag, loggedMeal\.eventId\)\s*:\s*handOff\(cardTrialFlag\)\)\)/,
    );
  });
});
