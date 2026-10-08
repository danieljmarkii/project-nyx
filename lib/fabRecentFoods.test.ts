// CUL-1647 — the FAB's day span. Every expected instant is built from LOCAL calendar
// components (the B-514 idiom, C-29), never a UTC literal, so the suite asserts the same
// thing in every zone the CI runs it in (UTC, and the non-UTC job's +14, +12:45, −10).
import { fabFoodDay, FAB_RECENT_WINDOW_DAYS } from './fabRecentFoods';

const local = (y: number, m: number, d: number, h = 0, min = 0, s = 0, ms = 0) =>
  new Date(y, m - 1, d, h, min, s, ms);

describe('fabFoodDay — the span is the window before today’s local midnight', () => {
  it('ends at today’s local midnight and starts the window’s local days before it', () => {
    const span = fabFoodDay(local(2026, 10, 8, 18, 30).getTime());
    expect(span.before).toBe(local(2026, 10, 8).toISOString());
    expect(span.after).toBe(local(2026, 10, 8 - FAB_RECENT_WINDOW_DAYS).toISOString());
  });

  it('is the same span all day: the first and last millisecond of a day agree', () => {
    const first = fabFoodDay(local(2026, 10, 8, 0, 0, 0, 0).getTime());
    const last = fabFoodDay(local(2026, 10, 8, 23, 59, 59, 999).getTime());
    expect(last).toEqual(first);
  });

  it('moves by exactly one local day at midnight', () => {
    const before = fabFoodDay(local(2026, 10, 8, 23, 59, 59, 999).getTime());
    const after = fabFoodDay(local(2026, 10, 9, 0, 0, 0, 0).getTime());
    expect(after.before).toBe(local(2026, 10, 9).toISOString());
    expect(after.after).toBe(local(2026, 10, 9 - FAB_RECENT_WINDOW_DAYS).toISOString());
    expect(after.before).not.toBe(before.before);
  });

  it('a meal logged today is never inside today’s span (it shows from tomorrow)', () => {
    const now = local(2026, 10, 8, 7, 15);
    const span = fabFoodDay(now.getTime());
    const breakfast = local(2026, 10, 8, 7, 0).getTime();
    expect(breakfast >= Date.parse(span.before)).toBe(true);
    // Tomorrow it is in.
    const tomorrow = fabFoodDay(local(2026, 10, 9, 7, 15).getTime());
    expect(breakfast >= Date.parse(tomorrow.after) && breakfast < Date.parse(tomorrow.before)).toBe(true);
  });

  it('counts local days across a month edge rather than 24h blocks', () => {
    const span = fabFoodDay(local(2026, 3, 5, 12).getTime());
    expect(span.after).toBe(local(2026, 2, 19).toISOString());
  });

  it('the window is the Data Scientist’s 14 days', () => {
    expect(FAB_RECENT_WINDOW_DAYS).toBe(14);
  });
});

