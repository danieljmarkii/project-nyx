// The week strip — a placeholder slot (History v2, HV-1 / CUL-1158). HV-8 (CUL-1165)
// replaces this file: seven day cells paged by the week, each mark and its spoken label
// from `stripMarkOf` (spec §3.4, §5.7). HV-7 mounts it in the list's header.
//
// Its props are typed now so the mount (HV-7) and the strip (HV-8) build against one
// contract in parallel: `DayFacts`, one per local day, is the strip's ONLY input
// (spec §5.2). The window, the filter, the landed day and the strip's week are scope
// state it reads from `store/historyScopeStore.ts` (HV-3). The shape is §5.2's,
// verbatim; its canonical home is HV-4's `lib/historyDays.ts`, and HV-8 re-points this
// type there when it replaces the file — structurally identical, so HV-7 can hand
// HV-4's rows to this placeholder in the meantime.
import type { EventTypeKey } from '../../constants/eventTypes';

export type DayFacts = {
  /** Local day key, YYYY-MM-DD. */
  day: string;
  /** The population: every logged event except a look. */
  total: number;
  byType: Partial<Record<EventTypeKey, number>>;
  /** Qualifying meals rated below Most (never a treat, never free-fed). */
  mealsNotFinished: number;
  /** By `deriveMedicationCourses` key. */
  doses: Record<string, { logged: number; notInFull: number }>;
  photographed: number;
  noted: number;
  /** Noticed shows the date; never counted. */
  looked: boolean;
};

export interface WeekStripProps {
  days: readonly DayFacts[];
}

export function WeekStrip(_props: WeekStripProps): null {
  return null;
}
