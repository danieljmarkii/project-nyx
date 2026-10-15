// The one composition both emergency doors read (CUL-1838), and the Signal door's words.
// Real functions throughout (C-34): only the record's own reads are stubbed.

jest.mock('./lookEmergencyFacts', () => ({
  ...jest.requireActual('./lookEmergencyFacts'),
  loadEmergencyFacts: jest.fn(),
}));
jest.mock('./lookWithheld', () => ({
  ...jest.requireActual('./lookWithheld'),
  loadLookWithheldFacts: jest.fn(),
}));

import { composeEmergencyRead, loadEmergencyRead } from './emergencyDoorRead';
import { loadEmergencyFacts } from './lookEmergencyFacts';
import { loadLookWithheldFacts, type LookWithheldFacts } from './lookWithheld';
import { SIGNAL_DOOR_CALL_NOW, SIGNAL_DOOR_CALL_TODAY, SIGNAL_DOOR_LABEL, signalDoorLabel } from './lookEmergency';

const QUIET = { refusedRecently: false, vomitCount24h: 0, lethargyRecently: false };
const declining: LookWithheldFacts = {
  petId: 'pet-1',
  serverIntakeDecline: true,
  trialNotEating: null,
  recentQualifyingMeals: [],
};

describe('composeEmergencyRead', () => {
  it('unloaded facts are a FAILED read (the sheet fails closed on it)', () => {
    expect(composeEmergencyRead({ id: 'pet-1' }, null, true, null)).toEqual({ status: 'failed' });
  });
  it('the trial register counts only as a positive fact (T-20)', () => {
    expect(composeEmergencyRead({ id: 'pet-1' }, QUIET, null, null)).toEqual({ status: 'ready', facts: QUIET });
    expect(composeEmergencyRead({ id: 'pet-1' }, QUIET, true, null)).toEqual({
      status: 'ready',
      facts: { ...QUIET, refusedRecently: true },
    });
  });
  it('the record-local arm reaches the door, for this pet only (C-9)', () => {
    const own = composeEmergencyRead({ id: 'pet-1' }, QUIET, null, declining);
    expect(own.status === 'ready' && own.facts.refusedRecently).toBe(true);
    const other = composeEmergencyRead({ id: 'pet-2' }, QUIET, null, declining);
    expect(other.status === 'ready' && other.facts.refusedRecently).toBe(false);
  });
});

describe('loadEmergencyRead', () => {
  it('folds the withheld facts in, and an unanswered withheld read is no evidence', async () => {
    (loadEmergencyFacts as jest.Mock).mockResolvedValue(QUIET);
    (loadLookWithheldFacts as jest.Mock).mockResolvedValue(declining);
    const read = await loadEmergencyRead({ id: 'pet-1', species: 'cat' }, null);
    expect(read.status === 'ready' && read.facts.refusedRecently).toBe(true);

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (loadLookWithheldFacts as jest.Mock).mockRejectedValue(new Error('offline'));
    const quiet = await loadEmergencyRead({ id: 'pet-1', species: 'cat' }, null);
    expect(quiet).toEqual({ status: 'ready', facts: QUIET });
    warn.mockRestore();
  });
});

describe('signalDoorLabel — the Signal door says what the sheet would collapse to', () => {
  it('rests while the read is loading or failed (a door never shouts on unknown facts)', () => {
    expect(signalDoorLabel('cat', { status: 'loading' })).toBe(SIGNAL_DOOR_LABEL);
    expect(signalDoorLabel('cat', { status: 'failed' })).toBe(SIGNAL_DOOR_LABEL);
  });
  it('rests on a quiet record', () => {
    expect(signalDoorLabel('cat', { status: 'ready', facts: QUIET })).toBe(SIGNAL_DOOR_LABEL);
  });
  it('a met call-today sign: "Call your vet today ›"', () => {
    expect(signalDoorLabel('cat', { status: 'ready', facts: { ...QUIET, refusedRecently: true } })).toBe(SIGNAL_DOOR_CALL_TODAY);
    expect(signalDoorLabel('dog', { status: 'ready', facts: { ...QUIET, vomitCount24h: 2 } })).toBe(SIGNAL_DOOR_CALL_TODAY);
  });
  it('a met call-now sign under the floor: "Call your vet now ›"', () => {
    const facts = { ...QUIET, lethargyRecently: true, vomitCount24h: 1 };
    expect(signalDoorLabel('cat', { status: 'ready', facts }, true)).toBe(SIGNAL_DOOR_CALL_NOW);
  });
});
