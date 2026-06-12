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

// Compact pet age for the Home identity strip (B-076) — distinct from the Pet
// tab's detailed "4yr 2mo": here we want the single coarsest unit ("4 yrs",
// "8 mo") that reads at a glance above the Signal. Returns null when there's no
// usable DOB (missing, malformed, or in the future) so the caller can omit the
// unit entirely rather than render a placeholder dash on the home surface.
export function petAgeShort(dob: string | null): string | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  const months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());
  if (months < 0) return null; // future DOB — nonsense, omit rather than show "0 mo"
  if (months < 1) return 'Under 1 mo';
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  return years === 1 ? '1 yr' : `${years} yrs`;
}

// The single slim line under the pet name in the Home identity strip (B-076):
// "{breed} · {age}". Each part is optional, joined only when present, so a pet
// with just a breed or just an age still reads cleanly. When neither exists,
// fall back to the species word ("Dog"/"Cat") so the line is never empty on a
// known pet — but return '' for 'other' with no detail, letting the caller drop
// the line rather than print a meaningless "Other".
export function petIdentityLine(pet: {
  species: string;
  breed: string | null;
  date_of_birth: string | null;
}): string {
  const age = petAgeShort(pet.date_of_birth);
  const breed = pet.breed?.trim() || null;
  const parts = [breed, age].filter(Boolean) as string[];
  if (parts.length) return parts.join(' · ');
  if (pet.species === 'dog') return 'Dog';
  if (pet.species === 'cat') return 'Cat';
  return '';
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

// Pronoun set keyed by the pet's recorded sex; 'unknown' takes singular they.
// Kept as data (not string surgery) because the they-form conjugates
// differently ("she comes" / "they come") — copy templates pick the verb.
export interface PetPronouns {
  subject: string;     // she / he / they
  object: string;      // her / him / them
  possessive: string;  // her / his / their
  comesVerb: string;   // comes / come  (3rd-person-singular vs plural-form)
}

export function petPronouns(sex: 'male' | 'female' | 'unknown'): PetPronouns {
  if (sex === 'female') return { subject: 'she', object: 'her', possessive: 'her', comesVerb: 'comes' };
  if (sex === 'male') return { subject: 'he', object: 'him', possessive: 'his', comesVerb: 'comes' };
  return { subject: 'they', object: 'them', possessive: 'their', comesVerb: 'come' };
}

// Archive confirm-sheet body (multi-pet spec §3.5, mock B4 verbatim for the
// female case): warm + honest about reversibility — history is kept, the pet
// just leaves the list, and the way back is named. Never alarm language; the
// data is not going anywhere (soft archive, nothing cascades).
export function archiveConfirmBody(pet: { sex: 'male' | 'female' | 'unknown' }): string {
  const p = petPronouns(pet.sex);
  const possessive = p.possessive.charAt(0).toUpperCase() + p.possessive.slice(1);
  return `${possessive} history stays safe, and ${p.subject} ${p.comesVerb} off your pet list. You can bring ${p.object} back anytime from Archived pets.`;
}
