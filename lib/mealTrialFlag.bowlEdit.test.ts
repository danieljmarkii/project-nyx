// CUL-2086 — a bowl edit on a showing card, against the REAL card store and the REAL
// one-per-food ledger (AsyncStorage's jest mock). Only the evaluator is stubbed: it is the
// read, and the rule under test is what the card and the ledger do with its answer.
//
// The two cases the row 4 adversarial pass broke (items 3 and 4):
//   1. the flagged food leaves the bowl → the card drops (or replaces) its line, and that
//      food's warning comes back, so its real feeding later still gets one;
//   2. a weaker line shows and the edit adds a stronger food → the stronger line replaces
//      it at once, and the weaker food's warning comes back.
// And the rule row 4 set, which must survive: the shown food still in the bowl and nothing
// louder arriving keeps the line and its budget spent.

jest.mock('./haptics', () => ({
  commitRoutine: jest.fn(),
  commitSymptom: jest.fn(),
  selectChip: jest.fn(),
  destructiveConfirm: jest.fn(),
}));
// Undo's write takes a beat, as a real SQLite write does: R5 lands an edit inside it.
jest.mock('./undoLog', () => ({
  reverseLoggedEvent: jest.fn(() => new Promise((r) => setTimeout(r, 30))),
}));
jest.mock('../store/eventStore', () => ({
  useEventStore: { getState: () => ({ removeFromToday: jest.fn() }) },
}));

