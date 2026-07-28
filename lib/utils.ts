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

// Local calendar day (YYYY-MM-DD) from a Date's LOCAL components. Used for
// report-window bounds (B-222), which the server treats as local calendar days
// — a UTC round-trip (toISOString) would shift the day for anyone behind UTC.
export function toLocalDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Parse a YYYY-MM-DD day key into a LOCAL Date (midnight local), not UTC, so
// downstream formatting never shifts the day. Returns null for a malformed key.
export function dayKeyToLocalDate(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const MS_PER_DAY = 86_400_000;

// Epoch-day index (whole days since 1970-01-01) of the calendar day `ms` falls on.
//
// The index is built from CALENDAR COMPONENTS via Date.UTC rather than by dividing a
// millisecond span, for two reasons a day COUNTER cares about (B-421):
//   • `Math.floor(ms / MS_PER_DAY)` is a UTC epoch-day index — at 23:30 local in
//     UTC−7 it has already rolled to tomorrow, and at 00:30 local in UTC+11 it is
//     still yesterday. That is the two-day disagreement B-421 exists to kill.
//   • Differencing two local midnights in milliseconds is off by an hour across a
//     DST transition (a local day can be 23h or 25h). Indexing calendar components
//     makes every local day advance the index by exactly 1.
//
// `timeZone` is an IANA zone to bucket in. OMIT IT on the client — the device's own
// zone IS the owner's midnight, and that is the production path. It exists because
// the day boundary is a parameter of this problem rather than a constant: the Edge
// Function port has no device clock and buckets by `user_profiles.timezone` instead,
// so stating the zone explicitly is what lets the two be pinned against each other.
// An invalid zone falls back to the device zone rather than throwing.
export function localDayIndex(ms: number, timeZone?: string): number {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      }).formatToParts(new Date(ms));
      const y = Number(parts.find((p) => p.type === 'year')?.value);
      const m = Number(parts.find((p) => p.type === 'month')?.value);
      const d = Number(parts.find((p) => p.type === 'day')?.value);
      if (Number.isInteger(y) && Number.isInteger(m) && Number.isInteger(d)) {
        return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
      }
    } catch {
      // invalid IANA zone → Intl throws → fall through to the device zone
    }
  }
  const local = new Date(ms);
  return Math.floor(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()) / MS_PER_DAY);
}

// Epoch-day index of a stored date value, interpreted the way each form is stored:
//
//   • 'YYYY-MM-DD' (a Postgres DATE — `diet_trials.started_at`, `completed_at`) is
//     ALREADY a calendar day and is indexed verbatim, zone-independently. Do NOT
//     round-trip it through `new Date(key)`: that parses as UTC midnight, so for
//     anyone behind UTC the day lands on the previous local date and every counter
//     built on it reads one too high.
//   • Anything else is an instant, indexed by the calendar day it falls on.
//
// Returns null when the value is neither — the caller reports "unknown", never a
// guessed day number.
export function localDayIndexOf(value: string, timeZone?: string): number | null {
  const key = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (key) {
    const [y, m, d] = [Number(key[1]), Number(key[2]), Number(key[3])];
    // The regex validates SHAPE, not validity, and Date.UTC silently rolls over:
    // '2026-13-45' would become 2027-02-14 and '2026-02-30' 2026-03-02 — turning a
    // malformed value into a confident wrong day rather than the documented null.
    // Round-trip the components to reject anything that did not survive intact.
    // (Date.UTC also maps years 0–99 to 1900+y, which the ms round-trip catches.)
    const utc = Date.UTC(y, m - 1, d);
    const back = new Date(utc);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) {
      return null;
    }
    return Math.floor(utc / MS_PER_DAY);
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return localDayIndex(ms, timeZone);
}

// Format a UTC day key (YYYY-MM-DD) as a short "Mon D" label ("Jun 24"). The Patterns
// calendar buckets by UTC day (lib/analytics), so its cells, the day drill-in, and the
// History single-day filter must all NAME the day in UTC — otherwise a near-midnight
// event would read under one date on the grid and another in the label. Distinct from the
// LOCAL-day helpers above (toLocalDayKey / dayKeyToLocalDate), which serve the report
// window; keep the two straight (B-308 / Calendar v3 N5b).
export function formatUtcDayShort(dayKey: string): string {
  return new Date(`${dayKey}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// The [after, before) ISO bounds of one UTC calendar day, for the getTimeline
// dateAfter/dateBefore single-day filter (B-308) and the calendar drill-in's per-day
// fetch. UTC so the bounds line up exactly with the calendar's UTC bucketing. Returns
// null for a malformed key.
export function utcDayBounds(dayKey: string): { after: string; before: string } | null {
  const startMs = Date.parse(`${dayKey}T00:00:00.000Z`);
  if (!Number.isFinite(startMs)) return null;
  return {
    after: new Date(startMs).toISOString(),
    before: new Date(startMs + 86_400_000).toISOString(),
  };
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

// B-448 — what an EDIT should write to the three B-010 columns.
//
// An edit form always holds a confidence value, because its controls have to be
// seeded with something (app/edit-event.tsx seeds the Saw-it/Found-it toggle at
// 'saw'). That seed is not the owner's claim. Writing it anyway is how a row's
// time silently gets re-described by an edit that was only ever about a note or
// a photo — and the direction it moves is toward false precision: an
// unclassified row (NULL — "NOT a claim either way", migration 012) becomes
// 'witnessed', which the vet report prints as `seen` instead of `unspecified`. A
// bare exact-looking time in a column of tagged rows reads as the most
// trustworthy row on the page, so the one event nobody actually saw ends up
// looking like the best-evidenced one.
//
// Returns undefined when the owner asserted nothing — updateEvent takes that as
// "leave all three columns exactly as stored". Pure so the rule is testable
// away from the screen; it is the same discipline the dose adherence / how_given
// writes follow (write the field the owner changed, never the ones they didn't).
export function confidenceUpdateForEdit(input: {
  /** True only if the owner touched a control that CLAIMS something about the time. */
  ownerAsserted: boolean;
  /** The form's current claim — meaningful only when ownerAsserted. */
  form: { confidence: OccurredConfidence; earliest: Date | null; latest: Date | null };
}): { value: OccurredConfidence; earliest: string | null; latest: string | null } | undefined {
  if (!input.ownerAsserted) return undefined;
  const { confidence, earliest, latest } = input.form;
  // Bounds belong to a window and nothing else — carrying them onto a point
  // would violate migration 012's chk_occurred_window_fields on sync.
  const windowed = confidence === 'window';
  return {
    value: confidence,
    earliest: windowed && earliest ? earliest.toISOString() : null,
    latest: windowed && latest ? latest.toISOString() : null,
  };
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

// Archive-last-pet blocked copy (spec §3.5) — one source for the Pet tab's
// pre-confirm guard AND the confirm sheet's race re-check, so the two alerts
// can never drift apart. Honest about the constraint, names the way forward;
// true deletion stays with the Privacy track.
export function archiveBlockedCopy(petName: string): { title: string; body: string } {
  return {
    title: `${petName} is your only pet here`,
    body: 'Your pet list needs at least one pet, so archiving isn’t available right now. Adding another pet first makes this possible.',
  };
}
