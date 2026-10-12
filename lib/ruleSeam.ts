// EN-3's go-live date lines (Engines v3 PR-27k, CUL-1513; tiers spec §5, "The GA day").
//
// Three surfaces name the day the new rule went live: an earlier-rule read's record says
// "Read under the earlier rule, before {date}.", a pet's first new-rule read says "New
// since {date}: …", and a month that straddles the change dates its two call lines and
// marks the seam. The date only exists once CUL-1407 seeds `engines_v3_en3`, and this
// build ships before that, so the date rides IN the key's own `app_config` value:
//
//   { "enabled": false, "allowlist": ["<uid>"], "live_since": "2026-10-20" }
//
// The flag resolver on both sides reads `enabled` / `allowlist` only, so the extra field
// changes no gate. Absent, malformed, or with the key off for this caller, every line here
// renders nothing: the build ships dark and the lines appear the day the row carries a date.
//
// `live_since` is a calendar DAY, read as the start of that day on the reader's phone (the
// month's day keys are local days, and so is "before Oct 20"). The seed names a day on or
// after the flip, never before it, so "before {date}" is never said of a read made under
// the new rule. Each line is said only where the record backs it (C-3): a read is "before"
// the date only when its last write is, and a month dates its lines only when every day
// each line counts sits on the side its words name.
import type { MonthModel } from './monthModel';
import { isTieredRow, tierDisplayOf, TIER_WORDS, type TierRow } from './incidentTierWords';
import { dayKeyToLocalDate, formatCalendarDate } from './utils';

/** The field in `engines_v3_en3`'s `app_config` value that carries the go-live day. */
export const LIVE_SINCE_FIELD = 'live_since';

/** The go-live day from the key's raw `app_config` value, or null when it carries none a
 *  calendar can hold ("2026-02-30" is not a day). Pure. */
export function liveSinceOf(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = (raw as Record<string, unknown>)[LIVE_SINCE_FIELD];
  if (typeof value !== 'string') return null;
  const d = dayKeyToLocalDate(value);
  if (!d) return null;
  // Round-trip: the Date constructor rolls an impossible day over into the next month.
  const back = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return back === value ? value : null;
}

/** "Oct 20": the year-less date the mock draws. */
function dayWord(dayKey: string): string {
  return formatCalendarDate(dayKey) ?? dayKey;
}

/** Whether a read whose last write is `updatedAt` was made before the go-live day began on
 *  this phone. Parsed, never compared as text (C-40). Unknown or unparseable: false, so the
 *  line is withheld rather than said of a read that may be on the far side. */
export function readBeforeLiveSince(updatedAt: string | null | undefined, liveSince: string): boolean {
  if (!updatedAt) return false;
  const at = new Date(updatedAt).getTime();
  const start = dayKeyToLocalDate(liveSince)?.getTime();
  if (!Number.isFinite(at) || start === undefined || !Number.isFinite(start)) return false;
  return at < start;
}

/** The meta line under an earlier-rule read's unchanged card, or null when it cannot be
 *  said: no go-live day, a new-rule read, or a read last written on or after the day. */
export function earlierRuleLineOf(
  row: (TierRow & { updated_at?: string | null }) | null | undefined,
  liveSince: string | null,
): string | null {
  if (!row || !liveSince || isTieredRow(row)) return null;
  if (!readBeforeLiveSince(row.updated_at, liveSince)) return null;
  return `Read under the earlier rule, before ${dayWord(liveSince)}.`;
}

/** The one line on a pet's first new-rule read, when the pet already has an earlier one. */
export function newSinceLine(liveSince: string, petName: string | null | undefined): string {
  const name = petName?.trim();
  const keep = name ? `${name}'s earlier reads keep` : 'Earlier reads keep';
  return `New since ${dayWord(liveSince)}: reads say how soon to call. ${keep} the words they had.`;
}

/** One read of the pet's, as the phone's copy holds it, with its event's time and the
 *  read's own last write. */
export interface SeamRead extends TierRow {
  event_id: string;
  occurred_at: string;
  /** The server's `updated_at` for the read: when it was last written, so when the rule
   *  that wrote it was in force. */
  updated_at: string | null;
}

