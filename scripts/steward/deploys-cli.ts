// The I/O half of `deploys.ts` (CUL-1654): reads two trees out of the repository it
// runs in and prints which Edge Functions landing the second on the first would deploy.
//
// Usage (from the repository being checked; merge-check.sh is the caller):
//   node --experimental-strip-types deploys-cli.ts <base-tree-ish> <landed-tree-ish>
// Prints one line per deploying function, `<fn>\t<why>`, sorted; nothing when none.
// Exit 3 with a reason on stderr when it cannot tell, which the caller treats as
// deploying: an unanswered question is never a pass.

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { deploysBetween, heldIn, MANIFEST, ROOTS } from './deploys.ts';

type Fingerprints = Record<string, { fingerprint: string; unresolved: { from: string; spec: string }[] }>;

const git = (args: string[]) => execFileSync('git', ['-c', 'core.quotePath=false', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });

function present(tree: string): string[] {
  return ROOTS.filter((r) => git(['ls-tree', '--name-only', tree, '--', r]).trim() !== '');
}

function extract(tree: string, roots: string[], dir: string): void {
  const tar = execFileSync('git', ['archive', '--format=tar', tree, '--', ...roots], { maxBuffer: 1 << 28 });
  execFileSync('tar', ['-x', '-C', dir], { input: tar });
}

function readManifest(tree: string): string | null {
  try {
    return git(['show', `${tree}:${MANIFEST}`]);
  } catch {
    return null;
  }
}

async function fingerprintsOf(tree: string, scratch: string): Promise<Record<string, string>> {
  const roots = present(tree);
  if (!roots.includes('supabase/functions')) return {};
  const dir = fs.mkdtempSync(path.join(scratch, 'tree-'));
  extract(tree, roots, dir);
  // Imported here, not at the top: a tree with no functions (most fixture repos) never
  // needs the TypeScript parser the walker loads.
  const { fingerprintFunctions } = (await import('../edge-deploy/fingerprint.ts')) as {
    fingerprintFunctions: (root: string) => Fingerprints;
  };
  const prints = fingerprintFunctions(dir);
  const out: Record<string, string> = {};
  for (const [fn, p] of Object.entries(prints)) {
    if (p.unresolved.length > 0) {
      const u = p.unresolved[0];
      throw new Error(`${fn} imports ${u.spec} from ${u.from}, outside ${ROOTS.join(', ')} (grow ROOTS in scripts/steward/deploys.ts)`);
    }
    out[fn] = p.fingerprint;
  }
  return out;
}

async function main(): Promise<void> {
  const [baseTree, landedTree] = process.argv.slice(2);
  if (!baseTree || !landedTree) throw new Error('usage: deploys.ts <base-tree-ish> <landed-tree-ish>');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-check-deploys-'));
  try {
    const deploys = deploysBetween(
      await fingerprintsOf(baseTree, scratch),
      await fingerprintsOf(landedTree, scratch),
      heldIn(readManifest(baseTree)),
      heldIn(readManifest(landedTree)),
    );
    for (const d of deploys) process.stdout.write(`${d.fn}\t${d.why}\n`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main().catch((e: unknown) => {
    process.stderr.write(`deploys: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(3);
  });
