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
jest.mock('./undoLog', () => ({ reverseLoggedEvent: jest.fn(async () => {}) }));
jest.mock('../store/eventStore', () => ({
  useEventStore: { getState: () => ({ removeFromToday: jest.fn() }) },
}));

const mockEvaluateBowl = jest.fn();
jest.mock('./trialContaminant', () => ({
  ...jest.requireActual('./trialContaminant'),
  evaluateBowlLogTimeFlag: (...a: unknown[]) => mockEvaluateBowl(...a),
  evaluateMealLogTimeFlag: jest.fn(async () => null),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMomentStore } from '../store/momentStore';
import { applyBowlEditTrialFlag } from './mealTrialFlag';
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
  if (flag) await noteTrialFlagShown(flag);
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
  await AsyncStorage.clear();
  // The ledger caches in memory; the module's own sign-out wipe is the reset.
  await jest.requireActual('./trialContaminant').clearTrialHeadsUpLedger();
  useMomentStore.setState({ visible: false, payload: null, removed: false });
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
