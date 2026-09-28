// Supabase Edge Functions shared module — THE ONE WRITER of every Engines v3 stamp
// (EN-F CUL-1267, EN-2 CUL-1132, CUL-1201 part 1, MFU-3; Engines v3 PR-11a).
//
// Migration 075 added the columns; this module builds every value that goes into them,
// and it is the only file under supabase/functions that may name them in a write.
// engineStamps.guard.test.ts fails the build on any other (proven by planting one).
// One writer is what makes the stamps one vocabulary: a second writer is a second
// derivation, and the day the two disagree the stamps stop telling reads apart.
//
// ────────────────────────────────────────────────────────────────────────────────
// THE RULE: A STAMP DESCRIBES THE WORDS ON THE ROW.
// ────────────────────────────────────────────────────────────────────────────────
//
// On event_ai_analysis there are two kinds of stamp:
//
//   READ stamps    photo_set_key, rule_version, engine_flags
//                  Which photos, which floor rules and which Engines keys produced the
//                  VERDICT and READ TEXT on the row. Written with every write of read
//                  words: the full upsert, the read-only update (an owner-edited row),
//                  the capped escalation, and the failure path's rescue.
//   PAYLOAD stamps model_id, prompt_hash
//                  Which model and prompt produced ai_raw_payload. Written only when
//                  ai_raw_payload is written, and NULL when it is written NULL (no model
//                  ran, or a partial read was collapsed). The read-only update leaves
//                  them describing the payload it also leaves.
//
// What writes NO stamp:
//   · A HOLD (resolveReanalysisWrite). The row keeps an escalation a calmer run could
//     not lower; its words are the earlier run's, so its stamps stay the earlier run's.
//     This is load-bearing for the rollback: a flag-off run that holds an EN-0
//     escalation must not relabel it as flag-off (075 §2b: flag-off code refuses to
//     lower an escalation whose engine_flags says it was written under a key).
//   · The failure write's `error-only` and `upsert` shapes, and the cap / disabled
//     STATE write. None of them writes words; the row's stamps keep describing the
//     words it holds.
//
// PRE-STAMP is `engine_flags IS NULL`: every write of words through this module sets it
// (to '{}' when every key is off). How to read the rest (adversarial review, PR-11a):
//   · photo_set_key is the photos PRESENT on the event when the words were written, not the
//     photos a model read: a capped escalation, a rescue and an unreadable photo are stamped
//     with the set too. That is the comparison PR-12 needs (were these words written over
//     these photos?), never "these photos were read". NULL beside a non-NULL engine_flags
//     means the event had no photo.
//   · model_id / prompt_hash describe ai_raw_payload and nothing else. They never credit the
//     read text: on the read-only update the words are this run's and the payload (and its
//     stamps) an earlier run's. A NULL model_id beside a non-NULL ai_raw_payload means that
//     payload predates the stamps (a pre-075 read that a later update wrote words over).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { EngineFlags } from './engineFlags.ts'
import { findingIdentity, type IdentifiableFinding } from '../../../lib/findingIdentity.ts'

// The framework half of every per-incident rule_version: the shared floor (the
// escalation ladder, the partial-read collapse, the hold, the rescue). Bump it with any
// change to _shared/incident-analysis.ts that changes which verdict a row gets. Each
// descriptor carries its own half (which findings become flags), bumped with its rules.
export const FRAMEWORK_RULE_VERSION = 'f1'

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

// A stable JSON: object keys sorted at every depth, so a fingerprint over a config
// object moves only when a value does, never with property order.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

// ── photo_set_key (CUL-1201 part 1) ───────────────────────────────────────────────
//
// The event's attachment ids, lowercased, sorted and comma-joined. Ids rather than a
// hash so the phone can compare the key against its own copy of the event's photos
// with no hash library (PR-12). Replacing a photo mints a new attachment id
// (lib/attachments.ts, B-105), so a replaced photo changes the key: a read whose key no
// longer matches the event's photos does not speak for them.
//
// The whole attachment set, not the first three the model is sent: a partial read is
// already handled honestly (B-203 collapses it), and a key over a subset would call
// every read of a four-photo event stale.
//
// Falls back to the SHA-256 of the sorted list (64 hex, no hyphen, so it can never be
// mistaken for a list of UUIDs) when an id is not id-shaped or the list passes 075's
// 4,000-character CHECK. Either way the value always passes the CHECK, so a stamp can
// never fail the write it rides on. Zero attachments → NULL.
const PHOTO_SET_KEY_MAX_CHARS = 4000
const ATTACHMENT_ID_SHAPE = /^[0-9a-f-]+$/

