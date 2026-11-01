// The AI lead's ONE door to the model (Vet report v2 PR-25, CUL-2305; CUL-2331 promises 2 and 3).
//
// Every byte the lead sends to a model leaves through `sendChecked`, and nowhere else in the
// function names the endpoint (guards: aiLead/storage.guard.test.ts, _shared/aiConsent.guard.test.ts).
//
// PROMISE 3, THE FINAL PAYLOAD IS THE ONE CHECKED. `sendChecked` takes the serialised request
// body, the exact string handed to fetch, and before sending it:
//   1. parses it back and finds the one user message inside the fixed envelope;
//   2. strips the role's fixed prompt wrapper (a code constant) and parses what is between;
//   3. runs `checkSummaryPayload` on that object (every key at every depth in the allowlist,
//      no owner-words key, nothing but plain JSON);
//   4. rebuilds the whole body from the role's constants and that object and requires it to be
//      BYTE-EQUAL to the string it was handed.
// Step 4 is what makes the check cover the prompt wrapper and the envelope: a body carrying any
// field, header-like key, extra message or extra text the constants do not produce fails it, so
// what passes is exactly constants plus an allowlisted object. The same string is then sent.
//
// PROMISE 2, ANTHROPIC ONLY. The URL is a constant; both roles' models are Anthropic ids from
// prompts.ts; the response must report the model asked for (fallbacks are off, spec §9.1, so a
// different served model is a failure, never a lead).
//
// THE GATE. `sendChecked` needs a `GateTicket`, which only `ticketFor` mints and only from a
// `runSummaryGate` result that allowed (consent under both scopes, both flags, the owner's pet,
// the cap). A ticket is checked at runtime against the set this module minted, so a cast cannot
// forge one.

import { fetchWithTimeout } from '../../_shared/http.ts'
import { checkSummaryPayload, type SummaryGate } from '../../_shared/reportSummaryGate.ts'
import { canonicalJson } from './facts.ts'
import {
  CHECKER_MODEL,
  CHECKER_PREFIX,
  CHECKER_SCHEMA,
  CHECKER_SUFFIX,
  CHECKER_SYSTEM,
  REPAIR_PREFIX,
  REPAIR_SUFFIX,
  WRITER_MODEL,
  WRITER_PREFIX,
  WRITER_SCHEMA,
  WRITER_SUFFIX,
  WRITER_SYSTEM,
} from './prompts.ts'

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

export type Role = 'writer' | 'repair' | 'checker'

interface RoleSpec {
  model: string
  system: string
  prefix: string
  suffix: string
  schema: unknown
  maxTokens: number
  effort: 'high' | 'medium'
}

const ROLES: Record<Role, RoleSpec> = {
  writer: { model: WRITER_MODEL, system: WRITER_SYSTEM, prefix: WRITER_PREFIX, suffix: WRITER_SUFFIX, schema: WRITER_SCHEMA, maxTokens: 16000, effort: 'high' },
  repair: { model: WRITER_MODEL, system: WRITER_SYSTEM, prefix: REPAIR_PREFIX, suffix: REPAIR_SUFFIX, schema: WRITER_SCHEMA, maxTokens: 16000, effort: 'high' },
  checker: { model: CHECKER_MODEL, system: CHECKER_SYSTEM, prefix: CHECKER_PREFIX, suffix: CHECKER_SUFFIX, schema: CHECKER_SCHEMA, maxTokens: 8000, effort: 'high' },
}

export function modelFor(role: Role): string {
  return ROLES[role].model
}

/** The request body for a role, as the exact string that is sent. Opus 5.5 and Sonnet 5.5 think
 *  adaptively (thinking cannot be turned off on Opus 5.5); effort is set explicitly because Opus
 *  5.5 defaults to medium. No `fallbacks`: the spec turns server-side fallback off. */
export function requestBody(role: Role, payload: object): string {
  const r = ROLES[role]
  return JSON.stringify({
    model: r.model,
    max_tokens: r.maxTokens,
    system: r.system,
    thinking: { type: 'adaptive' },
    output_config: { effort: r.effort, format: { type: 'json_schema', schema: r.schema } },
    messages: [{ role: 'user', content: `${r.prefix}${canonicalJson(payload)}${r.suffix}` }],
  })
}

export type Sendable = { ok: true; payload: Record<string, unknown> } | { ok: false; refused: string[] }

