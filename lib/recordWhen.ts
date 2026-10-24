import { formatTime } from './utils';

// Kept out of lib/utils.ts, which the Edge Functions share: a display helper for the app's
// screens has no business redeploying the server.

// A record's moment as its own row names it (the event editor's When, CUL-1909): the
// weekday, the date and the time, in the device's locale.
export function formatRecordWhen(date: Date): string {
  return `${formatRecordDate(date)}, ${formatTime(date)}`;
}

// The same date with no time: for a record whose time is a guess or a range, where a
// clock time would claim a precision the row does not hold.
export function formatRecordDate(date: Date): string {
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
