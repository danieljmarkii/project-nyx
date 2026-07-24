// The App Intents — LogMeal / LogTreat / TopUpBowl (widget PR W4, spec §4).
//
// Defined ONCE here: the widget's buttons (W5) execute these in-process, and
// the B-291 free riders (Siri phrases / NFC / Action Button / Controls) ride
// the same functions later with loggedVia:'intent'. This module runs in the
// EXTENSION process, so its import graph is deliberately thin — appGroup,
// captureRecord, loggedVia, utils, widgetSession — and it must NEVER import
// db/sync/supabase/signal (the app's SQLite and auth client don't exist here;
// lib/supabase.ts also throws at import on missing env and registers an
// AppState listener, both wrong in an extension).
//
// Write order is the W3 contract (lib/captureInbox.ts header):
//   1. INBOX FIRST — one JSON file, named by the record id. This is the
//      capture. If this write fails the tap FAILED, and the caller must
//      surface it (ok:false → W5 renders the failure state; "a tap is lost
//      only if the extension's own file write fails — which the extension
//      surfaces as a failed tap, never a silent one").
//   2. DIRECT REST second, best-effort — the same row ids over PostgREST with
//      the OWNER's session (never a service key on device, spec §8), so the
//      record can reach Supabase before the app next foregrounds. Any failure
//      here is swallowed: the inbox is the source of truth, and the id-keyed
//      idempotency (INSERT OR IGNORE locally, ignore-duplicates upserts on the
//      wire) makes the two paths converge on one row in either order.
//
// The no-garbage rule (D2) is the signatures: LogMeal/LogTreat REQUIRE a
// foodItemId — there is no unnamed form to call. (The spec's LogMeal(pet,
// foodItem, slot) slot argument is resolution-side only: the slot determines
// WHICH food the widget offers, but the record carries the named food, and no
// schema anywhere stores a slot.)

import { File } from 'expo-file-system';
import { getCaptureInboxDirectory } from './appGroup';
import { uuid } from './utils';
import {
  CAPTURE_INBOX_SCHEMA_VERSION,
  captureFileName,
  type BowlTopUpCaptureRecord,
  type CaptureRecord,
  type MealCaptureRecord,
} from './captureRecord';
import type { InboxLoggedVia } from './loggedVia';
import { getExtensionSession, type ExtensionSession } from './widgetSession';

// ── Pure record builders (unit-tested directly) ──────────────────────────────

export interface CaptureIds {
  eventId: string;
  mealId: string;
}

export function buildMealCapture(params: {
  petId: string;
  foodItemId: string;
  kind: 'meal' | 'treat';
  loggedVia: InboxLoggedVia;
  now: Date;
  ids: CaptureIds;
}): MealCaptureRecord {
  const iso = params.now.toISOString();
  return {
    schemaVersion: CAPTURE_INBOX_SCHEMA_VERSION,
    id: params.ids.eventId,
    mealId: params.ids.mealId,
    kind: params.kind,
    petId: params.petId,
    foodItemId: params.foodItemId,
    // A widget tap logs "now" (spec §2.3) — occurred and created coincide.
    occurredAt: iso,
    loggedVia: params.loggedVia,
    createdAt: iso,
  };
}

export function buildBowlTopUpCapture(params: {
  petId: string;
  loggedVia: InboxLoggedVia;
  now: Date;
  id: string;
}): BowlTopUpCaptureRecord {
  const iso = params.now.toISOString();
  return {
    schemaVersion: CAPTURE_INBOX_SCHEMA_VERSION,
    id: params.id,
    kind: 'bowl_topup',
    petId: params.petId,
    occurredAt: iso,
    loggedVia: params.loggedVia,
    createdAt: iso,
  };
}

// ── Direct REST payloads (pure; mirror lib/sync.ts's upsert columns) ─────────
//
// Column-for-column the shape syncPendingEvents/syncPendingMeals push, so a
// direct-written row and a later queue-pushed row are INDISTINGUISHABLE
// server-side (the id-keyed convergence depends on that). occurred_at_source
// 'now' + confidence 'witnessed' match the ingest's own values: the owner is
// logging in the moment; the surface stamps the clock.

