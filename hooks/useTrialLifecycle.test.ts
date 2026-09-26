// `useTrialLifecycle` names the pet it was GIVEN, never the active one — CUL-1299 (TS-3).
//
// On the Pet tab the two are the same pet, which is why
// `app/(tabs)/profile.trialLifecycle.test.tsx` cannot see this. The trial screen
// (TS-4) mounts the host for the ROUTE's pet while another pet may be selected (spec
// §2 S1), so the sheets and the refusal sentence have to resolve from `petId` (C-9).
// The fixture is the case that tells the two apart: Luna is active, the host is
// handed Mochi's trial.

// `lib/analytics` (the day math) reaches the Supabase client through the sync fabric.
jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('../lib/dietTrialSetup', () => {
  class TrialWindowRefused extends Error {
    reason: string;
    requestedDays: number;
    floorDays: number | null;
    currentTargetDays: number | null;
    dayCounter: number | null;
    constructor(args: { reason: string; requestedDays: number }) {
      super(`refused: ${args.reason}`);
      this.reason = args.reason;
      this.requestedDays = args.requestedDays;
      this.floorDays = null;
      this.currentTargetDays = null;
      this.dayCounter = null;
    }
  }
  return {
    TrialWindowRefused,
    extendTrial: jest.fn(() => Promise.resolve()),
    changeTrialWindow: jest.fn(() => Promise.resolve()),
  };
});

const MOCHI = { id: 'p1', name: 'Mochi', species: 'cat', sex: 'female' };
const LUNA = { id: 'p2', name: 'Luna', species: 'dog', sex: 'male' };
const mockPetState = { activePet: LUNA, pets: [MOCHI, LUNA] };
jest.mock('../store/petStore', () => ({
  usePetStore: Object.assign(
    (selector?: (s: unknown) => unknown) => (selector ? selector(mockPetState) : mockPetState),
    { getState: () => mockPetState },
  ),
}));

import { act, renderHook } from '@testing-library/react-native';
import { changeTrialWindow, TrialWindowRefused } from '../lib/dietTrialSetup';
import type { TrialCardInput } from '../lib/dietTrialCard';
import { useTrialLifecycle } from './useTrialLifecycle';

const INPUT = {
  trial: {
    id: 'mochi-trial',
    status: 'active',
    startedAt: '2026-08-01',
    targetDurationDays: 56,
    indication: 'skin',
  },
  nowMs: new Date(2026, 7, 10, 12).getTime(),
  intakeDeclineHeadline: null,
} as unknown as TrialCardInput;

describe('useTrialLifecycle — the record’s pet, with another pet active (C-9)', () => {
  it('resolves the pet it was handed, and writes against that pet’s trial', () => {
    const { result } = renderHook(() =>
      useTrialLifecycle({ petId: 'p1', input: INPUT, reload: jest.fn() }));
    expect(result.current.pet?.name).toBe('Mochi');
    expect(result.current.sheetTrial?.petId).toBe('p1');
    expect(result.current.sheetTrial?.id).toBe('mochi-trial');
  });

  it('phrases a refusal with the handed pet’s name, never the active pet’s', async () => {
    (changeTrialWindow as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new TrialWindowRefused({ reason: 'not_running', requestedDays: 70 } as never)));
    const reload = jest.fn();
    const { result } = renderHook(() =>
      useTrialLifecycle({ petId: 'p1', input: INPUT, reload }));
    await act(async () => {
      await result.current.changeWindow({ targetDurationDays: 70, vetDirected: false });
    });
    expect(result.current.windowError).toBe('Mochi’s trial has ended, so its window cannot change.');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('draws nothing for a pet the account does not hold (a stale link)', () => {
    const { result } = renderHook(() =>
      useTrialLifecycle({ petId: 'gone', input: INPUT, reload: jest.fn() }));
    expect(result.current.pet).toBeNull();
  });
});
