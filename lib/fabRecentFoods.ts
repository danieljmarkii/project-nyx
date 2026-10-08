// The FAB's recent foods keep one order for the day (CUL-1647, D4 of CUL-1625).
//
// The fan puts the newest food nearest the thumb, so a list re-read after every log
// moved the food just given under the next tap: the owner who feeds wet in the morning
// and dry at night found the wrong food there at every meal, and a pill writes a meal
// in one press. So the order is recency AS OF TODAY'S LOCAL MIDNIGHT: only meals
// before it count, nothing logged today can move a pill, and the order changes
// overnight. A food first logged today appears tomorrow; that is the accepted cost.
//
// The window bounds how long the fan can keep offering a food the pet stopped eating,
// which is how a pre-trial food stops lingering as a one-tap pill (CUL-416, CUL-100).
// Its length is the Data Scientist's call, made on the asymmetry of the two errors: a
// food missing from the fan costs one tap (Log food opens the picker, whose own 30 day
// shelf is unchanged), while a stale food present costs a re-exposure logged into a
// diet trial in one press. So it is the shortest window that still re-offers a staple
// fed every few days. Counted in LOCAL days, not 24h blocks, so a DST week neither
// gains nor loses an hour at the edge.
//
// The picker's `getRecentFoods` is shared and keeps its behaviour: the bounds are an
// optional argument only the FAB passes.

import type { RecentFoodsBounds } from './foodQueries';

export const FAB_RECENT_WINDOW_DAYS = 14;

/** The FAB's read span for the local day holding `nowMs`: from
 *  `FAB_RECENT_WINDOW_DAYS` local days before today's midnight (inclusive) up to
 *  today's midnight (exclusive). Device zone only: the device's midnight is the
 *  owner's, and this is only ever called on device. */
export function fabFoodDay(nowMs: number): RecentFoodsBounds {
  const before = new Date(nowMs);
  before.setHours(0, 0, 0, 0);
  const after = new Date(before);
  after.setDate(after.getDate() - FAB_RECENT_WINDOW_DAYS);
  return { after: after.toISOString(), before: before.toISOString() };
}

