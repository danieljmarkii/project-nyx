import { supabase } from './supabase';
import { getDb } from './db';
import { getDeviceTimezone } from './profile';
// Type-only: erased at build, so this module stays free of the lucide/RN dependency
// constants/eventTypes.ts pulls in (lib/ask.ts is deliberately unit-testable offline).
import type { EventTypeKey } from '../constants/eventTypes';

// Ask — the client data layer (B-228, PR A5; requirements §3, §4, §9.3).
//
// This is the thin, PURE-where-possible half of the Ask client surface: the typed
// response contract (mirrored from the `ask` Edge Function — supabase/functions/ask/
// answer.ts, NOT imported because that's Deno/remote code), the single network call,
// the deterministic client-side suggested-chips generator (read straight from local
// SQLite, data-aware — §3.2), and the pure tap-through resolver the answer card uses
// to open a source view. Kept free of React/router imports so it's unit-testable
// offline (the store + screen own the stateful/navigational parts).
//
// SAFETY posture inherited from the server: the client never computes a number and
// never authors an answer. Every rendered numeral comes from `component`/`provenance`
// the server built from a tool result; the client only lays them out (§5.4). Suggested
// chips are QUESTIONS (never claims), seeded from which data the pet actually has, so a
// pet with no vomit history never sees a vomit chip.

// ── The typed response contract (mirror of the server's typed 200 bodies) ─────────

/** A typed component descriptor the client renders with EXISTING chart components
 *  (§5.4). The server builds `data` from a captured tool result, so every numeral is
 *  honest by construction; the server never returns markup. Today the server emits
 *  `spark` (weight series) and `ranked` (top foods / proteins / time-of-day bands);
 *  `pips` and `tiles` are in the contract for future tools and rendered defensively. */
export type AskComponentDescriptor =
  | { kind: 'pips'; data: unknown }
  | { kind: 'spark'; data: number[] }
  | { kind: 'ranked'; data: { label: string; count: number }[] }
  | { kind: 'tiles'; data: { label: string; value: string }[] };

/** A tap-through descriptor the client resolves to a filtered History/Patterns view
 *  or a single event's detail (D6 provenance interaction). */
export type AskTapThrough =
  | { kind: 'events'; eventIds: string[] }
  | { kind: 'filter'; symptomType?: string; window?: string };

export interface AskProvenance {
  /** The window the answer used, stated ("the last 7 days" / "all time"). */
  window: string | null;
  /** Owner-facing denominator/coverage line ("7 events · logging on 28 of 30 days"). */
  denominator: string | null;
  tapThrough: AskTapThrough | null;
}

/** The four-way plan contract's outcomes (§5.3). `answer`/`relayed_safety`/`general`
 *  are substantive (they committed the free conversation credit). */
export type AskOutcome =
  | 'answer'
  | 'relayed_safety'
  | 'general'
  | 'clinical_judgment'
  | 'reassurance_fishing'
  | 'unsupported'
  | 'ambiguous'
  | 'data_gap'
  | 'bulk_export'
  | 'llm_unavailable';

/** A successful answer body (the `success: true` shape). */
export interface AskAnswerBody {
  outcome: AskOutcome;
  substantive: boolean;
  headline: string;
  detail: string;
  component: AskComponentDescriptor | null;
  provenance: AskProvenance | null;
  /** A live engine SAFETY finding relayed verbatim, leading the answer (§7.2). Null
   *  when the engine is silent (silence never reassures). */
  safetyLead: string | null;
  /** The DETERMINISTIC, server-built recount of a photo read this answer featured (A8).
   *  The photo's clinical content is NEVER model prose — the model is redacted of the
   *  benign detail and this line (present-only, never "looks fine") carries the read, so
   *  the never-reassure-on-absence invariant is structural, not denylist-gated (§7.7).
   *  Null when no photo read was featured. Rendered as its own calm line in the card. */
  readLine: string | null;
  followups: string[];
  /** Whether THIS conversation has now committed its free credit — echoed back on the
   *  next request so a follow-up in the same conversation doesn't commit a second (D9). */
  conversationCredited: boolean;
  generalMode: boolean;
}

