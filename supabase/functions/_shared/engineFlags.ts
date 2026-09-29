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

// engines_v3_en0: seeded by migration 075 as {"enabled": false, "allowlist": []}, eligible
// for no one. Gates EN-0's vomit context and copy.
// engines_v3_en3: EN-3's server half and EN-7, which ship together (Engines v3 PR-26): the
// tier written beside every verdict, the tier-aware never-lower, and the stool spill-over
// fix. NOT SEEDED, on purpose: a missing row reads as off (above), so it needs no migration
// to stay dark, and Wave 4 turns on only after the real-vet review (CUL-1312). The PM's
// allowlist step inserts the row.
export const ENGINE_KEYS = ['engines_v3_en0', 'engines_v3_en3'] as const
export type EngineKey = typeof ENGINE_KEYS[number]

// The keys the SIGNAL engine (generate-signal) reads. Empty today: EN-0's key gates the
// per-incident read only. A Signal phase adds its key here in the PR that makes the Signal
// read it. The stand-down gate compares only these (standDownMintAllowed, below):
// a key the Signal never reads cannot change what it detects, so flipping it must not cost
// an owner a stand-down (adversarial review, PR-11a).
export const SIGNAL_ENGINE_KEYS: readonly EngineKey[] = []

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
