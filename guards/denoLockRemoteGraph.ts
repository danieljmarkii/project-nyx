// The deno.lock remote-graph guard (CUL-421 / B-434) — the shared predicate.
//
// WHY THIS FILE EXISTS. CI caches the Edge Functions' module graph with plain
// `--lock=deno.lock`, deliberately NOT `--frozen`. Plain `--lock` verifies every
// remote file against its committed hash, so a `deno.land`/`esm.sh` URL whose
// content silently changed fails the build — that half is real, and was confirmed
// by corrupting a hash and watching `deno cache` exit 10 with an integrity error.
//
// What plain `--lock` does NOT do is refuse a remote import nobody reviewed. Adding
//   import { assertEquals } from "https://deno.land/std@0.221.0/assert/assert_equals.ts";
// to a suite and running the exact CI command exits 0 and silently ABSORBS seven new
// `remote` entries into the lockfile. The committed lock never gains them, so the new
// URL is pinned to whatever the CDN served that run and no human ever saw its hash.
// That is the gap this guard closes.
//
// WHY NOT JUST `--frozen`. `--frozen` closes the same gap in one flag, and it was the
// obvious fix — but Deno mirrors the root `package.json` into `deno.lock`'s `workspace`
// section, so `--frozen` also fails whenever an APP dependency moves without someone
// re-running Deno. Measured over 90 days of history: 14 commits changed the dependency
// set and only 2 carried a matching lockfile update, so `--frozen` would have red-ed the
// Edge Functions job on 12 of them — for haptics, fonts, notification scheduling, widget
// and settings work. The Edge Functions import ZERO `npm:` specifiers, so not one of
// those reds would have described a real problem with the code under test.
//
// That matters more than the inconvenience: CLAUDE.md § Git Workflow forbids "fixing" a
// red run by weakening the check, so a tripwire that fires monthly on the wrong axis is
// exactly the standing pressure that gets `--frozen` deleted again and this issue
// re-filed. Decoupling instead (the issue's option (b)) is not available — a root
// `deno.json`, a `deno.json` under `supabase/functions/`, `--node-modules-dir=none` and
// a nested `package.json` all still re-add the workspace section on Deno 2.9.4.
//
// So the guard is scoped to what the Edge Functions actually consume: everything in the
// lockfile EXCEPT the npm workspace mirror.
//
// WHY A DENYLIST OF ONE, NOT AN ALLOWLIST. `UNGUARDED_LOCK_SECTIONS` names the single
// section we deliberately do not police, and every other section — present or FUTURE —
// is guarded by default. An allowlist of `remote`/`jsr`/`specifiers` would silently
// ignore whatever key a later Deno release adds, which is the wrong default direction
// for a supply-chain check: a new section should have to argue its way OUT.
//
// WHAT IT DOES NOT CLAIM. It proves the lockfile's remote graph did not move during the
// run — not that the pinned URLs are trustworthy, and not that `deno.lock` is in step
// with `package.json` (it is deliberately blind to that, per above). Reviewing a NEW
// remote dependency is still review's job; this only guarantees the review is asked for.
//
// It also only sees the graph CI actually caches: the `find supabase/functions -name
// '*.test.ts'` set plus everything those transitively import. A module NO test reaches is
// outside that graph, so its remote imports are never written to the lockfile and this
// guard cannot see them — measured with `deno info` on 2026-08-31, that is
// `ask/index.ts` and `delete-account/index.ts`, 2 of 23 non-test modules. The blind spot
// belongs to the cached graph rather than to this guard (`--frozen` would share it
// exactly, on the same graph), and those two files are type-checked by nothing either,
// which is the larger half — tracked as CUL-782.

export const UNGUARDED_LOCK_SECTIONS: readonly string[] = ['workspace'];

/**
 * The floor the CLI applies to the COMMITTED lockfile before it trusts an empty diff.
 * Two files that both failed to load diff to nothing, and "no findings" would then read
 * as a pass over exactly the drift this exists to catch — so a baseline that parsed but
 * is implausibly small is treated as a load failure instead.
 *
 * It separates "did not load" (0 entries) from "loaded" — it is NOT a floor on how small
 * the module graph may legitimately get. The repo's lockfile currently holds 53 guarded
 * entries (47 remote + 3 redirects + jsr + specifiers + version), so this leaves ~5x
 * headroom: dropping a real dependency must never red the build through this door.
 * `guards/denoLockRemoteGraph.test.ts` asserts the real lockfile clears it, and both the
 * CLI and that test read THIS constant, so the two cannot drift apart.
 */
export const MIN_BASELINE_GUARDED_ENTRIES = 10;

/** Reported for a section whose value is a scalar (e.g. `version`) rather than a map. */
export const SCALAR_ENTRY_KEY = '(section value)';

export type SectionFinding = {
  section: string;
  added: string[];
  removed: string[];
  changed: string[];
};

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Order-insensitive serialisation, so a section that Deno re-emits with its keys in a
 * different order is not reported as a change. Only the CONTENT of an entry counts.
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isJsonObject(value)) {
    const body = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',');
    return `{${body}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Flatten one lockfile section to entry -> content. A map section (`remote`, `jsr`, …)
 * keys by its own entries; a scalar section (`version`) becomes a single synthetic
 * entry; an absent section is empty. Normalising all three shapes here is what lets the
 * diff below treat "section vanished" and "entries vanished" as the same finding.
 */
function sectionEntries(value: unknown): Map<string, string> {
  const entries = new Map<string, string>();
  if (value === undefined) return entries;
  if (isJsonObject(value)) {
    for (const key of Object.keys(value)) entries.set(key, stableStringify(value[key]));
    return entries;
  }
  entries.set(SCALAR_ENTRY_KEY, stableStringify(value));
  return entries;
}

function guardedSections(...locks: JsonObject[]): string[] {
  const names = new Set<string>();
  for (const lock of locks) for (const key of Object.keys(lock)) names.add(key);
  return [...names].filter((name) => !UNGUARDED_LOCK_SECTIONS.includes(name)).sort();
}

/**
 * Every guarded entry that differs between two parsed lockfiles. Empty means the run
 * changed nothing outside the npm workspace mirror.
 */
export function diffLockSections(before: unknown, after: unknown): SectionFinding[] {
  if (!isJsonObject(before) || !isJsonObject(after)) {
    throw new Error('deno.lock did not parse as a JSON object');
  }
  const findings: SectionFinding[] = [];
  for (const section of guardedSections(before, after)) {
    const a = sectionEntries(before[section]);
    const b = sectionEntries(after[section]);
    const added = [...b.keys()].filter((key) => !a.has(key)).sort();
    const removed = [...a.keys()].filter((key) => !b.has(key)).sort();
    const changed = [...a.keys()].filter((key) => b.has(key) && a.get(key) !== b.get(key)).sort();
    if (added.length || removed.length || changed.length) {
      findings.push({ section, added, removed, changed });
    }
  }
  return findings;
}

/**
 * How many guarded entries a lockfile holds. The CLI asserts this is non-trivial on the
 * baseline before trusting an empty diff: comparing two files that both failed to load
 * produces no findings and would otherwise read as a pass (the `textCount > 500` floor
 * `guards/geistRollout.test.ts` uses, for the same reason — an empty scan must never be
 * mistaken for a clean one).
 */
export function countGuardedEntries(lock: unknown): number {
  if (!isJsonObject(lock)) return 0;
  let total = 0;
  for (const section of guardedSections(lock)) total += sectionEntries(lock[section]).size;
  return total;
}