/** The cap-reached body (§9.3). `grain` = which counter tripped; `cap` = its period. */
export interface AskCapReached {
  cap_reached: true;
  grain: 'conversation' | 'message';
  cap: 'daily' | 'monthly';
  resets_at: string;
}

/** The feature-disabled body — the flag is off for this caller (fail-closed). */
export interface AskFeatureDisabled {
  feature_disabled: true;
}

export type AskResponse =
  | { ok: true; answer: AskAnswerBody }
  | { ok: true; capped: AskCapReached }
  | { ok: true; disabled: AskFeatureDisabled }
  // A transport/decode failure. The surface renders this as the same honest,
  // never-blank llm_unavailable deflection the server would — Ask is online-only, so a
  // network miss is an expected, designed state, never an error toast (§3.2).
  | { ok: false; error: string };

/** An in-session conversation turn sent to the stateless server (D8 — held in client
 *  memory, never persisted). An assistant turn carries `substantive` so the server can
 *  tell whether this conversation already committed its credit (D9). */
export interface AskTurn {
  role: 'user' | 'assistant';
  content: string;
  substantive?: boolean;
}

// ── The network call ──────────────────────────────────────────────────────────────

/** Ask a question over the pet's record. Passes the prior in-memory conversation so
 *  the server can serve follow-ups + honor the D9 credit rule without a transcript.
 *  Never throws: a transport error resolves to `{ ok: false }` (the online-only
 *  designed-offline state), and a cap/disabled body resolves to its typed branch. */
