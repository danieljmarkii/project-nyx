// Shared utility functions used across multiple screens and components.

export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Parse an EXIF datetime string ("YYYY:MM:DD HH:MM:SS") to ISO 8601.
// Returns null if the string is absent or malformed.
export function exifDateToISO(exifDate: string): string | null {
  const [datePart, timePart] = exifDate.split(' ');
  if (!datePart || !timePart) return null;
  try {
    return new Date(`${datePart.replace(/:/g, '-')}T${timePart}`).toISOString();
  } catch {
    return null;
  }
}

// EXIF DateTimeOriginal is naive (no timezone) and trusted blindly. A wrong
// camera clock can yield a future timestamp; treat anything past `now` as
// unusable rather than letting it land as the event's occurred_at. Returns
// the ISO string when usable, null otherwise.
export function trustedPastExifIso(exifIso: string | null | undefined): string | null {
  if (!exifIso) return null;
  const t = Date.parse(exifIso);
  if (Number.isNaN(t)) return null;
  if (t > Date.now()) return null;
  return exifIso;
}

// Locale-aware hh:mm formatter shared by every surface that renders an
// event's clock time (log forms, edit, toast).
export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Format an ISO timestamp for the EXIF attribution. Always includes the
// time; appends the date when it's not today, so a library-photo backfill
// is visible to the user before they confirm.
export function formatExifAttribution(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return 'from your photo';
  const datePart = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return `from your photo (${datePart})`;
}

// B-010 event timestamp uncertainty.
//   witnessed — owner saw it; occurred_at is the exact point
//   estimated — owner found it, knows roughly when; a single point, not witnessed
//   window    — owner found it, only a range; bounded by earliest/latest
export type OccurredConfidence = 'witnessed' | 'estimated' | 'window';

// Derive the canonical occurred_at point from a confidence selection so every
// existing reader (timeline, correlation engine, vet report) keeps working off
// a single timestamp. Pure — the one place the window→point reduction lives.
//   witnessed / estimated -> the chosen point
//   window                 -> the latest edge ("no later than" / discovery time)
//                             — a real value the owner entered, never an
//                             invented midpoint (PM decision 2026-05-24). The
//                             window fields remain the source of truth; this is
//                             only a sort/representative key, and surfaces must
//                             render the window, not this point, when
//                             confidence != witnessed.
//   window, only earliest   -> earliest (degenerate; UI guards against it)
//   window, neither edge    -> falls back to point (shouldn't happen)
export function deriveOccurredAt(input: {
  confidence: OccurredConfidence;
  point: Date;
  earliest: Date | null;
  latest: Date | null;
}): Date {
  const { confidence, point, earliest, latest } = input;
  if (confidence !== 'window') return point;
  if (latest) return latest;
  if (earliest) return earliest;
  return point;
}

// How a stored event's time renders once we honor its confidence (B-010).
//   primary — full natural phrase for a primary surface (detail, vet report)
//   compact — drops prefix words for dense rows (history)
//   tag     — short qualifier, null when witnessed/unclassified so exact times
//             stay visually quiet
//   isExact — whether a relative "3 hr ago" suffix is honest to append
export interface OccurredAtDisplay {
  primary: string;
  compact: string;
  tag: string | null;
  isExact: boolean;
}

// Render an event's occurred_at honoring its confidence — the single place the
// witnessed/estimated/window phrasing lives, so detail, history, and the vet
// report stay consistent and never imply false precision. Never invents a
// midpoint: a window renders as its bounds. Legacy rows (confidence null) fall
// back to the bare point — not a claim either way, just the value we have.
export function describeOccurredAt(input: {
  confidence?: OccurredConfidence | null;
  occurredAt: string;
  earliest?: string | null;
  latest?: string | null;
}): OccurredAtDisplay {
  const { confidence } = input;
  const point = new Date(input.occurredAt);
  const earliest = input.earliest ? new Date(input.earliest) : null;
  const latest = input.latest ? new Date(input.latest) : null;

  if (confidence === 'estimated') {
    const t = `~${formatTime(point)}`;
    return { primary: t, compact: t, tag: 'estimated', isExact: false };
  }

  if (confidence === 'window') {
    if (earliest && latest) {
      const e = formatTime(earliest);
      const l = formatTime(latest);
      return {
        primary: `between ${e} and ${l}`,
        compact: `${e}–${l}`,
        tag: 'approximate',
        isExact: false,
      };
    }
    if (latest) {
      const l = formatTime(latest);
      return { primary: `found by ${l}`, compact: `by ${l}`, tag: 'approximate', isExact: false };
    }
    if (earliest) {
      // Degenerate (lower edge only) — capture UI guards against it, but render
      // honestly rather than fall through to a misleading exact point.
      const e = formatTime(earliest);
      return { primary: `after ${e}`, compact: `after ${e}`, tag: 'approximate', isExact: false };
    }
    // Window with no edges — nothing to anchor on; fall through to the point.
  }

  // witnessed, unclassified legacy (null), or a degenerate edgeless window.
  const t = formatTime(point);
  return { primary: t, compact: t, tag: null, isExact: true };
}
