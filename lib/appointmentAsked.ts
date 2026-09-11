import AsyncStorage from '@react-native-async-storage/async-storage';

// The Home strip's ask-once memory (CUL-903 VV-5; spec §4.1 A2b).
//
// After an appointment's day passes with no visit logged, the strip asks ONCE —
// *Did Tuesday's visit happen?* — and then leaves Home whatever the answer. Two of
// the three answers are already durable: *Yes* logs a visit (the appointment's
// `vet_visit_id` fills), *It didn't* sets `cancelled_at`. The third — the owner
// dismissing the ask, or simply never answering it — has nothing in the record to
// write to, and inventing one would be wrong twice over: a server column called
// `asked_at` would say "this account was asked", which is not true (a DEVICE was),
// and it would sync the dismissal to a phone that never showed the ask.
//
// So it is device-local, which is the issue's own default. The cost is stated
// rather than hidden: dismiss on the phone and the ask can still appear once on the
// tablet. That is the honest behaviour — each device asks the owner in front of it
// at most once — and it is strictly better than the alternative failure, which is
// one device's dismissal silently suppressing the only ask the other would have
// shown.
//
// Shaped after `lib/lookWithheld.ts` and the Signal fold: one key, a sanitized
// blob, every operation best-effort, and cleared BY NAME in `wipeLocalSession`. The
// next person on a shared device must not inherit "already asked" against a booking
// belonging to a pet they have never seen.

export const APPOINTMENT_ASKED_STORAGE_KEY = 'nyx.appointmentAsked';

/** appointmentId → the ISO instant this device showed and dismissed the ask. */
type AskedStore = Record<string, string>;

// The clear epoch — `lib/signalArrival`'s idiom, for the same reason. A blob write
// is a read-modify-write and the strip fires it un-awaited, so a `clearAppointmentAsked()`
// landing between the read and the write would put the whole previous account's map
// back after `wipeLocalSession()` had already returned clean.
let clearEpoch = 0;

function sanitize(parsed: unknown): AskedStore {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: AskedStore = {};
  for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof at === 'string' && at.length > 0) out[id] = at;
  }
  return out;
}

/**
 * The whole blob, or null when storage could not be READ — which is not the same as
 * a blob that answered empty (C-12).
 *
 * The distinction decides the strip: an unreadable store must NOT be treated as "not
 * yet asked", because that is the direction that re-asks about a visit the owner
 * already dismissed, every launch, forever.
 */
async function readStore(): Promise<AskedStore | null> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(APPOINTMENT_ASKED_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return {};
  try {
    return sanitize(JSON.parse(raw));
  } catch {
    // A half-written or hand-edited blob is discarded, not trusted.
    return {};
  }
}

/**
 * Has this device already asked about this appointment?
 *
 * `true` on an unreadable store: see `readStore`. Silence is the safe direction for
 * an ask — the appointment still sits in the visits list's *Waiting on you* bucket
 * (VV-2), which is a surface the owner goes to rather than one that comes to them.
 */
export async function hasAskedAboutAppointment(appointmentId: string): Promise<boolean> {
  const store = await readStore();
  if (store === null) return true;
  return appointmentId in store;
}

/** Record that this device asked. Best-effort; a failed write costs one repeat ask. */
export async function markAppointmentAsked(appointmentId: string, nowIso: string): Promise<void> {
  const epoch = clearEpoch;
  const store = await readStore();
  if (store === null) return;
  if (epoch !== clearEpoch) return;
  try {
    await AsyncStorage.setItem(
      APPOINTMENT_ASKED_STORAGE_KEY,
      JSON.stringify({ ...store, [appointmentId]: nowIso }),
    );
  } catch {
    // Storage refused the write. The ask will appear once more, which is the
    // recoverable direction.
  }
}

/** Sign-out teardown, wired into `wipeLocalSession` (FR-9 parity). */
export async function clearAppointmentAsked(): Promise<void> {
  clearEpoch += 1;
  try {
    await AsyncStorage.removeItem(APPOINTMENT_ASKED_STORAGE_KEY);
  } catch {
    // Best-effort, like every other clear in that list.
  }
}