export function eventRestPayload(record: MealCaptureRecord): Record<string, unknown> {
  return {
    id: record.id,
    pet_id: record.petId,
    event_type: 'meal',
    occurred_at: record.occurredAt,
    severity: null,
    notes: null,
    source: 'manual',
    occurred_at_source: 'now',
    occurred_at_confidence: 'witnessed',
    occurred_at_earliest: null,
    occurred_at_latest: null,
    deleted_at: null,
    created_at: record.createdAt,
    updated_at: record.createdAt,
    logged_via: record.loggedVia,
  };
}

export function mealRestPayload(record: MealCaptureRecord): Record<string, unknown> {
  return {
    id: record.mealId,
    event_id: record.id,
    pet_id: record.petId,
    food_item_id: record.foodItemId,
    // Assumed portion, unrated (spec §2.3/§3): a widget tap is never a
    // witnessed intake rating.
    quantity: 'unknown',
    is_full_portion: null,
    notes: null,
    created_at: record.createdAt,
    updated_at: record.createdAt,
    intake_rating: null,
    logged_via: record.loggedVia,
  };
}

// ── I/O seams ────────────────────────────────────────────────────────────────

export interface RestConfig {
  url: string;
  anonKey: string;
}

// Env-derived REST config. The env reads stay inline expressions (babel
// inlines EXPO_PUBLIC_* at bundle time — hoisting them into variables
// elsewhere would break the inlining); the parameters exist for tests. A
// missing/placeholder value must degrade to inbox-only — never throw the way
// lib/supabase.ts's import-time guard deliberately does in the app.
export function defaultRestConfig(
  url: string | undefined = process.env.EXPO_PUBLIC_SUPABASE_URL,
  anonKey: string | undefined = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
): RestConfig | null {
  if (!url || !anonKey || url.startsWith('your-supabase-')) return null;
  return { url, anonKey };
}

// Injectable seams so the intent flow is unit-testable end-to-end without a
// container, a keychain, or a network. Production callers pass nothing.
export interface CaptureDeps {
  writeInboxFile: (name: string, contents: string) => void;
  readSession: () => Promise<ExtensionSession | null>;
  fetchImpl: typeof fetch;
  restConfig: RestConfig | null;
  now: () => Date;
  newId: () => string;
}

function defaultWriteInboxFile(name: string, contents: string): void {
  const inbox = getCaptureInboxDirectory();
  if (!inbox) throw new Error('capture inbox unavailable (no App Group container)');
  // Overwrite-safe: the file is named by the record's own id, so a retry of
  // the same tap rewrites its own record, never duplicates it.
  new File(inbox, name).write(contents);
}

function defaultDeps(): CaptureDeps {
  return {
    writeInboxFile: defaultWriteInboxFile,
    readSession: () => getExtensionSession(),
    fetchImpl: fetch,
    restConfig: defaultRestConfig(),
    now: () => new Date(),
    newId: uuid,
  };
}

// ── The intent flow ──────────────────────────────────────────────────────────

export type DirectWriteOutcome = 'written' | 'skipped' | 'failed';

// Per-call overrides. `ids` + `occurredAt` exist for the W5 drain: the widget's
// JS context cannot write a file, so the tap is captured in the widget's own
// props and the APP replays it through these same intents — at which point the
// ids and the tap time must be the ones generated on the Home Screen, not fresh
// ones minted at drain time. That is what keeps the id-keyed idempotency (and
// the honest `occurred_at`) intact across the outbox hop.
export interface IntentOptions {
  loggedVia?: InboxLoggedVia;
  deps?: Partial<CaptureDeps>;
  /** Canonical row ids generated at tap time; defaults to freshly minted ones. */
  ids?: CaptureIds;
  /** The tap's own time; defaults to now. */
  occurredAt?: Date;
}

export interface IntentResult {
  /** The capture is durably in the inbox. false = the tap FAILED — surface it. */
  ok: boolean;
  record: CaptureRecord | null;
  /** The best-effort direct REST leg's outcome (informational only). */
  direct: DirectWriteOutcome;
}

