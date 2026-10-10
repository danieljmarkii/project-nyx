// The log-time double-dose check reports SETTLED on every exit with an answer (CUL-1691 §2.3): a
// given dose's gold waits on this read, so an exit that returned silently would leave
// the halo waiting on nothing. Driven through the real `applyLogTimeDoubleDoseCheck`;
// the store and the local read are stubbed, since what is under test is the exits.
//
// jest hoists jest.mock() above the imports, so any variable a factory closes over must be
// `mock`-prefixed.

const mockGetDoubleDoseFlag = jest.fn();
jest.mock('./db', () => ({
  getDb: jest.fn(),
  getDoubleDoseFlag: (...a: unknown[]) => mockGetDoubleDoseFlag(...a),
  updateDoseAdherence: jest.fn(),
  updateDoseHowGiven: jest.fn(),
}));
jest.mock('./sync', () => ({
  syncPendingEvents: jest.fn().mockResolvedValue(undefined),
  syncPendingMedicationAdministrations: jest.fn().mockResolvedValue(undefined),
}));

const mockOrder: string[] = [];
const mockPatchDoubleDose = jest.fn(() => { mockOrder.push('patch'); return true; });
const mockMarkSettled = jest.fn(() => { mockOrder.push('settle'); });
const mockWhenVisible = jest.fn();
jest.mock('../store/momentStore', () => ({
  useMomentStore: { getState: () => ({ patchDoubleDose: mockPatchDoubleDose, markDoubleDoseSettled: mockMarkSettled }) },
  whenMedicationCardVisible: (...a: unknown[]) => mockWhenVisible(...a),
}));

import { applyLogTimeDoubleDoseCheck } from './medicationDose';

const PARAMS = {
  eventId: 'dose-1', petId: 'pet-1', medicationItemId: 'med-1',
  occurredAt: '2026-10-10T12:00:00.000Z', adherence: 'given' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockOrder.length = 0;
  mockWhenVisible.mockResolvedValue(true);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('applyLogTimeDoubleDoseCheck settles on every answered exit (CUL-1691 §2.3)', () => {
  it('a conflict: the patch lands, then the settle, keyed to this dose', async () => {
    mockGetDoubleDoseFlag.mockResolvedValue({ conflict: true, otherEventId: 'x', gapMinutes: 20 });
    await applyLogTimeDoubleDoseCheck(PARAMS);
    expect(mockPatchDoubleDose).toHaveBeenCalledWith('dose-1', expect.objectContaining({ conflict: true }), 'given');
    expect(mockOrder).toEqual(['patch', 'settle']);
    expect(mockMarkSettled).toHaveBeenCalledWith('dose-1');
  });

  it('no conflict: no patch, still settled after the card is up', async () => {
    mockGetDoubleDoseFlag.mockResolvedValue({ conflict: false, otherEventId: null, gapMinutes: null });
    await applyLogTimeDoubleDoseCheck(PARAMS);
    expect(mockPatchDoubleDose).not.toHaveBeenCalled();
    expect(mockWhenVisible).toHaveBeenCalledWith('dose-1');
    expect(mockMarkSettled).toHaveBeenCalledWith('dose-1');
  });

  it('a failed read: never settled, never patched (an unknown is not a clear check)', async () => {
    mockGetDoubleDoseFlag.mockRejectedValue(new Error('sqlite'));
    await applyLogTimeDoubleDoseCheck(PARAMS);
    expect(mockPatchDoubleDose).not.toHaveBeenCalled();
    expect(mockMarkSettled).not.toHaveBeenCalled();
  });

  it('a patch the store refuses (the owner changed the answer) still settles', async () => {
    mockGetDoubleDoseFlag.mockResolvedValue({ conflict: true, otherEventId: 'x', gapMinutes: 20 });
    mockPatchDoubleDose.mockReturnValueOnce(false);
    await applyLogTimeDoubleDoseCheck(PARAMS);
    expect(mockMarkSettled).toHaveBeenCalledWith('dose-1');
  });

  it('superseded (the card never came up for this dose): nothing is written', async () => {
    mockWhenVisible.mockResolvedValue(false);
    mockGetDoubleDoseFlag.mockResolvedValue({ conflict: false, otherEventId: null, gapMinutes: null });
    await applyLogTimeDoubleDoseCheck(PARAMS);
    mockGetDoubleDoseFlag.mockRejectedValue(new Error('sqlite'));
    await applyLogTimeDoubleDoseCheck(PARAMS);
    expect(mockPatchDoubleDose).not.toHaveBeenCalled();
    expect(mockMarkSettled).not.toHaveBeenCalled();
  });
});