/** Steps 1 to 4 above, on the exact string. Pure; exported for its own tests. */
export function assertSendable(role: Role, body: string): Sendable {
  const r = ROLES[role]
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return { ok: false, refused: ['(body is not JSON)'] }
  }
  const messages = (parsed as { messages?: unknown })?.messages
  const content = Array.isArray(messages) && messages.length === 1 ? (messages[0] as { content?: unknown })?.content : undefined
  if (typeof content !== 'string' || !content.startsWith(r.prefix) || !content.endsWith(r.suffix) || content.length < r.prefix.length + r.suffix.length) {
    return { ok: false, refused: ['(envelope)'] }
  }
  let payload: unknown
  try {
    payload = JSON.parse(content.slice(r.prefix.length, content.length - r.suffix.length))
  } catch {
    return { ok: false, refused: ['(payload is not JSON)'] }
  }
  const check = checkSummaryPayload(payload)
  if (!check.ok) return { ok: false, refused: check.refused }
  if (requestBody(role, payload as object) !== body) return { ok: false, refused: ['(body differs from its rebuild)'] }
  return { ok: true, payload: payload as Record<string, unknown> }
}

declare const TICKET: unique symbol
export interface GateTicket {
  readonly [TICKET]: true
}

/** Every ticket this module minted. A ticket is checked at RUNTIME against this set, so `{} as
 *  GateTicket` from any other file is refused (rls-privacy-reviewer G1 on PR-25: a type-only brand
 *  can be forged with a cast). Weak, so a ticket lives no longer than the run holding it. */
const MINTED = new WeakSet<object>()

/** The only way to get a ticket: a gate result that allowed. */
export function ticketFor(gate: SummaryGate): GateTicket | null {
  return gate.allow === true ? mint() : null
}

function mint(): GateTicket {
  const t = Object.freeze({}) as GateTicket
  MINTED.add(t)
  return t
}

export type ModelResult =
  | { ok: true; servedModel: string; json: unknown }
  | { ok: false; reason: 'payload_refused' | 'no_key' | 'http_error' | 'timeout' | 'refusal' | 'truncated' | 'unparseable' | 'model_mismatch'; servedModel: string | null }

interface MessagesResponse {
  model?: unknown
  stop_reason?: unknown
  content?: Array<{ type?: unknown; text?: unknown }>
}

/** Sends one checked body. Never throws: every failure is a reason, and every reason means the
 *  lines print alone. `fetchImpl` and `apiKey` are injectable for tests only. */
export async function sendChecked(
  role: Role,
  body: string,
  ticket: GateTicket | null,
  opts: { timeoutMs: number; fetchImpl?: typeof fetch; apiKey?: string | null } ,
): Promise<ModelResult> {
  if (ticket === null || !MINTED.has(ticket)) return { ok: false, reason: 'payload_refused', servedModel: null }
  const sendable = assertSendable(role, body)
  if (!sendable.ok) {
    console.warn(`ai lead: ${role} payload refused at`, sendable.refused.join(', '))
    return { ok: false, reason: 'payload_refused', servedModel: null }
  }
  const key = opts.apiKey !== undefined ? opts.apiKey : Deno.env.get('ANTHROPIC_API_KEY') ?? null
  if (!key) return { ok: false, reason: 'no_key', servedModel: null }

  let res: Response
  try {
    res = await fetchWithTimeout(
      ANTHROPIC_MESSAGES_URL,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION }, body },
      opts.timeoutMs,
      opts.fetchImpl ?? fetch,
    )
  } catch (e) {
    const timedOut = e instanceof Error && /timed out/.test(e.message)
    return { ok: false, reason: timedOut ? 'timeout' : 'http_error', servedModel: null }
  }
  if (!res.ok) {
    // The body can echo the request; log the status only.
    console.warn(`ai lead: ${role} call returned HTTP ${res.status}`)
    return { ok: false, reason: 'http_error', servedModel: null }
  }
  let data: MessagesResponse
  try {
    data = (await res.json()) as MessagesResponse
  } catch {
    return { ok: false, reason: 'unparseable', servedModel: null }
  }
  const served = typeof data.model === 'string' ? data.model : null
  if (served !== ROLES[role].model) return { ok: false, reason: 'model_mismatch', servedModel: served }
  if (data.stop_reason === 'refusal') return { ok: false, reason: 'refusal', servedModel: served }
  if (data.stop_reason !== 'end_turn') return { ok: false, reason: 'truncated', servedModel: served }
  const text = (data.content ?? []).filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text as string).join('')
  try {
    return { ok: true, servedModel: served, json: JSON.parse(text) }
  } catch {
    return { ok: false, reason: 'unparseable', servedModel: served }
  }
}