/**
 * From the record alone, so a second phone agrees (spec §5, no device key): the event whose
 * read was the pet's FIRST made under the new rule, and whether the pet has any earlier-rule
 * read. "First" is by when the READ was written, never when the event happened: a Re-run
 * can tier a September incident in November, and that read is not the one that met the new
 * rule first (code review on PR-27k). The id breaks a tie. A read's last write is the
 * closest the copy holds to when it was read, and it can only move later (a hide or a
 * correction bumps it), so the line can drift to a later read, never back over the date.
 * Only reads that stand as words count (`tierDisplayOf`): a read in flight or with no
 * verdict is not "a read" either side of the seam. Pure.
 */
export function ruleSeamOf(reads: readonly SeamRead[]): {
  firstTiered: string | null;
  firstTieredAt: string | null;
  hasEarlier: boolean;
} {
  let hasEarlier = false;
  let first: { id: string; at: number; raw: string } | null = null;
  for (const r of reads) {
    if (tierDisplayOf(r) === null) continue;
    if (!isTieredRow(r)) {
      hasEarlier = true;
      continue;
    }
    if (!r.updated_at) continue;
    const at = new Date(r.updated_at).getTime();
    if (!Number.isFinite(at)) continue;
    if (first === null || at < first.at || (at === first.at && r.event_id < first.id)) first = { id: r.event_id, at, raw: r.updated_at };
  }
  return { firstTiered: first?.id ?? null, firstTieredAt: first?.raw ?? null, hasEarlier };
}

/** The "New since" line for this event's read, or null: no go-live day, this is not the
 *  pet's first new-rule read, the pet has no earlier read to keep its words, or that first
 *  read was written BEFORE the day (an allow-listed tester's reads tier before the date the
 *  seed names, and "New since Oct 20" over an Oct 12 read is false). `own` is the record
 *  screen's own row for the event, fresher than the phone's copy of it (a Re-run that tiered
 *  this read lands on screen before the copy's next pull), so it stands in for it. */
export function newSinceLineOf(
  eventId: string,
  reads: readonly SeamRead[],
  liveSince: string | null,
  petName: string | null | undefined,
  own?: (TierRow & { updated_at?: string | null }) | null,
): string | null {
  if (!liveSince) return null;
  const merged = own
    ? reads.map((r) => (r.event_id === eventId ? { ...r, ...own, event_id: r.event_id, occurred_at: r.occurred_at, updated_at: own.updated_at ?? r.updated_at } : r))
    : reads;
  const { firstTiered, firstTieredAt, hasEarlier } = ruleSeamOf(merged);
  if (!hasEarlier || firstTiered !== eventId || firstTieredAt === null) return null;
  if (readBeforeLiveSince(firstTieredAt, liveSince)) return null;
  return newSinceLine(liveSince, petName);
}

/**
 * The month's two call lines, dated, and the day the seam mark sits on, or null for today's
 * undated lines. Dated only when the month holds BOTH rules' calls and every day each line
 * counts is on the side its words name: a Re-run after the day can give an old read a tier,
 * and "From Oct 20" over a day in September would be false (C-3). Those two conditions put
 * the go-live day inside the month, so the seam is always on a day the grid draws. A month
 * wholly on one side shows its one line as today (the mock's §05 frame).
 */
export function datedCallLinesOf(
  model: Pick<MonthModel, 'days'>,
  liveSince: string | null,
): { before: string; from: string; seamKey: string } | null {
  if (!liveSince) return null;
  let earlier = 0;
  let tiered = 0;
  for (const d of model.days) {
    if (d.call === null) continue;
    // Day keys are fixed-width 'YYYY-MM-DD', so their text order IS their day order; the
    // C-40 hazard is two spellings of an instant, which a day key never has.
    if (TIER_WORDS[d.call].rule === 'earlier') {
      if (d.key >= liveSince) return null;
      earlier += 1;
    } else {
      if (d.key < liveSince) return null;
      tiered += 1;
    }
  }
  if (earlier === 0 || tiered === 0) return null;
  if (!model.days.some((d) => d.key === liveSince && !d.outsideMonth)) return null;
  const word = dayWord(liveSince);
  return { before: `Before ${word}, read as`, from: `From ${word}, read as`, seamKey: liveSince };
}
