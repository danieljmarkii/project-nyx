// The links into History, read by History v2 (CUL-1164 / HV-7, CUL-1168 / HV-11; spec §5.8,
// H-7). Every sender is a row in `lib/historyDoors.ts`, and `guards/historyDoorways.test.ts`
// fails the build on one that is not.
//
// v2 lands every link v1 lands, reading the SAME parameters the SAME way, so no sender had to
// change to reach it. The parameters v1 already sends:
//
//   ?type=<event_type>&window=<preset>  Ask's answer-card provenance (B-378), the Noticed card
//                                       and Patterns (`type=check_in`), a medication's screen
//                                       (`type=medication`): the filter and the window.
//   ?date=today                         Ask's History chip: the Today window.
//   ?day=YYYY-MM-DD                     the Design v2 month's door (CUL-1073): a LOCAL day.
//   ?date=YYYY-MM-DD&src=widget         the widget (frozen, H-7): a LOCAL day.
//   ?date=YYYY-MM-DD                    the flag-off Patterns calendar: a UTC day's key.
//
// A day link LANDS on its day (§5.8): v1 filtered the list down to that one day; v2 keeps the
// list and puts the owner on the day, with the outline, under All types and All time so the
// day is always in the window. A day is read BY SENDER, never by flag (`dayScopeFromParams`,
// CUL-1073): the key it names is the day it lands on, on whichever clock its sender counted.
//
// Precedence is v1's: a type/window link first (no sender sends both shapes), then Today,
// then a day. Anything unrecognised is no request at all, v1's "a bad link shows more, never
// a crash": the scope on screen stays as it was.
//
// ── WHAT HV-11 ADDED (CUL-1168; the registry is `lib/historyDoors.ts`) ─────────────
//
//   ?course=<course key>                a medication course (the vet report's course grain,
//                                       `deriveMedicationCourses`): the medication screen's
//                                       past courses and the rundown's. v1 does not read it,
//                                       so it is sent in BOTH flag states and v1 lands as it
//                                       always did (on Medication, or on the bare route).
//   ?type=symptoms                      All symptoms: the rundown's *None logged in 30 days*,
//                                       sent only under the flag (v1 reads `type`).
//   ?window=14d | trial | visit         Ask's two windows (CUL-498) and the rundown's visit
//                                       window, sent only under the flag (v1 reads `window`).
//
// A course filter keeps the window the link names, All time when it names none: a course
// can end long before any window the owner is likely to have open.

import { dayScopeFromParams } from './historyDateFilter';
import { SYMPTOMS_TYPE_PARAM } from './historyDoors';
import { ALL_TIME, windowFromParam } from './historyWindows';
import {
  ALL_TYPES,
  filterFromTypeParam,
  type HistoryDoorRequest,
  type HistoryFilter,
} from '../store/historyScopeStore';

/** The route params a link into History carries today. */
export interface HistoryDoorParams {
  date?: string;
  day?: string;
  src?: string;
  ts?: string;
  pet?: string;
  type?: string;
  window?: string;
  /** A medication course's key (HV-11). */
  course?: string;
}

/** The filter a type/course link asks for: a course first (it is the narrower ask), then
 *  All symptoms, then v1's type reading. */
function filterOfParams(params: HistoryDoorParams): HistoryFilter {
  if (params.course) return { kind: 'course', courseKey: params.course };
  if (params.type === SYMPTOMS_TYPE_PARAM) return { kind: 'symptoms' };
  return filterFromTypeParam(params.type);
}

/** What a link asks History to show, or null when it asks for nothing (a bare route). */
export function historyDoorRequestOf(params: HistoryDoorParams): HistoryDoorRequest | null {
  if (params.type || params.window || params.course) {
    return { filter: filterOfParams(params), window: windowFromParam(params.window) };
  }
  if (params.date === 'today') return { filter: ALL_TYPES, window: { kind: 'today' } };
  const day = dayScopeFromParams({ date: params.date, day: params.day, src: params.src });
  if (day) return { filter: ALL_TYPES, window: ALL_TIME, landOn: day.key };
  return null;
}

/**
 * One tap's identity: the nonce every in-app sender and the widget mint per tap (`ts`), with
 * the request itself, so the tab (which stays mounted with a link's params in place) applies
 * a tap once and only once. A link without a nonce applies once per distinct request.
 */
export function historyDoorTapKey(params: HistoryDoorParams, request: HistoryDoorRequest): string {
  return JSON.stringify([params.ts ?? null, request.filter ?? null, request.window ?? null, request.landOn ?? null]);
}
