// Supabase Edge Functions shared module — the Engines v3 rollout flag, read on the
// server (EN-F, CUL-1267; Engines v3 PR-11a).
//
// The engines run on the server, so their flag is resolved here, for the RECORD'S OWNER
// (`pets.user_id`), never for the caller: shared care may one day let a caregiver's
// request run an engine over someone else's pet, and the owner's rollout is what
// governs that pet's record. Every entry point that runs an engine resolves it the same
// way: analyze-vomit and analyze-stool (through _shared/incident-analysis.ts),
// generate-signal and generate-report.
//
// FAILS CLOSED, by its own read. `readGateConfig` in the per-incident pipeline and in
// generate-signal fails OPEN (a read error keeps the AI read and the phrasing on), which
// is right for a kill switch and wrong for a rollout: a missing row, a malformed value,
// a read error or a throw here all read as OFF, and `readOk` says which of those it was
// so a caller can refuse to act on an unknown state (generate-signal mints no stand-down
// on a failed read).
//
// Keys follow units that ship together (critique R-1). Each later phase adds its key to
// ENGINE_KEYS in its first PR, beside the migration that seeds it; `engine_flags` on
// every stamped row records whichever were on.

import { resolveAllowlistFlag } from './flags.ts'

// PURE: no remote import, so generate-report's pure layer (report.ts) can take EngineFlags
// as a type and the report-rendering scripts still type-check that graph with no network
// (ci.yml, Deno check (scripts)). The read itself is engineFlagsRead.ts.

// Seeded by migration 075 as {"enabled": false, "allowlist": []}: eligible for no one.
export const ENGINE_KEYS = ['engines_v3_en0'] as const
export type EngineKey = typeof ENGINE_KEYS[number]

export interface EngineFlags {
  // The keys resolved ON for this owner, sorted: the exact value every stamp records.
  on: EngineKey[]
  // False when the read did not answer (error, throw, no data). `on` is then empty.
  // A missing ROW is a successful read of an absent key: readOk stays true, the key off.
  readOk: boolean
}

// The pure resolution. `ownerUid` null (the owner is unknown) cannot match an
// allowlist, so every allowlist-gated key stays off.
export function resolveEngineFlags(
  result: { data: unknown; error: unknown },
  ownerUid: string | null,
): EngineFlags {
  if (result.error || !Array.isArray(result.data)) return { on: [], readOk: false }
  const byKey = new Map<string, unknown>()
  for (const row of result.data) {
    if (row && typeof row === 'object' && typeof (row as { key?: unknown }).key === 'string') {
      byKey.set((row as { key: string }).key, (row as { value?: unknown }).value)
    }
  }
  const on = ENGINE_KEYS
    .filter((key) => resolveAllowlistFlag(byKey.get(key), ownerUid, false))
    .slice()
    .sort()
  return { on, readOk: true }
}

export function isEngineKeyOn(flags: EngineFlags, key: EngineKey): boolean {
  return flags.on.includes(key)
}
