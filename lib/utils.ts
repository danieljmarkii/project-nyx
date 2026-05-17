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
