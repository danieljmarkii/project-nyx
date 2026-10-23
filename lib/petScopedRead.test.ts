import { settlePetRead, updatePetRows, viewForPet, type PetScopedRead } from './petScopedRead';

const BISCUIT: PetScopedRead<string> = { petId: 'p1', status: 'loaded', rows: ['Prednisolone'] };

describe('viewForPet (CUL-2174)', () => {
  it('never hands back another pet\'s rows, loaded or not', () => {
    expect(viewForPet(BISCUIT, 'p2', false)).toEqual({ kind: 'loading' });
    expect(viewForPet(BISCUIT, null, false)).toEqual({ kind: 'loading' });
  });

  it('is a wait before any read, and while one is in flight', () => {
    expect(viewForPet(null, 'p1', false)).toEqual({ kind: 'loading' });
    expect(viewForPet(BISCUIT, 'p1', true)).toEqual({ kind: 'loading' });
  });

  it('a failed read for this pet is failed, never an empty list (C-12)', () => {
    expect(viewForPet({ petId: 'p2', status: 'failed' }, 'p2', false)).toEqual({ kind: 'failed' });
  });

  it('draws this pet\'s rows', () => {
    expect(viewForPet(BISCUIT, 'p1', false)).toEqual({ kind: 'loaded', rows: ['Prednisolone'] });
  });
});

describe('settlePetRead', () => {
  it('a failure after a pet switch is the failed state, not the previous pet\'s rows', () => {
    expect(settlePetRead(BISCUIT, 'p2', { ok: false })).toEqual({ petId: 'p2', status: 'failed' });
  });

  it('a first failure is the failed state', () => {
    expect(settlePetRead<string>(null, 'p1', { ok: false })).toEqual({ petId: 'p1', status: 'failed' });
  });

  it('a same-pet refetch that fails keeps that pet\'s rows, so a history is never blanked', () => {
    expect(settlePetRead(BISCUIT, 'p1', { ok: false })).toBe(BISCUIT);
  });

  it('a success is held for the pet it was read for', () => {
    expect(settlePetRead(BISCUIT, 'p2', { ok: true, rows: ['Gabapentin'] }))
      .toEqual({ petId: 'p2', status: 'loaded', rows: ['Gabapentin'] });
  });
});

describe('updatePetRows', () => {
  it('edits only the named pet\'s loaded rows', () => {
    expect(updatePetRows<string>({ petId: 'p1', status: 'failed' }, 'p1', (r) => [...r, 'x'])).toEqual({ petId: 'p1', status: 'failed' });
    expect(updatePetRows(BISCUIT, 'p2', (r) => [...r, 'x'])).toBe(BISCUIT);
    expect(updatePetRows(BISCUIT, 'p1', (r) => [...r, 'x'])).toEqual({
      petId: 'p1', status: 'loaded', rows: ['Prednisolone', 'x'],
    });
  });
});
