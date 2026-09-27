import { parseTrialRouteParams, trialScreenHref } from './trialRoute';

// TS-4 (CUL-1300) — the trial screen's route carries its pet (C-9), and a malformed link
// parses to null so the route answers with its small screen rather than a guess.
describe('trialScreenHref / parseTrialRouteParams', () => {
  it('builds /trial/<pet>, encoded', () => {
    expect(trialScreenHref('pet-1')).toBe('/trial/pet-1');
    expect(trialScreenHref('a b/c')).toBe('/trial/a%20b%2Fc');
  });

  it('reads the pet back as given (the router has already decoded it once)', () => {
    expect(parseTrialRouteParams({ pet: 'pet-1' })).toEqual({ petId: 'pet-1' });
    expect(parseTrialRouteParams({ pet: '50%off' })).toEqual({ petId: '50%off' });
    expect(parseTrialRouteParams({ pet: ['pet-1', 'pet-2'] })).toEqual({ petId: 'pet-1' });
  });

  it('is null for a missing or empty pet', () => {
    expect(parseTrialRouteParams({})).toBeNull();
    expect(parseTrialRouteParams({ pet: '' })).toBeNull();
    expect(parseTrialRouteParams({ pet: [] })).toBeNull();
  });
});