const mockEvaluateBowl = jest.fn();
const mockEvaluateMeal = jest.fn();
jest.mock('./trialContaminant', () => ({
  ...jest.requireActual('./trialContaminant'),
  evaluateBowlLogTimeFlag: (...a: unknown[]) => mockEvaluateBowl(...a),
  evaluateMealLogTimeFlag: (...a: unknown[]) => mockEvaluateMeal(...a),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMomentStore } from '../store/momentStore';
import { applyBowlEditTrialFlag, applyMealTrialFlag } from './mealTrialFlag';
import {
  hasFlaggedFoodInTrial,
  noteTrialFlagShown,
  type LogTimeTrialFlag,
} from './trialContaminant';

const TRIAL = 'trial-1';
const EVENT = 'ev-1';

function membership(foodId: string, label: string): LogTimeTrialFlag {
  return {
    kind: 'off_trial_list',
    trialId: TRIAL,
    foodId,
    trialStartedAt: '2026-10-01T07:00:00.000Z',
    trialTargetDurationDays: 42,
    bowl: { foodLabel: label, pastTarget: false },
  };
}

function contents(foodId: string, label: string): LogTimeTrialFlag {
  return {
    kind: 'off_diet_protein',
    trialId: TRIAL,
    foodId,
    proteins: ['chicken'],
    trialProteins: ['rabbit'],
    bowl: { foodLabel: label, pastTarget: false },
  } as LogTimeTrialFlag;
}

/** A showing card for EVENT whose heads-up names `flag`'s food, with that food's budget
 *  spent: exactly the state the log path leaves behind. */
async function cardShowing(flag: LogTimeTrialFlag | null): Promise<void> {
  useMomentStore.getState().showMeal({
    eventId: EVENT,
    petId: 'pet-1',
    occurredAt: '2026-10-21T07:30:00.000Z',
    foodType: 'meal',
    intakeRating: null,
    trialFlag: flag,
  });
  if (flag) await noteTrialFlagShown(flag, EVENT);
}

function edit(bowlFoodIds: string[]) {
  return applyBowlEditTrialFlag({
    eventId: EVENT,
    petId: 'pet-1',
    foodId: null,
    occurredAt: '2026-10-21T07:30:00.000Z',
    components: bowlFoodIds.map((id) => ({ foodId: id, foodLabel: id })),
    bowlFoodIds,
  });
}

const shownFlag = () => {
  const p = useMomentStore.getState().payload;
  return p?.kind === 'meal' ? p.trialFlag ?? null : 'not a meal card';
};

beforeEach(async () => {
  jest.useFakeTimers();
  mockEvaluateBowl.mockReset();
  mockEvaluateMeal.mockReset().mockResolvedValue(null);
  await AsyncStorage.clear();
  // The ledger caches in memory; the module's own sign-out wipe is the reset.
  await jest.requireActual('./trialContaminant').clearTrialHeadsUpLedger();
  useMomentStore.setState({ visible: false, payload: null, removed: false, undoing: null });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('CUL-2086 — the flagged food leaves the bowl', () => {
  it('swaps in the new food’s heads-up and gives the removed food its warning back', async () => {
    const chicken = membership('chicken-pate', 'Chicken Pâté');
    await cardShowing(chicken);
    expect(await hasFlaggedFoodInTrial(TRIAL, 'chicken-pate')).toBe(true);
    const duck = membership('duck', 'Duck Stew');
    mockEvaluateBowl.mockResolvedValue(duck);

    await expect(edit(['rabbit', 'duck'])).resolves.toBe('replaced');

    expect(shownFlag()).toEqual(duck);
    expect(await hasFlaggedFoodInTrial(TRIAL, 'chicken-pate')).toBe(false);
    expect(await hasFlaggedFoodInTrial(TRIAL, 'duck')).toBe(true);
  });

  it('clears a stale line when the new bowl earns none, and returns the warning', async () => {
    await cardShowing(contents('chicken-pate', 'Chicken Pâté'));
    mockEvaluateBowl.mockResolvedValue(null);

    await expect(edit(['rabbit'])).resolves.toBe('cleared');

    expect(shownFlag()).toBeNull();
    expect(await hasFlaggedFoodInTrial(TRIAL, 'chicken-pate')).toBe(false);
  });
});

describe('CUL-2086 — a stronger flag arrives behind a weaker one', () => {
  it('contents replaces membership at once, and the membership food speaks again later', async () => {
    const offList = membership('lamb', 'Lamb Pâté');
    await cardShowing(offList);
    const chicken = contents('chicken-pate', 'Chicken Pâté');
    mockEvaluateBowl.mockResolvedValue(chicken);

    await expect(edit(['lamb', 'chicken-pate'])).resolves.toBe('replaced');

    expect(shownFlag()).toEqual(chicken);
    expect(await hasFlaggedFoodInTrial(TRIAL, 'lamb')).toBe(false);
    expect(await hasFlaggedFoodInTrial(TRIAL, 'chicken-pate')).toBe(true);
  });
});

describe('the row 4 rule holds where neither case applies', () => {
  it('equal strength with the shown food still in the bowl keeps the line and its budget', async () => {
    const lamb = membership('lamb', 'Lamb Pâté');
    await cardShowing(lamb);
    mockEvaluateBowl.mockResolvedValue(membership('duck', 'Duck Stew'));

    await expect(edit(['lamb', 'duck'])).resolves.toBe('patch_refused');

    expect(shownFlag()).toEqual(lamb);
    expect(await hasFlaggedFoodInTrial(TRIAL, 'lamb')).toBe(true);
    // The refused food stays unspent, so it speaks the next time it is fed.
    expect(await hasFlaggedFoodInTrial(TRIAL, 'duck')).toBe(false);
  });

  it('a weaker flag never replaces a stronger one', async () => {
    const chicken = contents('chicken-pate', 'Chicken Pâté');
    await cardShowing(chicken);
    mockEvaluateBowl.mockResolvedValue(membership('duck', 'Duck Stew'));

    await expect(edit(['chicken-pate', 'duck'])).resolves.toBe('patch_refused');

    expect(shownFlag()).toEqual(chicken);
    expect(await hasFlaggedFoodInTrial(TRIAL, 'duck')).toBe(false);
  });

  it('a card with no heads-up takes the new one, as on a fresh log', async () => {
    await cardShowing(null);
    const duck = membership('duck', 'Duck Stew');
    mockEvaluateBowl.mockResolvedValue(duck);

    await expect(edit(['rabbit', 'duck'])).resolves.toBe('shown');

    expect(shownFlag()).toEqual(duck);
    expect(await hasFlaggedFoodInTrial(TRIAL, 'duck')).toBe(true);
  });
});

describe('never on a card nobody can act on', () => {
  it('an undone card keeps its state and spends nothing', async () => {
    await cardShowing(membership('lamb', 'Lamb Pâté'));
    useMomentStore.setState({ removed: true });
    mockEvaluateBowl.mockResolvedValue(contents('chicken-pate', 'Chicken Pâté'));

    await expect(edit(['chicken-pate'])).resolves.toBe('patch_refused');
    expect(await hasFlaggedFoodInTrial(TRIAL, 'chicken-pate')).toBe(false);
  });

  it('an edit made off the card (no card up) lands nothing and spends nothing', async () => {
    mockEvaluateBowl.mockResolvedValue(contents('chicken-pate', 'Chicken Pâté'));
    const pending = edit(['chicken-pate']);
    await jest.advanceTimersByTimeAsync(3500);
    await expect(pending).resolves.toBe('card_gone');
    expect(await hasFlaggedFoodInTrial(TRIAL, 'chicken-pate')).toBe(false);
  });
});

// Adversarial pass 1 on this fix (R1–R6): each was a sequence that left a food spent with
// nothing ever shown for it. Real timers where the race is between awaits.
describe('CUL-2086 pass 1 — the races', () => {
  const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
  beforeEach(() => jest.useRealTimers());

  it('R1: a second quick edit that removes the first edit’s food never leaves it spent', async () => {
    await cardShowing(membership('A', 'A'));
    mockEvaluateBowl.mockResolvedValueOnce(membership('D', 'D')).mockResolvedValueOnce(null);
    await Promise.all([edit(['B', 'D']), edit(['B'])]);
    expect(shownFlag()).toBeNull();
    expect(await hasFlaggedFoodInTrial(TRIAL, 'D')).toBe(false);
    expect(await hasFlaggedFoodInTrial(TRIAL, 'A')).toBe(false);
  });

  it('R2: an older edit finishing last never patches against a bowl that is gone', async () => {
    await cardShowing(membership('A', 'A'));
    let release: (v: unknown) => void = () => undefined;
    mockEvaluateBowl
      .mockImplementationOnce(() => new Promise((r) => { release = r; }))
      .mockResolvedValueOnce(null);
    const older = edit(['B']);
    const newer = await edit(['A', 'B']);
    release(null);
    expect(await older).toBe('superseded');
    expect(newer).toBe('no_flag');
    expect(shownFlag()).toEqual(membership('A', 'A'));
    expect(await hasFlaggedFoodInTrial(TRIAL, 'A')).toBe(true);
  });

  it('R3: the log path and a bowl edit landing on one reveal spend only what shows', async () => {
    mockEvaluateMeal.mockResolvedValueOnce(membership('A', 'A'));
    mockEvaluateBowl.mockResolvedValueOnce(contents('B', 'B'));
    const log = applyMealTrialFlag({ eventId: EVENT, petId: 'pet-1', foodId: 'A', occurredAt: 'x' });
    const ed = edit(['A', 'B']);
    await tick(20);
    useMomentStore.getState().showMeal({
      eventId: EVENT, petId: 'pet-1', occurredAt: '2026-10-21T07:30:00.000Z',
      foodType: 'meal', intakeRating: null, trialFlag: null,
    });
    await Promise.all([log, ed]);
    expect(shownFlag()).toEqual(contents('B', 'B'));
    expect(await hasFlaggedFoodInTrial(TRIAL, 'B')).toBe(true);
    expect(await hasFlaggedFoodInTrial(TRIAL, 'A')).toBe(false);
  });

  it('R4: an edit then Undo gives every food back', async () => {
    await cardShowing(membership('A', 'A'));
    mockEvaluateBowl.mockResolvedValueOnce(membership('D', 'D'));
    const p = edit(['D']);
    await tick();
    await Promise.all([p, useMomentStore.getState().undo(EVENT)]);
    await tick(40);
    expect(await hasFlaggedFoodInTrial(TRIAL, 'A')).toBe(false);
    expect(await hasFlaggedFoodInTrial(TRIAL, 'D')).toBe(false);
  });

  it('R5: an edit landing while Undo writes never spends a food on the undone meal', async () => {
    await cardShowing(membership('A', 'A'));
    mockEvaluateBowl.mockResolvedValueOnce(membership('D', 'D'));
    const u = useMomentStore.getState().undo(EVENT);
    await Promise.all([edit(['D']), u]);
    await tick(40);
    expect(await hasFlaggedFoodInTrial(TRIAL, 'A')).toBe(false);
    expect(await hasFlaggedFoodInTrial(TRIAL, 'D')).toBe(false);
  });

  it('R6: a food taken out away from the card gets its warning back', async () => {
    jest.useFakeTimers();
    await cardShowing(membership('A', 'A'));
    useMomentStore.setState({ visible: false });
    mockEvaluateBowl.mockResolvedValueOnce(null);
    const p = edit(['B']);
    await jest.advanceTimersByTimeAsync(3100);
    await p;
    expect(await hasFlaggedFoodInTrial(TRIAL, 'A')).toBe(false);
  });

  it('R6 control: an edit that keeps the food leaves it spent', async () => {
    jest.useFakeTimers();
    await cardShowing(membership('A', 'A'));
    useMomentStore.setState({ visible: false });
    mockEvaluateBowl.mockResolvedValueOnce(null);
    const p = edit(['A', 'B']);
    await jest.advanceTimersByTimeAsync(3100);
    await p;
    expect(await hasFlaggedFoodInTrial(TRIAL, 'A')).toBe(true);
  });
});