export async function photoSetKey(attachmentIds: readonly unknown[]): Promise<string | null> {
  if (attachmentIds.length === 0) return null
  const ids = attachmentIds.map((id) => (typeof id === 'string' ? id.toLowerCase() : String(id))).sort()
  const listable = ids.every((id) => id.length > 0 && ATTACHMENT_ID_SHAPE.test(id))
  const joined = ids.join(',')
  if (listable && joined.length <= PHOTO_SET_KEY_MAX_CHARS) return joined
  return await sha256Hex(JSON.stringify(ids))
}

// ── The per-incident stamps ─────────────────────────────────────────────────────────

export interface IncidentStamps {
  photoSetKey: string | null
  ruleVersion: string
  engineFlags: string[]
  modelId: string
  promptHash: string
}

// prompt_hash covers everything the model is told: the system prompt, the tool schema
// and the user turn. The model id is its own stamp (EN-2 measures the two apart).
export async function buildIncidentStamps(params: {
  attachmentIds: readonly unknown[]
  descriptorRuleVersion: string
  engineFlags: EngineFlags
  model: string
  systemPrompt: string
  tool: unknown
  userMessageText: string
}): Promise<IncidentStamps> {
  return {
    photoSetKey: await photoSetKey(params.attachmentIds),
    ruleVersion: `${FRAMEWORK_RULE_VERSION}.${params.descriptorRuleVersion}`,
    engineFlags: [...params.engineFlags.on].sort(),
    modelId: params.model,
    promptHash: await sha256Hex(canonicalJson([params.systemPrompt, params.tool, params.userMessageText])),
  }
}

// The read stamps plus, when this write carries ai_raw_payload, the payload stamps.
// Spread AFTER the write's own values, so nothing a descriptor put in its structured
// values can override a stamp (and the guard test forbids it naming one anyway).
export function stampIncidentWrite<W extends { mode: string; values: Record<string, unknown> }>(
  write: W,
  stamps: IncidentStamps,
): W {
  const values: Record<string, unknown> = {
    ...write.values,
    photo_set_key: stamps.photoSetKey,
    rule_version: stamps.ruleVersion,
    engine_flags: [...stamps.engineFlags],
  }
  if ('ai_raw_payload' in write.values) {
    const payloadWritten = write.values.ai_raw_payload !== null && write.values.ai_raw_payload !== undefined
    values.model_id = payloadWritten ? stamps.modelId : null
    values.prompt_hash = payloadWritten ? stamps.promptHash : null
  }
  return { ...write, values }
}

// ── The Signal's stamps (ai_signals) ────────────────────────────────────────────────

export function signalStampValues(engineFlags: EngineFlags, fingerprint: string): {
  engine_flags: string[]
  engine_fingerprint: string
} {
  return { engine_flags: [...engineFlags.on].sort(), engine_fingerprint: fingerprint }
}

// engine_fingerprint: a SHA-256 over what the caller says defines the engine that ran
// (generate-signal passes its ENGINE_VERSION, DEFAULT_CONFIG, the phrasing model and
// the flags). KNOWN BLIND SPOT, stated so it never reads as coverage: a code change that
// moves none of those inputs moves no fingerprint. Deriving it from the deployed
// bundle's closure fingerprint is CUL-1385.
export function engineFingerprint(parts: unknown): Promise<string> {
  return sha256Hex(canonicalJson(parts))
}