// POST one row with ignore-duplicates upsert semantics. Events before meals
// (the FK), each awaited; a non-2xx on either leg fails the leg — the queue
// push repairs it later. return=minimal keeps the response empty (nothing to
// parse, nothing to leak into extension logs).
async function directRestWrite(
  record: MealCaptureRecord,
  session: ExtensionSession,
  config: RestConfig,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${session.accessToken}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=ignore-duplicates,return=minimal',
  };
  const post = async (table: 'events' | 'meals', payload: Record<string, unknown>) => {
    const res = await fetchImpl(`${config.url}/rest/v1/${table}?on_conflict=id`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    return res.ok;
  };
  if (!(await post('events', eventRestPayload(record)))) return false;
  return post('meals', mealRestPayload(record));
}

async function runCapture(
  record: CaptureRecord,
  deps: CaptureDeps,
): Promise<IntentResult> {
  // 1. Inbox first — the capture itself. A throw here IS the failed tap.
  try {
    deps.writeInboxFile(captureFileName(record), JSON.stringify(record));
  } catch (e) {
    console.warn('[widgetCapture] inbox write failed — tap NOT captured:', e);
    return { ok: false, record: null, direct: 'skipped' };
  }

  // 2. Direct REST, best-effort, meal/treat only. bowl_topup deliberately has
  // no direct leg: its apply is a guarded UPDATE against local-first LWW state
  // (feeding_arrangements.updated_at), which only the app-side ingest can
  // sequence correctly — a REST write from here could clobber a newer in-app
  // re-attest that hasn't synced yet.
  if (record.kind === 'bowl_topup') {
    return { ok: true, record, direct: 'skipped' };
  }
  if (!deps.restConfig) return { ok: true, record, direct: 'skipped' };
  try {
    const session = await deps.readSession();
    if (!session) return { ok: true, record, direct: 'skipped' };
    const written = await directRestWrite(record, session, deps.restConfig, deps.fetchImpl);
    return { ok: true, record, direct: written ? 'written' : 'failed' };
  } catch (e) {
    console.warn('[widgetCapture] direct REST write failed (inbox has the capture):', e);
    return { ok: true, record, direct: 'failed' };
  }
}

// LogMeal(pet, foodItem) — the slot argument from the spec's signature lives
// in resolution (it picks the food), not in the record (see module header).
export async function logMealIntent(
  petId: string,
  foodItemId: string,
  opts?: IntentOptions,
): Promise<IntentResult> {
  const deps = { ...defaultDeps(), ...opts?.deps };
  const record = buildMealCapture({
    petId,
    foodItemId,
    kind: 'meal',
    loggedVia: opts?.loggedVia ?? 'widget',
    now: opts?.occurredAt ?? deps.now(),
    ids: opts?.ids ?? { eventId: deps.newId(), mealId: deps.newId() },
  });
  return runCapture(record, deps);
}

// LogTreat(pet, foodItem) — a treat IS a meal event whose food is
// food_type='treat'; the kind only routes display, the write shape is shared.
export async function logTreatIntent(
  petId: string,
  foodItemId: string,
  opts?: IntentOptions,
): Promise<IntentResult> {
  const deps = { ...defaultDeps(), ...opts?.deps };
  const record = buildMealCapture({
    petId,
    foodItemId,
    kind: 'treat',
    loggedVia: opts?.loggedVia ?? 'widget',
    now: opts?.occurredAt ?? deps.now(),
    ids: opts?.ids ?? { eventId: deps.newId(), mealId: deps.newId() },
  });
  return runCapture(record, deps);
}

// TopUpBowl(pet) — the D6 arrangement event: re-attests the pet's active
// free-choice arrangement(s); never an intake claim, never an events row.
export async function topUpBowlIntent(
  petId: string,
  opts?: Omit<IntentOptions, 'ids'> & { id?: string },
): Promise<IntentResult> {
  const deps = { ...defaultDeps(), ...opts?.deps };
  const record = buildBowlTopUpCapture({
    petId,
    loggedVia: opts?.loggedVia ?? 'widget',
    now: opts?.occurredAt ?? deps.now(),
    id: opts?.id ?? deps.newId(),
  });
  return runCapture(record, deps);
}
