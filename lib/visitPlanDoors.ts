// Where a saved visit's plan rows lead (CUL-2759, After the visit PR-05).
//
// A plan row on the visit page names a record: a course the vet started, a trial they set.
// Until now those rows were text, because there was no per-course or per-trial route
// (`VisitDetailBody`'s old header). There are doors now, and this module picks one per row
// so the screen only pushes it. Pure, so every branch is tested here.
//
// THE COURSE. An active course opens the Pet tab on that course's row, through the CUL-170
// vocabulary (`profileFocusHref` with the course's med key), exactly as the rundown's meds
// tile does. The Pet tab draws the ACTIVE pet, so this door is offered only when the visit's
// pet is the one on screen: anything else would land on another animal's medications
// (C-9). An ended course, or one whose pet is not on screen, opens its medication's own
// screen (`/medication/<item id>`), the door the Pet tab's Past medications row uses for an
// ended course. A course with no library item has neither, and its row stays text: a row
// that cannot open does not pretend it can.
//
// THE TRIAL. The trial's own screen takes its pet from the route (`trialScreenHref`), so a
// running trial's door needs no pet check. The screen shows the pet's CURRENT trial (the
// running one, else one ended in the last 30 days), never a trial by id, so an ENDED trial's
// row could open a different trial or none. An ended trial's row therefore stays text until
// the screen can show a past trial by id.
import { medStripKeyForRegimen } from './medStrip';
import { profileFocusHref, type ProfileFocusHref } from './profileFocus';
import { trialScreenHref } from './trialRoute';

export type VisitPlanHref =
  | ProfileFocusHref
  | string
  | { pathname: '/medication/[id]'; params: { id: string } };

export interface VisitCourse {
  id: string;
  status: string;
  medicationItemId?: string | null;
}

export function visitCourseHref(input: {
  course: VisitCourse;
  visitPetId: string;
  activePetId: string | null;
  nowMs: number;
}): VisitPlanHref | null {
  const { course } = input;
  const itemId = course.medicationItemId ?? null;
  if (course.status === 'active' && input.activePetId !== null && input.activePetId === input.visitPetId) {
    return profileFocusHref({
      focus: 'medications',
      medKey: medStripKeyForRegimen({ id: course.id, medication_item_id: itemId }),
      nowMs: input.nowMs,
    });
  }
  return itemId ? { pathname: '/medication/[id]', params: { id: itemId } } : null;
}

export function visitTrialHref(input: { trial: { status: string }; visitPetId: string }): string | null {
  return input.trial.status === 'active' ? trialScreenHref(input.visitPetId) : null;
}