// May this run mint a stand-down against the prior cache row? Only when the prior row ran
// under the same SIGNAL keys as this run. A stand-down says a finding went away; across a
// change in a key the Signal engine reads, it may have gone because the ENGINE changed, and
// the owner would be told the pet changed (075 §4).
//
// ONLY the keys the Signal reads (`signalKeys`, SIGNAL_ENGINE_KEYS at the call site) are
// compared. A key it never reads cannot change what it detects, and withholding a mint is not
// free: the next regen's prior no longer holds the vanished card, so a withheld stand-down is
// lost for good, the wordless vanish CUL-786 exists to prevent (adversarial review, PR-11a).
// Likewise a flag read that did not answer blocks a mint only when the Signal reads a key.
// Required, never defaulted (C-37): the caller says which keys its engine reads.
//
// A PRE-STAMP prior (NULL) counts as every key off, deliberately. Before this code deployed
// no engine honoured any key, so every such row WAS written by the flag-off engine.
export function standDownMintAllowed(
  priorEngineFlags: unknown,
  current: EngineFlags,
  signalKeys: readonly string[],
): boolean {
  if (signalKeys.length === 0) return true
  if (!current.readOk) return false
  const prior = priorEngineFlags === null || priorEngineFlags === undefined ? [] : priorEngineFlags
  if (!Array.isArray(prior) || prior.some((k) => typeof k !== 'string')) return false
  const relevant = (keys: readonly string[]) => keys.filter((k) => signalKeys.includes(k)).sort()
  const a = relevant(prior as string[])
  const b = relevant(current.on)
  return a.length === b.length && a.every((k, i) => k === b[i])
}

// ── signal_shown_log (MFU-3) ────────────────────────────────────────────────────────
//
// One row per entry the Signal served on this run (findings and stood-down markers
// alike: both are lines the owner is shown). Identity from lib/findingIdentity.ts (the
// phone's foldIdentity, one derivation); a SHA-256 of the text, never the text.
//
// WRITTEN WITH THE SERVICE ROLE (CUL-1378, ruled at PR-11a's plan, 2026-09-27). The log
// exists to be trusted later (EN-9's rate at acknowledgement, EN-14's alert identity,
// evaluation), and its value is its history, which starts accruing the day this deploys.
// A row a client could have written can never be trusted after the fact. So the caller
// hands insertShownLog an admin client and a pet id it has ALREADY verified through the
// caller's own RLS-scoped read; the admin client does nothing else. 075's client INSERT
// policy and grant are then unused, and dropping them is a schema PR of their own
// (CUL-1384).
//
// text_hash stays an unsalted SHA-256 for now (075 §5: reversible by template
// enumeration, so data rights treat it as the text). The HMAC needs a server secret and
// rides CUL-1378.

export interface ShownEntry {
  text: string
  finding: IdentifiableFinding & { tier?: unknown }
}

const FINDING_TYPE_SHAPE = /^[a-z0-9_]{1,64}$/
const TIER_SHAPE = /^[a-z0-9_]{1,32}$/
const FINDING_KEY_MAX_CHARS = 200

export interface ShownLogRow {
  pet_id: string
  generated_at: string
  finding_type: string
  finding_key: string
  tier: string | null
  text_hash: string
  engine_fingerprint: string
  engine_flags: string[]
}

// Pure but for the hashing. An entry whose type does not fit 075's shape is skipped
// rather than sent: one malformed entry must not fail the batch and lose the run's
// other rows. A key past 075's 200 characters keeps its type prefix and hashes the rest,
// so it still names its type and stays one identity per finding.
export async function buildShownLogRows(params: {
  petId: string
  generatedAtIso: string
  entries: readonly ShownEntry[]
  engineFlags: EngineFlags
  fingerprint: string
}): Promise<ShownLogRow[]> {
  const rows: ShownLogRow[] = []
  for (const entry of params.entries) {
    const type = entry.finding?.type
    if (typeof type !== 'string' || !FINDING_TYPE_SHAPE.test(type)) continue
    let key = findingIdentity(entry.finding)
    if (key.length > FINDING_KEY_MAX_CHARS) key = `${type}:#${(await sha256Hex(key)).slice(0, 32)}`
    const tier = entry.finding.tier
    rows.push({
      pet_id: params.petId,
      generated_at: params.generatedAtIso,
      finding_type: type,
      finding_key: key,
      tier: typeof tier === 'string' && TIER_SHAPE.test(tier) ? tier : null,
      text_hash: await sha256Hex(typeof entry.text === 'string' ? entry.text : ''),
      engine_fingerprint: params.fingerprint,
      engine_flags: [...params.engineFlags.on].sort(),
    })
  }
  return rows
}

export async function insertShownLog(
  adminClient: SupabaseClient,
  rows: readonly ShownLogRow[],
): Promise<{ error: string | null }> {
  if (rows.length === 0) return { error: null }
  const { error } = await adminClient.from('signal_shown_log').insert([...rows])
  return { error: error ? error.message : null }
}
