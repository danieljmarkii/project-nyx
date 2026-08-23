// The discard guard (CUL-612, `docs/nyx-app-polish-requirements.md` §5).
//
// A backdrop tap on a HALF-FILLED sheet confirm asks before discarding. The
// confirm sheet (components/log/SimpleEventConfirm) is deliberately a
// confirmation rather than a form — the app can already describe the row it is
// about to write — but the owner may still have put work into it: attached a
// photo, adjusted the time window, typed a note. A stray tap outside the sheet
// throws all three away silently, and the photo is the expensive one: it is
// often of the thing itself, at 2am, and it does not exist anywhere else.
//
// ── WHAT COUNTS AS "HALF-FILLED", AND WHAT DOES NOT ─────────────────────────
// Only OWNER INPUT counts. The sheet opens pre-filled with honest defaults — the
// time is now, the mode is "Saw it" — and re-confirming a default is not work.
// Two near-misses this predicate deliberately excludes:
//
//   · OPENING the window editor without moving anything. Expanding a disclosure
//     is not an edit; guarding it would put a dialog in front of an owner who
//     merely looked.
//   · The clock advancing. `timeTouched` is derived by the caller against the
//     values captured when the sheet opened, not against `now`, so a sheet left
//     open for a minute does not become dirty on its own.
//
// The cost of getting this wrong runs one way and not the other: a missed guard
// silently destroys a photo, while a spurious guard costs one extra tap. Where
// the two are genuinely close, prefer asking.

export interface ConfirmDraft {
  /** A photo has been attached (camera or library). */
  hasPhoto: boolean;
  /** The owner moved the time off the sheet's opening state — a mode switch to
   *  "Found it", a scrubbed point, or an adjusted window bound. */
  timeTouched: boolean;
  /** A non-empty note has been typed (whitespace does not count). */
  hasNote: boolean;
}

export function isConfirmDirty(draft: ConfirmDraft): boolean {
  return draft.hasPhoto || draft.timeTouched || draft.hasNote;
}

/**
 * The guard's alert copy, or null when there is nothing to guard.
 *
 * The body NAMES what would be lost rather than saying "your changes" — the
 * specific-over-generic rule (nyx-voice Pattern 2), and here it also does real
 * work: an owner who tapped the backdrop by accident needs to know in one glance
 * whether the photo they just took is the thing at stake.
 */
export function discardGuardCopy(draft: ConfirmDraft): { title: string; body: string } | null {
  if (!isConfirmDirty(draft)) return null;
  const parts: string[] = [];
  if (draft.hasPhoto) parts.push('the photo');
  if (draft.timeTouched) parts.push('the time you set');
  if (draft.hasNote) parts.push('the note');
  return {
    // "log" matches the noun the Remove alerts already use ("Remove this log?"),
    // so the two reversals in this app speak about the same object.
    title: 'Discard this log?',
    body: `${sentenceCase(joinList(parts))} won’t be saved.`,
  };
}

/** "a" · "a and b" · "a, b and c" — no serial comma, matching the app's prose. */
function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function sentenceCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
