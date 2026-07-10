import AsyncStorage from '@react-native-async-storage/async-storage';

// TEMPORARY diagnostic scaffolding (auth session-persistence investigation).
//
// WHY THIS EXISTS: build 32 shipped a chunked-SecureStore fix (#306) for the
// "forced to log in too often" bug, but the server-side auth logs prove the
// symptom persists — the session is not being restored on cold start after the
// app has been idle. The previous fix was validated only against an in-memory
// mock and shipped without on-device verification, so we could never see what
// actually happens on a real device. This module fixes that: it records small,
// ordered breadcrumbs around the storage read/write and the auth lifecycle so a
// single diagnostic TestFlight build can show us the real failure.
//
// HARD RULES:
//   1. It NEVER logs a token, refresh token, JWT, or email — only sizes, counts,
//      booleans, and event names. `redactDetail` is a second line of defence.
//   2. It NEVER throws and NEVER blocks the caller — a diagnostic must not be
//      able to perturb the very auth flow it is measuring. Every write is
//      fire-and-forget with a swallowed rejection.
//   3. It writes to AsyncStorage, which is a DIFFERENT store from the
//      SecureStore layer under suspicion (so it is a reliable observer) and is
//      NOT cleared by wipeLocalSession (so the breadcrumbs from the failing
//      cold-start survive the SIGNED_OUT wipe that routes to the login screen).
//
// This whole file is expected to be removed once the root cause is confirmed
// and fixed (tracked in the backlog).

const LOG_KEY = '__culprit_auth_debug_v1';
const MAX_ENTRIES = 200;

// Longest string we will store verbatim in a breadcrumb detail. Anything longer
// is assumed to be a value we must never persist (a token, a serialized session)
// and is replaced with its length only.
const MAX_DETAIL_STRING = 64;

export type Breadcrumb = {
  seq: number;
  t: string; // ISO timestamp
  ms: number; // epoch millis (for precise ordering across launches)
  launch: string; // groups breadcrumbs by app-process lifetime
  event: string;
  detail?: Record<string, unknown>;
};

// A random id for THIS launch of the app. The whole diagnosis hinges on being
// able to separate "what the previous run persisted" from "what this cold start
// read back", so grouping by process lifetime is essential.
export const LAUNCH_ID: string = Math.random().toString(36).slice(2, 10);

// Pure: strip anything that could be a secret. We only ever intend to log
// numbers/booleans/short enums, but redact defensively in case a caller passes a
// value by mistake — a token must never reach the log even via human error.
export function redactDetail(
  detail?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!detail) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail)) {
    if (typeof v === 'string' && v.length > MAX_DETAIL_STRING) {
      out[k] = `<${v.length} chars>`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

// Pure: keep only the most recent `max` entries.
export function trimRing(entries: Breadcrumb[], max: number): Breadcrumb[] {
  return entries.length > max ? entries.slice(entries.length - max) : entries;
}

// Pure: assemble one breadcrumb. Time is injected so it is unit-testable.
export function buildBreadcrumb(
  seq: number,
  event: string,
  detail: Record<string, unknown> | undefined,
  launch: string,
  nowMs: number,
): Breadcrumb {
  return {
    seq,
    t: new Date(nowMs).toISOString(),
    ms: nowMs,
    launch,
    event,
    detail: redactDetail(detail),
  };
}

let seq = 0;
// Serialize the read-modify-write appends so concurrent fire-and-forget calls
// (a getItem and a setItem breadcrumb racing) can't clobber the ring buffer.
let chain: Promise<void> = Promise.resolve();

/**
 * Record a breadcrumb. Fire-and-forget: returns immediately, never throws.
 */
export function logAuth(event: string, detail?: Record<string, unknown>): void {
  const entry = buildBreadcrumb(seq++, event, detail, LAUNCH_ID, Date.now());
  // Also surface to the Metro console for the rare Runtime-B session; harmless
  // and free on a TestFlight build where there is no console. Silenced under
  // jest so a 200-entry ring test doesn't flood the suite output.
  if (typeof process === 'undefined' || !process.env.JEST_WORKER_ID) {
    console.log('[authdbg]', entry.event, entry.detail ?? '');
  }
  chain = chain
    .then(async () => {
      const raw = await AsyncStorage.getItem(LOG_KEY);
      const arr: Breadcrumb[] = raw ? (JSON.parse(raw) as Breadcrumb[]) : [];
      arr.push(entry);
      await AsyncStorage.setItem(LOG_KEY, JSON.stringify(trimRing(arr, MAX_ENTRIES)));
    })
    .catch(() => {
      // Never throw from instrumentation.
    });
}

// Await all pending fire-and-forget appends. Useful before a read (so the
// viewer shows the very latest) and required by tests for determinism.
export function flushAuthLog(): Promise<void> {
  return chain;
}

export async function readAuthLog(): Promise<Breadcrumb[]> {
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    return raw ? (JSON.parse(raw) as Breadcrumb[]) : [];
  } catch {
    return [];
  }
}

export async function clearAuthLog(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LOG_KEY);
  } catch {
    // best-effort
  }
}