export async function askQuestion(params: {
  petId: string;
  question: string;
  conversation: AskTurn[];
}): Promise<AskResponse> {
  try {
    const { data, error } = await supabase.functions.invoke('ask', {
      // timezone: the DEVICE zone, so the server's trial "Day N" buckets by the same clock the
      // card does (B-443). null when the runtime can't resolve one → the server falls back to
      // the stored zone. Never guessed (getDeviceTimezone returns null, not UTC).
      body: {
        pet_id: params.petId,
        question: params.question,
        conversation: params.conversation,
        timezone: getDeviceTimezone(),
      },
    });
    if (error) return { ok: false, error: error.message };
    return parseAskResponse(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Discriminate the raw JSON body into the typed union. Exported for unit tests. A
 *  malformed/empty body falls to `{ ok:false }` — the surface degrades to the designed
 *  llm_unavailable state rather than rendering a half-parsed answer. */
export function parseAskResponse(data: unknown): AskResponse {
  if (!data || typeof data !== 'object') return { ok: false, error: 'empty response' };
  const d = data as Record<string, unknown>;
  if (d.feature_disabled === true) return { ok: true, disabled: { feature_disabled: true } };
  if (d.cap_reached === true) {
    const grain = d.grain === 'conversation' ? 'conversation' : 'message';
    const cap = d.cap === 'monthly' ? 'monthly' : 'daily';
    const resets_at = typeof d.resets_at === 'string' ? d.resets_at : '';
    return { ok: true, capped: { cap_reached: true, grain, cap, resets_at } };
  }
  if (typeof d.outcome === 'string' && typeof d.headline === 'string') {
    return { ok: true, answer: coerceAnswerBody(d) };
  }
  return { ok: false, error: 'unrecognized response' };
}

function coerceAnswerBody(d: Record<string, unknown>): AskAnswerBody {
  const followups = Array.isArray(d.followups)
    ? (d.followups as unknown[]).filter((f): f is string => typeof f === 'string')
    : [];
  return {
    outcome: d.outcome as AskOutcome,
    substantive: d.substantive === true,
    headline: typeof d.headline === 'string' ? d.headline : '',
    detail: typeof d.detail === 'string' ? d.detail : '',
    component: coerceComponent(d.component),
    provenance: coerceProvenance(d.provenance),
    safetyLead: typeof d.safetyLead === 'string' ? d.safetyLead : null,
    readLine: typeof d.readLine === 'string' ? d.readLine : null,
    followups,
    conversationCredited: d.conversationCredited === true,
    generalMode: d.generalMode === true,
  };
}

function coerceComponent(c: unknown): AskComponentDescriptor | null {
  if (!c || typeof c !== 'object') return null;
  const k = (c as { kind?: unknown }).kind;
  const data = (c as { data?: unknown }).data;
  if (k === 'spark' && Array.isArray(data) && data.every((n) => typeof n === 'number')) {
    return { kind: 'spark', data: data as number[] };
  }
  if (k === 'ranked' && Array.isArray(data)) {
    const rows = (data as unknown[])
      .filter((r): r is { label: unknown; count: unknown } => !!r && typeof r === 'object')
      .map((r) => ({ label: String((r as { label: unknown }).label ?? ''), count: Number((r as { count: unknown }).count) || 0 }));
    return rows.length ? { kind: 'ranked', data: rows } : null;
  }
  if (k === 'tiles' && Array.isArray(data)) {
    const rows = (data as unknown[])
      .filter((r): r is { label: unknown; value: unknown } => !!r && typeof r === 'object')
      .map((r) => ({ label: String((r as { label: unknown }).label ?? ''), value: String((r as { value: unknown }).value ?? '') }));
    return rows.length ? { kind: 'tiles', data: rows } : null;
  }
  if (k === 'pips') return { kind: 'pips', data };
  return null;
}

function coerceProvenance(p: unknown): AskProvenance | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  return {
    window: typeof o.window === 'string' ? o.window : null,
    denominator: typeof o.denominator === 'string' ? o.denominator : null,
    tapThrough: coerceTapThrough(o.tapThrough),
  };
}

function coerceTapThrough(t: unknown): AskTapThrough | null {
  if (!t || typeof t !== 'object') return null;
  const o = t as Record<string, unknown>;
  if (o.kind === 'events' && Array.isArray(o.eventIds)) {
    const ids = (o.eventIds as unknown[]).map(String).filter(Boolean);
    return ids.length ? { kind: 'events', eventIds: ids } : null;
  }
  if (o.kind === 'filter') {
    return {
      kind: 'filter',
      symptomType: typeof o.symptomType === 'string' ? o.symptomType : undefined,
      window: typeof o.window === 'string' ? o.window : undefined,
    };
  }
  return null;
}

// ── Tap-through resolution (pure — the screen does the router.push) ────────────────

/** A resolved navigation target the answer card hands to expo-router. */
export type AskNav =
  | { pathname: '/event/[id]'; params: { id: string } }
  | { pathname: '/insights/[metric]'; params: { metric: string } }
  | { pathname: '/insights' }
  // B-378 — the filtered History list a symptom count was drawn from. `window` is History's own
  // preset vocabulary (today/7d/30d); absent = all time. The screen adds a `ts` nonce at nav
  // time so the filter re-applies even when the History tab is already mounted.
  | { pathname: '/(tabs)/history'; params: { type: string; window?: string } };

// The symptom event_types that have a real `/insights/[metric]` detail screen (a
// symptom-count trend). count_symptom/time_of_day only parameterize over these
// (ASK_SYMPTOM_TYPES), so a symptom `filter` always resolves to a live Patterns detail.
const SYMPTOM_METRICS = new Set(['vomit', 'diarrhea', 'stool_normal', 'lethargy', 'itch', 'scratch', 'skin_reaction']);

// B-378 — the symptoms History can render as a `?type=` filter: the intersection of
// SYMPTOM_METRICS and the event types exposed in the History TypeScopeControl. `scratch` and
// `skin_reaction` are valid schema values with a Patterns detail but NO History filter chip, so
// they stay on the Patterns route. Typed EventTypeKey so a typo here fails the type-check
// rather than silently degrading to an unfiltered History list.
const HISTORY_SYMPTOM_TYPES = new Set<EventTypeKey>(['vomit', 'diarrhea', 'stool_normal', 'lethargy', 'itch']);

/** The History `?type=` value for an Ask symptom, or null when History has no filter for it. */
function historySymptomType(symptomType: string | undefined): EventTypeKey | null {
  return symptomType && (HISTORY_SYMPTOM_TYPES as ReadonlySet<string>).has(symptomType)
    ? (symptomType as EventTypeKey)
    : null;
}

/** The History `?window=` params for an Ask window History can represent EXACTLY, or null when
 *  it can't. 7d/30d map to their presets; 'all' maps to an all-time link (no window param); and
 *  14d / since_trial_start / an unstated window — which History has no exact preset for — return
 *  null so the caller keeps the window-agnostic Patterns route instead.
 *
 *  Exact-match-only is deliberate (pm-feature-review, B-378): widening to a superset (14d→30d,
 *  since_trial_start→all-time) would make the source list show MORE rows than the count it is
 *  meant to audit — "3 since the trial started" opening onto 15 all-time vomits — which is the
 *  G5 "Ask's number must never disagree with the Timeline's" red line surfacing at the UI. A
 *  window History can't reproduce exactly is better audited on Patterns, which makes no count
 *  promise. Returns `{}` (not `{ window: undefined }`) for all-time so the spread adds no key. */
function historyWindow(askWindow: string | undefined): { window?: string } | null {
  switch (askWindow) {
    case '7d': return { window: '7d' };
    case '30d': return { window: '30d' };
    case 'all': return {};      // all time — an exact match, expressed as a History link with no window
    default: return null;       // 14d / since_trial_start / unset → no exact History window
  }
}

/** Resolve a provenance tap-through to a navigation target, or null when nothing is
 *  linkable. A symptom `filter` History can render, WITH a window History can reproduce exactly,
 *  opens the FILTERED History list (B-378 — the mock's "Open in History", auditing the whole
 *  count at its source). A symptom History can't render (scratch/skin_reaction), OR a window it
 *  can't reproduce exactly (14d/since_trial_start), opens that symptom's Patterns detail — the
 *  window-agnostic view that makes no count promise, so the source can never contradict the
 *  count (G5). Any other filter opens the Patterns index. An `events` tap-through has no
 *  type/window to filter History by, so it opens the first (most-recent) event's detail — the
 *  honest available target. Pure, so the mapping is unit-testable and the "does this even go
 *  anywhere" decision stays out of the render path. */
export function resolveTapThrough(tp: AskTapThrough | null | undefined): AskNav | null {
  if (!tp) return null;
  if (tp.kind === 'events') {
    return tp.eventIds.length ? { pathname: '/event/[id]', params: { id: tp.eventIds[0] } } : null;
  }
  // filter
  const historyType = historySymptomType(tp.symptomType);
  const hw = historyType ? historyWindow(tp.window) : null;
  if (historyType && hw) {
    return { pathname: '/(tabs)/history', params: { type: historyType, ...hw } };
  }
  if (tp.symptomType && SYMPTOM_METRICS.has(tp.symptomType)) {
    return { pathname: '/insights/[metric]', params: { metric: tp.symptomType } };
  }
  return { pathname: '/insights' };
}

/** The owner-facing "go" label for a tap-through (mock §2 provenance row). The label MUST
 *  name where it actually lands (pm-feature-review: a mislabelled provenance link is the
 *  one interaction the feature's trust is built on). It opens the filtered History list — and
 *  reads "Open in History" — ONLY when `resolveTapThrough` would actually route there: a
 *  History-renderable symptom with a window History can reproduce exactly (B-378). Everything
 *  else that came from a filter opens Patterns. A single event opens the event; a several-event
 *  tap-through has no filtered route, so it opens the LATEST event and says so. Null when there's
 *  nowhere to go. */
export function tapThroughLabel(tp: AskTapThrough | null | undefined): string | null {
  if (!tp) return null;
  if (tp.kind === 'events') {
    if (tp.eventIds.length === 0) return null;
    return tp.eventIds.length === 1 ? 'Open the event' : 'Open the latest event';
  }
  if (historySymptomType(tp.symptomType) && historyWindow(tp.window)) return 'Open in History';
  return 'Open in Patterns';
}

/** The client-built deflection body for the online-only designed-offline / transport-
 *  failure state (§3.2). Copy is kept VERBATIM-IDENTICAL to the server's `llm_unavailable`
 *  deflection (supabase/functions/ask/answer.ts) so it reads the same whether the network
 *  dropped before the call or the model was unreachable during it — the owner can't tell
 *  the two apart. Non-substantive (no credit), no component/provenance/safety — an honest
 *  "couldn't answer it", never an error toast, never blank. The rundown follow-up is a real
 *  offline escape: the surface routes a rundown-intent send to /rundown (client-only, no
 *  model call), so this CTA works even with no connection (isRundownRequest). */
export function buildOfflineDeflection(petName: string): AskAnswerBody {
  const p = petName?.trim() || 'your pet';
  return {
    outcome: 'llm_unavailable',
    substantive: false,
    headline: `I couldn't answer that just now.`,
    detail: `${p}'s record is still all here. Try again in a moment, or open the vet-visit rundown — it works without a connection.`,
    component: null,
    provenance: null,
    safetyLead: null,
    readLine: null,
    followups: [RUNDOWN_CTA],
    conversationCredited: false,
    generalMode: false,
  };
}

// ── Rundown-intent interception (§3.3 / G3 — the deflection drives the wedge) ───────

/** The vet-visit-rundown CTA label the deflection follow-ups emit (server, answer.ts's
 *  buildDeflection) and the offline deflection above. Centralized here so the client can
 *  recognize a rundown-intent send and OPEN the deterministic rundown (client-only, §3.3)
 *  instead of round-tripping the model — which has no rundown tool and would deflect
 *  `unsupported`, dead-ending the CTA. Keep this string in sync with answer.ts. */
export const RUNDOWN_CTA = 'Put together a vet-visit rundown';

// The fresh-state accent chip's label (app/ask.tsx) — it already navigates directly, but
// matching it here too means every rundown affordance resolves the same way.
const FRESH_RUNDOWN_CTA = 'Heading to the vet? Build the visit rundown';

/** Is this send the app's own request to build the vet-visit rundown? True ONLY for the
 *  app-emitted rundown CTA strings — never an arbitrary owner question that merely contains
 *  "rundown" (e.g. "give me a rundown of her vomiting"), which must still reach the model.
 *  Pure; case/whitespace-insensitive. The surface uses this to navigate to /rundown so the
 *  rundown works offline and capped, and the deflection CTA never dead-ends (G3). */
export function isRundownRequest(text: string): boolean {
  const t = (text ?? '').trim().toLowerCase();
  return t === RUNDOWN_CTA.toLowerCase() || t === FRESH_RUNDOWN_CTA.toLowerCase();
}

// ── Cap-state helpers (§9.3 / §16.1) ───────────────────────────────────────────────

// The symptom/health vocabulary that makes a question "symptom-shaped" — so the cap
// band can drop its money-adjacent copy (no transaction word near a symptom, §16.1 #3).
// Deliberately broad on the side of caution: a false positive only means a plainer,
// safer cap message; a false negative would put a Premium line next to a symptom.
const SYMPTOM_SHAPED_RE =
  /\b(vomit\w*|throw\w* up|threw up|sick|nause\w*|diarrh\w*|loose stool|stool|poop\w*|blood\w*|letharg\w*|tired|seizure\w*|itch\w*|scratch\w*|rash|limp\w*|pain\w*|hurt\w*|unwell|not eating|won'?t eat|refus\w*|weight loss|losing weight|breath\w*|cough\w*|wheez\w*|swollen|swelling|foreign|chok\w*|collaps\w*)\b/i;

/** Is this question symptom/health-shaped? Drives the §16.1 #3 rule — a symptom-shaped
 *  attempt strips the Premium sentence + care-first line from the cap band. Pure. */
export function isSymptomShapedQuestion(text: string): boolean {
  return SYMPTOM_SHAPED_RE.test(text ?? '');
}

/** Human-friendly reset label for the cap band. Daily → "tomorrow"; monthly → the
 *  first-of-next-month date ("August 1"). Pure over the ISO `resetsAt` the server sent;
 *  a bad/empty value degrades to a safe generic phrase, never a crash or "Invalid Date". */
export function formatResetLabel(cap: 'daily' | 'monthly', resetsAt: string): string {
  if (cap === 'daily') return 'tomorrow';
  const ms = Date.parse(resetsAt);
  if (!Number.isFinite(ms)) return 'next month';
  return new Date(ms).toLocaleDateString([], { month: 'long', day: 'numeric' });
}

// ── Suggested chips — deterministic, seeded from THIS pet's local data (§3.2) ───────

export interface AskSuggestions {
  /** Total non-deleted events for the pet — 0 drives the designed empty-record state. */
  total: number;
  /** Up to ~4 suggested QUESTIONS (never claims), only for data the pet actually has. */
  chips: string[];
}

// Presence booleans read from local SQLite in one pass. `has*` reflect all-time
// presence (a chip is offered if the pet has ever logged that kind), matching the
// mock's "a pet with no vomit history never sees a vomit chip".
interface LocalPresence {
  total: number;
  hasVomit: boolean;
  hasStool: boolean; // diarrhea OR stool_normal
  hasMeal: boolean;
  hasWeight: boolean;
}

function readLocalPresence(petId: string): LocalPresence {
  try {
    const rows = getDb().getAllSync<{
      total: number;
      vomit: number;
      stool: number;
      meal: number;
      weight: number;
    }>(
      `SELECT COUNT(*) AS total,
              COUNT(CASE WHEN event_type = 'vomit' THEN 1 END) AS vomit,
              COUNT(CASE WHEN event_type IN ('diarrhea','stool_normal') THEN 1 END) AS stool,
              COUNT(CASE WHEN event_type = 'meal' THEN 1 END) AS meal,
              COUNT(CASE WHEN event_type = 'weight_check' THEN 1 END) AS weight
       FROM events WHERE pet_id = ? AND deleted_at IS NULL`,
      [petId],
    );
    const r = rows[0];
    return {
      total: r?.total ?? 0,
      hasVomit: (r?.vomit ?? 0) > 0,
      hasStool: (r?.stool ?? 0) > 0,
      hasMeal: (r?.meal ?? 0) > 0,
      hasWeight: (r?.weight ?? 0) > 0,
    };
  } catch {
    // Local DB unreadable — no chips (the input still works; empty ≠ error).
    return { total: 0, hasVomit: false, hasStool: false, hasMeal: false, hasWeight: false };
  }
}

/** Build the fresh-state suggested chips for a pet from its own logged data. Pure over
 *  the presence booleans (exported split so the query and the copy can be tested apart).
 *  Order = the mock's priority: appetite, last-vomit, weight, foods, stool — capped at
 *  four so the fresh state stays chips-first, never a wall. */
export function buildSuggestionChips(presence: LocalPresence, petName: string): string[] {
  const p = petName?.trim() || 'your pet';
  const chips: string[] = [];
  if (presence.hasMeal) chips.push(`How's ${p}'s appetite this month?`);
  if (presence.hasVomit) chips.push(`When did ${p} last vomit?`);
  if (presence.hasWeight) chips.push(`What's ${p}'s weight doing?`);
  if (presence.hasMeal) chips.push(`Which foods does ${p} actually finish?`);
  if (presence.hasStool) chips.push(`How often has ${p} had loose stool lately?`);
  return chips.slice(0, 4);
}

export function loadAskSuggestions(petId: string, petName: string): AskSuggestions {
  const presence = readLocalPresence(petId);
  return { total: presence.total, chips: buildSuggestionChips(presence, petName) };
}
