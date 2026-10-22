// CUL-2088 — a bowl edit made AWAY from the card (the edit screen's bowl editor, a mix from
// the meal's screen) hands its trial heads-up to the meal's own screen. Against the REAL
// card store, the REAL meal-screen store and the REAL one-per-food ledger (AsyncStorage's
// jest mock); only the evaluator, the read, is stubbed.
//
// What must hold: the heads-up is handed over at once (no 3 s wait for a card that is not
// coming), nothing is spent until the line shows, CUL-2087's give-back still runs, the
// newest edit wins, and an edit with nothing to say clears what an older one left.

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

const mockEvaluateBowl = jest.fn();
const mockEvaluateMeal = jest.fn();
jest.mock('./trialContaminant', () => ({
  ...jest.requireActual('./trialContaminant'),
  evaluateBowlLogTimeFlag: (...a: unknown[]) => mockEvaluateBowl(...a),
  evaluateMealLogTimeFlag: (...a: unknown[]) => mockEvaluateMeal(...a),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMomentStore } from '../store/momentStore';
import { useMealScreenFlagStore } from '../store/mealScreenFlagStore';
import { applyBowlEditTrialFlag, applyMealScreenTrialFlag } from './mealTrialFlag';
import {
  clearTrialHeadsUpLedger,
  hasFlaggedFoodInTrial,
  noteTrialFlagShown,
  type LogTimeTrialFlag,
} from './trialContaminant';

const TRIAL = 'trial-1';
const EVENT = 'ev-1';

function contents(foodId: string, label: string): LogTimeTrialFlag {
  return {
    kind: 'off_diet_protein',
    trialId: TRIAL,
    foodId,
    proteins: ['chicken'],
    trialProteins: ['rabbit'],
    bowl: { foodLabel: label, pastTarget: false },
  };
}

function bowlEdit(foodIds: string[]) {
  return applyBowlEditTrialFlag({
    eventId: EVENT,
    petId: 'pet-1',
    foodId: null,
    components: foodIds.map((f) => ({ foodId: f, foodLabel: f })),
    occurredAt: '2026-10-21T07:30:00.000Z',
    bowlFoodIds: foodIds,
    surface: 'meal_screen',
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await clearTrialHeadsUpLedger();
  useMealScreenFlagStore.getState().reset();
  useMomentStore.setState({ visible: false, payload: null });
  mockFirst.mockImplementation(async (sql: string) =>
    sql.includes('FROM events')
      ? { pet_id: 'pet-1', occurred_at: '2026-10-21T07:30:00.000Z' }
      : { brand: 'Weruva', product_name: 'Chicken Pâté', food_type: 'meal' });
});

describe('a bowl edit off the card hands its heads-up to the meal\'s screen (CUL-2088)', () => {
  it('hands it over at once, with the food the add sheet writes, and spends nothing', async () => {
    const flag = contents('chicken', 'Chicken Pâté');
    mockEvaluateBowl.mockResolvedValue(flag);
    const t0 = Date.now();
    await expect(bowlEdit(['rabbit', 'chicken'])).resolves.toBe('handed');
    // No card wait: the card path would sit out CARD_REVEAL_WAIT_MS (3 s) here.
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(useMealScreenFlagStore.getState().pending[EVENT]).toEqual({
      flag,
      food: { id: 'chicken', brand: 'Weruva', product_name: 'Chicken Pâté', food_type: 'meal' },
    });
    expect(await hasFlaggedFoodInTrial(TRIAL, 'chicken')).toBe(false);
  });

  it('still gives back what this meal spent on a food the edit took out (CUL-2087)', async () => {
    await noteTrialFlagShown(contents('duck', 'Duck'), EVENT);
    mockEvaluateBowl.mockResolvedValue(null);
    await expect(bowlEdit(['rabbit'])).resolves.toBe('no_flag');
    expect(await hasFlaggedFoodInTrial(TRIAL, 'duck')).toBe(false);
  });

  it('an edit with nothing to say clears the heads-up an older edit left waiting', async () => {
    useMealScreenFlagStore.getState().put(EVENT, { flag: contents('chicken', 'Chicken Pâté'), food: null });
    mockEvaluateBowl.mockResolvedValue(null);
    await bowlEdit(['rabbit']);
    expect(useMealScreenFlagStore.getState().pending[EVENT]).toBeUndefined();
  });

  it('the newest edit wins when two finish out of order', async () => {
    let releaseOld: (f: LogTimeTrialFlag) => void = () => undefined;
    mockEvaluateBowl
      .mockImplementationOnce(() => new Promise((r) => { releaseOld = r; }))
      .mockResolvedValueOnce(null);
    const older = bowlEdit(['rabbit', 'chicken']);
    await expect(bowlEdit(['rabbit'])).resolves.toBe('no_flag');
    releaseOld(contents('chicken', 'Chicken Pâté'));
    await expect(older).resolves.toBe('superseded');
    expect(useMealScreenFlagStore.getState().pending[EVENT]).toBeUndefined();
  });

  it('the card surface: a card that never comes back hands the heads-up to the meal\'s screen', async () => {
    const flag = contents('chicken', 'Chicken Pâté');
    mockEvaluateBowl.mockResolvedValue(flag);
    jest.useFakeTimers();
    try {
      const out = applyBowlEditTrialFlag({
        eventId: EVENT, petId: 'pet-1', foodId: null,
        components: [{ foodId: 'chicken', foodLabel: 'Chicken Pâté' }],
        occurredAt: '2026-10-21T07:30:00.000Z', bowlFoodIds: ['rabbit', 'chicken'],
      });
      await jest.advanceTimersByTimeAsync(5000);
      await expect(out).resolves.toBe('card_gone');
    } finally {
      jest.useRealTimers();
    }
    expect(useMealScreenFlagStore.getState().pending[EVENT]?.flag).toBe(flag);
    expect(await hasFlaggedFoodInTrial(TRIAL, 'chicken')).toBe(false);
  });
});

describe('a plain meal\'s Change hands its heads-up to the meal\'s screen (CUL-2088)', () => {
  it('evaluates the new food for the meal\'s own pet and time, from the record', async () => {
    const flag: LogTimeTrialFlag = {
      kind: 'off_trial_list', trialId: TRIAL, foodId: 'turkey',
      trialStartedAt: '2026-10-01T07:00:00.000Z', trialTargetDurationDays: 42,
    };
    mockEvaluateMeal.mockResolvedValue(flag);
    await expect(applyMealScreenTrialFlag(EVENT, 'turkey')).resolves.toBe('handed');
    expect(mockEvaluateMeal).toHaveBeenCalledWith({ petId: 'pet-1', foodId: 'turkey', occurredAt: '2026-10-21T07:30:00.000Z' });
    expect(useMealScreenFlagStore.getState().pending[EVENT]?.flag).toBe(flag);
    expect(await hasFlaggedFoodInTrial(TRIAL, 'turkey')).toBe(false);
  });

  it('a failed read hands nothing and never throws into the save', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockFirst.mockRejectedValue(new Error('disk'));
    await expect(applyMealScreenTrialFlag(EVENT, 'turkey')).resolves.toBe('no_flag');
    expect(useMealScreenFlagStore.getState().pending[EVENT]).toBeUndefined();
    warn.mockRestore();
  });
});
