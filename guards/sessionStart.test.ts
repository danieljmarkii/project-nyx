// The cloud session's startup script installs the Deno CI runs (CUL-2700). A session that
// tests Edge Functions on another Deno than CI's can pass locally and red in CI, since
// `deno test` type-checks and a minor bump changes the checker (ci.yml says the same).

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('the session start script (CUL-2700)', () => {
  const script = read('.claude/hooks/session-start.sh');
  const ci = read('.github/workflows/ci.yml');

  it('pins the Deno version CI pins', () => {
    const ciVersion = /deno-version:\s*([\d.]+)/.exec(ci)?.[1];
    const ours = /^DENO_VERSION=([\d.]+)$/m.exec(script)?.[1];
    expect(ciVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(ours).toBe(ciVersion);
  });

  it('never fails the session on the install or the fetch', () => {
    expect(script).toMatch(/npm install -g "deno@\$\{DENO_VERSION\}"[^\n]*\|\| echo/);
    expect(script).toMatch(/git fetch --unshallow[^\n]*\|\| echo/);
  });
});
