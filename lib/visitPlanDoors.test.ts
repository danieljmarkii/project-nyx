import { visitCourseHref, visitTrialHref } from './visitPlanDoors';
import { profileFocusFromParams, resolveMedAnchorRegimenId, type ProfileFocusHref } from './profileFocus';
import { parseTrialRouteParams } from './trialRoute';

const NOW = 1_763_000_000_000;

describe('visitCourseHref (CUL-2759)', () => {
  it('opens the Pet tab on an active course, keyed so the tab lands on that row', () => {
    const href = visitCourseHref({
      course: { id: 'reg-1', status: 'active', medicationItemId: 'item-motozol' },
      visitPetId: 'pet-a',
      activePetId: 'pet-a',
      nowMs: NOW,
    }) as ProfileFocusHref;
    expect(href.pathname).toBe('/(tabs)/profile');
    expect(profileFocusFromParams(href.params)).toEqual({ focus: 'medications', petId: null });
    // Driven through the screen's own resolver: the key names this regimen, not a neighbour.
    const regimens = [
      { id: 'reg-0', medication_item_id: 'item-other', started_at: '2026-10-01T00:00:00.000Z' },
      { id: 'reg-1', medication_item_id: 'item-motozol', started_at: '2026-11-01T00:00:00.000Z' },
    ];
    expect(resolveMedAnchorRegimenId(regimens, href.params.med)).toBe('reg-1');
    expect(href.params.ts).toBe(String(NOW));
  });

  it('keys a course with no library item by its regimen', () => {
    const href = visitCourseHref({
      course: { id: 'reg-9', status: 'active', medicationItemId: null },
      visitPetId: 'pet-a',
      activePetId: 'pet-a',
      nowMs: NOW,
    }) as ProfileFocusHref;
    expect(resolveMedAnchorRegimenId(
      [{ id: 'reg-9', medication_item_id: null, started_at: '2026-11-01T00:00:00.000Z' }],
      href.params.med,
    )).toBe('reg-9');
  });

  it('never opens the Pet tab for a visit whose pet is not on screen (C-9)', () => {
    expect(visitCourseHref({
      course: { id: 'reg-1', status: 'active', medicationItemId: 'item-motozol' },
      visitPetId: 'pet-a',
      activePetId: 'pet-b',
      nowMs: NOW,
    })).toEqual({ pathname: '/medication/[id]', params: { id: 'item-motozol' } });
    expect(visitCourseHref({
      course: { id: 'reg-1', status: 'active', medicationItemId: null },
      visitPetId: 'pet-a',
      activePetId: null,
      nowMs: NOW,
    })).toBeNull();
  });

  it('opens an ended course on its medication, the Past medications door', () => {
    expect(visitCourseHref({
      course: { id: 'reg-1', status: 'completed', medicationItemId: 'item-motozol' },
      visitPetId: 'pet-a',
      activePetId: 'pet-a',
      nowMs: NOW,
    })).toEqual({ pathname: '/medication/[id]', params: { id: 'item-motozol' } });
  });

  it('leaves an ended course with no library item as text', () => {
    expect(visitCourseHref({
      course: { id: 'reg-1', status: 'stopped', medicationItemId: null },
      visitPetId: 'pet-a',
      activePetId: 'pet-a',
      nowMs: NOW,
    })).toBeNull();
  });
});

describe('visitTrialHref (CUL-2759)', () => {
  it('opens a running trial on the screen of the VISIT’s pet', () => {
    const href = visitTrialHref({ trial: { status: 'active' }, visitPetId: 'pet-a' });
    expect(href).not.toBeNull();
    const pet = href!.slice('/trial/'.length);
    expect(parseTrialRouteParams({ pet: decodeURIComponent(pet) })).toEqual({ petId: 'pet-a' });
  });

  it('leaves an ended trial as text: the screen shows the current trial, never one by id', () => {
    expect(visitTrialHref({ trial: { status: 'completed' }, visitPetId: 'pet-a' })).toBeNull();
    expect(visitTrialHref({ trial: { status: 'abandoned' }, visitPetId: 'pet-a' })).toBeNull();
  });
});
