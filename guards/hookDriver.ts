// Runs a table of PreToolUse payloads through the CUL-1616 hook rules in ONE node
// process, the runtime the harness itself uses (`node --experimental-strip-types`),
// not jest's Babel. guards/productionGate.test.ts drives it twice over: once against
// `.claude/hooks/`, and once per mutant against a mutated copy in a temp root, which
// is why the hooks directory is an argument.
//
//   node --experimental-strip-types guards/hookDriver.ts <hooks dir>  < cases.json
//
// cases.json is `[{ hook: 'gate' | 'relay', input: <payload> }]`; stdout is one result
// per case: `{ decision, reason }`, `null` for no opinion, or `{ decision: 'threw' }`
// when a rule throws (the live hook would fail closed; the table must still see it).

import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

type HookIo = typeof import('../.claude/hooks/hookIo.ts');
type Gate = typeof import('../.claude/hooks/productionGate.ts');
type Relay = typeof import('../.claude/hooks/relayForm.ts');

type Case = { hook: 'gate' | 'relay'; input: unknown };
type Result = { decision: string; reason: string } | null;

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      raw += chunk;
    });
    process.stdin.on('end', () => resolve(raw));
    process.stdin.on('error', reject);
  });
}

async function main(): Promise<void> {
  const dir = path.resolve(process.argv[2] ?? '');
  const load = (file: string): Promise<unknown> => import(pathToFileURL(path.join(dir, file)).href);
  const io = (await load('hookIo.ts')) as HookIo;
  const gate = (await load('productionGate.ts')) as Gate;
  const relay = (await load('relayForm.ts')) as Relay;
  const cases = JSON.parse(await readStdin()) as Case[];
  const results: Result[] = cases.map((c) => {
    const decide = c.hook === 'gate' ? gate.decideGate : relay.decideRelay;
    try {
      return decide(io.toHookInput(c.input));
    } catch (e) {
      return { decision: 'threw', reason: String(e) };
    }
  });
  process.stdout.write(JSON.stringify(results));
}

main().catch((e: unknown) => {
  process.stderr.write(String(e));
  process.exit(1);
});
