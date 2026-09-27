// CUL-1334 — whose report `/report` builds. The fallback to the active pet is for an
// ABSENT param only; a named pet the account does not hold never falls back (C-9).
jest.mock('./supabase', () => ({ supabase: {} }));

import { REPORT_PET_GONE, reportHref, resolveReportSubject } from './reportRoute';
import { TRIAL_ROUTE_PET_GONE } from './trialFoodsScreen';

const MOCHI = { id: 'p1', name: 'Mochi' };
const BISCUIT = { id: 'p2', name: 'Biscuit' };
const PETS = [MOCHI, BISCUIT];

describe('reportHref', () => {
  it('names the pet in the route’s ?pet= param', () => {
    expect(reportHref('p2')).toEqual({ pathname: '/report', params: { pet: 'p2' } });
  });
});

describe('resolveReportSubject', () => {
  it('no param: the active pet, as every door that predates the param expects', () => {
    expect(resolveReportSubject(undefined, MOCHI, PETS)).toEqual({ kind: 'pet', petId: 'p1', petName: 'Mochi' });
    // A blank param is no param (the trial list screens' rule).
    expect(resolveReportSubject('  ', MOCHI, PETS)).toEqual({ kind: 'pet', petId: 'p1', petName: 'Mochi' });
    expect(resolveReportSubject([], MOCHI, PETS)).toEqual({ kind: 'pet', petId: 'p1', petName: 'Mochi' });
  });

  it('no param and no active pet: no pet, not an unknown one', () => {
    expect(resolveReportSubject(undefined, null, [])).toEqual({ kind: 'no_pet' });
  });

  it('a named pet that is not the active one: THAT pet, with its own name', () => {
    expect(resolveReportSubject('p2', MOCHI, PETS)).toEqual({ kind: 'pet', petId: 'p2', petName: 'Biscuit' });
    // A repeated param takes the first, as expo-router's string params read.
    expect(resolveReportSubject(['p2', 'p1'], MOCHI, PETS)).toEqual({ kind: 'pet', petId: 'p2', petName: 'Biscuit' });
  });

  it('a named pet the account does not hold never falls back to the active pet', () => {
    expect(resolveReportSubject('p-archived', MOCHI, PETS)).toEqual({ kind: 'unknown_pet' });
    expect(resolveReportSubject('p-archived', null, [])).toEqual({ kind: 'unknown_pet' });
  });

  it('a blank name is no name (correct-but-anonymous), never another pet’s', () => {
    const unnamed = { id: 'p3', name: '  ' };
    expect(resolveReportSubject('p3', MOCHI, [...PETS, unnamed])).toEqual({ kind: 'pet', petId: 'p3', petName: null });
  });
});

describe('the pet-gone line', () => {
  it('is the trial list screens’ own words, for the same fact', () => {
    expect(REPORT_PET_GONE).toBe(TRIAL_ROUTE_PET_GONE);
  });
});
