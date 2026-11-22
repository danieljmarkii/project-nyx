// The release-channel guard (CUL-2863, Workflow v2 PR-04; ruled L1 on CUL-2859).
//
// WHY. Until 2026-11-22 the PM's TestFlight build and the App Store build listened on
// ONE update channel, `production`, and every handoff told the PM to run
// `eas update --branch production`. After launch that command reaches every owner's
// phone, so a quick test update would ship to the public. The split: the PM's build
// is the `testflight` profile on the `testflight` channel; `production` receives only
// an update group the PM has already tested, republished by the one promote step in
// `docs/dev-handoff-runbook.md`.
//
// A split only holds while nothing tells a session or the PM to publish straight to
// `production`. Docs drift back (the old command sat in four places), so this guard
// reads every instruction surface and fails when:
//
//   (1) TARGET   — a file names production as an update destination
//                  (`--branch production`, `--channel production`,
//                  `--destination-branch production`, `--destination-channel
//                  production`, `channel:edit production`) outside the promote block.
//   (2) BLOCK    — the promote block is missing, duplicated, unterminated, or its
//                  markers appear in any file but the runbook (a second block would
//                  be a second door).
//   (3) PROFILE  — `eas.json` loses the `testflight` build profile, its channel, its
//                  store distribution or its submit profile, or any profile other
//                  than `production` reads the `production` channel.
//
// Out of scope, on purpose: dated records, which describe what was true when they
// were written and are never followed as instructions (`docs/sessions/`,
// `docs/research/` briefs, which are corrected additively per `.claude/rules/docs.md`,
// the frozen `docs/backlog.md`, `docs/CLAUDE-md-history.md`). `--profile production`
// is not a target: it cuts the App Store binary, which goes through review.
//
// Mutation proof (C-18): the self-tests below run the scanner over fixture roots
// outside the repo (`guards/fixtureRoot.ts`); the live scan was also proven by
// planting a `--branch production` line in a real doc and by deleting the profile.

import * as fs from 'fs';
import * as path from 'path';
import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';

const REPO_ROOT = path.resolve(__dirname, '..');

export const RUNBOOK_REL = 'docs/dev-handoff-runbook.md';
export const PROMOTE_START = '<!-- promote-step:start -->';
export const PROMOTE_END = '<!-- promote-step:end -->';

/** Single files read at the repo root. */
const ROOT_FILES = ['CLAUDE.md', 'STATUS.md', 'README.md', 'package.json', 'app.json', 'eas.json'];
/** Trees read recursively: every place a session or the PM takes a command from. */
const SCAN_DIRS = ['docs', '.claude', 'scripts', '.github', '.githooks', 'operating-kit'];
const SCAN_EXT = new Set(['.md', '.sh', '.ts', '.js', '.mjs', '.cjs', '.yml', '.yaml', '.json', '.txt', '.html', '']);
/** Dated records: true when written, never followed as instructions. */
const EXCLUDED = ['docs/sessions/', 'docs/research/', 'docs/backlog.md', 'docs/CLAUDE-md-history.md'];

// Production as the DESTINATION of an update. `=` or whitespace, optional quote.
const TARGET_PATTERNS: RegExp[] = [
  /--(?:destination-)?(?:branch|channel)(?:=|\s+)["']?production\b/,
  /\bchannel:(?:edit|rollout|delete|pause|resume)\s+["']?production\b/,
];

export interface Violation {
  file: string;
  line: number;
  kind: 'TARGET' | 'BLOCK';
  text: string;
}

export function listScanFiles(root: string): string[] {
  const out: string[] = [];
  for (const f of ROOT_FILES) if (fs.existsSync(path.join(root, f))) out.push(f);
  const walk = (rel: string): void => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const childRel = path.posix.join(rel, e.name);
      if (e.name === 'node_modules') continue;
      if (EXCLUDED.some((x) => (x.endsWith('/') ? `${childRel}/`.startsWith(x) : childRel === x))) continue;
      if (e.isDirectory()) walk(childRel);
      else if (e.isFile() && SCAN_EXT.has(path.extname(e.name))) out.push(childRel);
    }
  };
  for (const d of SCAN_DIRS) walk(d);
  return out.sort();
}

export function joinContinuations(lines: string[]): string[] {
  const out = [...lines];
  for (let i = 0; i < out.length; i++) {
    let j = i;
    while (/\\\s*$/.test(out[i]) && j + 1 < out.length) {
      j += 1;
      out[i] = `${out[i].replace(/\\\s*$/, ' ')}${out[j].trimStart()}`;
      out[j] = '';
    }
    i = j;
  }
  return out;
}

/** `root` is required: a default would re-point a self-test at the real tree (C-18). */
export function findViolations(root: string): Violation[] {
  const violations: Violation[] = [];
  let blocks = 0;
  for (const rel of listScanFiles(root)) {
    // A shell continuation (`\` then a newline) joins onto its line first, so a flag whose
    // value starts the next line is still one command. Line numbers stay those of the
    // line the command starts on, since the joined text is blanked from its tail lines.
    const lines = joinContinuations(fs.readFileSync(path.join(root, rel), 'utf8').split(/\r?\n/));
    let inBlock = false;
    lines.forEach((text, i) => {
      const line = i + 1;
      const hasStart = text.includes(PROMOTE_START);
      const hasEnd = text.includes(PROMOTE_END);
      if (hasStart || hasEnd) {
        if (rel !== RUNBOOK_REL) {
          violations.push({ file: rel, line, kind: 'BLOCK', text: 'promote marker outside the runbook' });
          return;
        }
        if (hasStart) {
          if (inBlock) violations.push({ file: rel, line, kind: 'BLOCK', text: 'nested promote start' });
          inBlock = true;
          blocks += 1;
        }
        if (hasEnd) {
          if (!inBlock) violations.push({ file: rel, line, kind: 'BLOCK', text: 'promote end without a start' });
          inBlock = false;
        }
        return;
      }
      if (inBlock) return;
      if (TARGET_PATTERNS.some((re) => re.test(text))) {
        violations.push({ file: rel, line, kind: 'TARGET', text: text.trim().slice(0, 160) });
      }
    });
    if (inBlock) violations.push({ file: rel, line: lines.length, kind: 'BLOCK', text: 'unterminated promote block' });
  }
  if (blocks !== 1) {
    violations.push({ file: RUNBOOK_REL, line: 0, kind: 'BLOCK', text: `expected exactly one promote block, found ${blocks}` });
  }
  return violations;
}

interface EasProfile {
  extends?: string;
  channel?: string;
  distribution?: string;
}

/** Resolves `extends` the way EAS does: the child's own keys win. */
function resolveProfile(build: Record<string, EasProfile>, name: string, seen: string[] = []): EasProfile {
  const own = build[name];
  if (!own) return {};
  if (!own.extends || seen.includes(name)) return own;
  return { ...resolveProfile(build, own.extends, [...seen, name]), ...own };
}

export function easProblems(easJson: string): string[] {
  const problems: string[] = [];
  const eas = JSON.parse(easJson) as { build?: Record<string, EasProfile>; submit?: Record<string, unknown> };
  const build = eas.build ?? {};
  if (!build.testflight) {
    problems.push('eas.json has no `testflight` build profile');
  } else {
    const tf = resolveProfile(build, 'testflight');
    if (tf.channel !== 'testflight') problems.push(`the testflight profile reads channel "${tf.channel}", not "testflight"`);
    // A store build is what TestFlight takes; EAS's default distribution is store.
    if ((tf.distribution ?? 'store') !== 'store') problems.push('the testflight profile is not store distribution');
  }
  if (!eas.submit || !('testflight' in eas.submit)) {
    problems.push('eas.json has no `submit.testflight` profile, so `--auto-submit` cannot upload the testflight build');
  }
  for (const name of Object.keys(build)) {
    if (name === 'production') continue;
    if (resolveProfile(build, name).channel === 'production') {
      problems.push(`build profile "${name}" reads the production channel; only the App Store build may`);
    }
  }
  return problems;
}

const fmt = (v: Violation[]): string => v.map((x) => `  ${x.kind}  ${x.file}:${x.line}  ${x.text}`).join('\n');

describe('release channel split (CUL-2863)', () => {
  it('the scan reads the real instruction surfaces', () => {
    const files = listScanFiles(REPO_ROOT);
    // A wrong root or a dropped tree would make every assertion below vacuous.
    expect(files).toContain(RUNBOOK_REL);
    expect(files).toContain('CLAUDE.md');
    expect(files).toContain('eas.json');
    expect(files.some((f) => f.startsWith('.claude/commands/'))).toBe(true);
    expect(files.some((f) => f.startsWith('.github/workflows/'))).toBe(true);
    expect(files.some((f) => f.startsWith('docs/sessions/'))).toBe(false);
    expect(files.length).toBeGreaterThan(100);
  });

  it('nothing targets the production channel outside the one promote step', () => {
    const v = findViolations(REPO_ROOT);
    if (v.length) {
      throw new Error(
        [
          'An update instruction targets the public `production` channel directly:',
          fmt(v),
          '',
          'Every owner’s phone reads `production`. Publish to `testflight` and test it,',
          'then promote that exact group with the one command in',
          `${RUNBOOK_REL} § Promote to the App Store channel. Do not add a second`,
          'promote block or exempt a file: the single block IS the rule.',
        ].join('\n'),
      );
    }
    expect(v).toEqual([]);
  });

  it('the promote block holds the republish command', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, RUNBOOK_REL), 'utf8');
    const block = src.slice(src.indexOf(PROMOTE_START), src.indexOf(PROMOTE_END));
    expect(block).toMatch(/eas update:republish --group <[^>]+> --destination-branch production/);
  });

  it('eas.json keeps the testflight profile and the production channel to itself', () => {
    expect(easProblems(fs.readFileSync(path.join(REPO_ROOT, 'eas.json'), 'utf8'))).toEqual([]);
  });

  describe('self-test over fixtures (C-18)', () => {
    let root: string;
    const OK_RUNBOOK = [
      '# runbook',
      'eas update --branch testflight --message "x"',
      PROMOTE_START,
      'eas update:republish --group <id> --destination-branch production',
      PROMOTE_END,
    ].join('\n');

    beforeEach(() => {
      root = createFixtureRoot('release-channel', ['docs', '.claude/commands']);
      writeFixture(root, RUNBOOK_REL, OK_RUNBOOK);
    });
    afterEach(() => removeFixtureRoot(root));

    it('is green on a compliant tree', () => {
      expect(findViolations(root)).toEqual([]);
    });

    it.each([
      ['eas update --branch production --message "x"'],
      ['eas update --branch=production'],
      ["eas update --channel 'production'"],
      ['eas update:republish --group abc --destination-channel production'],
      ['eas channel:edit production --branch testflight'],
      ['eas channel:edit production'],
      ['eas channel:rollout production --branch testflight --percent 100'],
    ])('reds on a direct target: %s', (cmd) => {
      writeFixture(root, '.claude/commands/handoff.md', `Run:\n${cmd}\n`);
      const v = findViolations(root);
      expect(v).toHaveLength(1);
      expect(v[0]).toMatchObject({ file: '.claude/commands/handoff.md', line: 2, kind: 'TARGET' });
    });

    it('reds on a destination wrapped onto the next line', () => {
      writeFixture(root, 'scripts/ship.sh', 'eas update:republish --group X \\\n  --destination-branch \\\n  production\n');
      expect(findViolations(root)).toMatchObject([{ file: 'scripts/ship.sh', line: 1, kind: 'TARGET' }]);
    });

    it('reds on a target in the runbook outside the block', () => {
      writeFixture(root, RUNBOOK_REL, `${OK_RUNBOOK}\neas update --branch production\n`);
      expect(findViolations(root).map((x) => x.kind)).toEqual(['TARGET']);
    });

    it('reds on a second promote block, and on a marker outside the runbook', () => {
      writeFixture(root, RUNBOOK_REL, `${OK_RUNBOOK}\n${PROMOTE_START}\neas update --branch production\n${PROMOTE_END}\n`);
      expect(findViolations(root).some((x) => x.text.includes('found 2'))).toBe(true);
      writeFixture(root, RUNBOOK_REL, OK_RUNBOOK);
      writeFixture(root, 'docs/other.md', `${PROMOTE_START}\neas update --branch production\n${PROMOTE_END}\n`);
      const kinds = findViolations(root).map((x) => `${x.kind}:${x.file}`);
      expect(kinds).toContain('BLOCK:docs/other.md');
      expect(kinds).toContain('TARGET:docs/other.md');
    });

    it('reds when the promote block is gone or unterminated', () => {
      writeFixture(root, RUNBOOK_REL, '# runbook\n');
      expect(findViolations(root).some((x) => x.text.includes('found 0'))).toBe(true);
      writeFixture(root, RUNBOOK_REL, `${PROMOTE_START}\neas update:republish --destination-branch production\n`);
      expect(findViolations(root).some((x) => x.text.includes('unterminated'))).toBe(true);
    });

    it('skips dated records and reads nothing else past them', () => {
      writeFixture(root, 'docs/sessions/2026-06-01-old.md', 'eas update --branch production\n');
      writeFixture(root, 'docs/research/2026-10-brief.md', 'eas update --branch production\n');
      expect(findViolations(root)).toEqual([]);
      writeFixture(root, 'docs/sessions-notes.md', 'eas update --branch production\n');
      expect(findViolations(root).map((x) => x.file)).toEqual(['docs/sessions-notes.md']);
    });

    it('does not flag the App Store binary build or the testflight channel', () => {
      writeFixture(
        root,
        'docs/guide.md',
        'eas build --platform ios --profile production --auto-submit\neas update --branch testflight\nproduction channel\n',
      );
      expect(findViolations(root)).toEqual([]);
    });
  });

  describe('easProblems self-test', () => {
    const real = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'eas.json'), 'utf8')) as {
      build: Record<string, Record<string, unknown>>;
      submit: Record<string, unknown>;
    };
    const variant = (mutate: (j: typeof real) => void): string => {
      const j = JSON.parse(JSON.stringify(real)) as typeof real;
      mutate(j);
      return JSON.stringify(j);
    };

    it('reds without the testflight profile', () => {
      expect(easProblems(variant((j) => delete j.build.testflight))).toEqual([
        'eas.json has no `testflight` build profile',
      ]);
    });

    it('reds when the testflight profile inherits the production channel', () => {
      const p = easProblems(variant((j) => delete j.build.testflight.channel));
      expect(p.some((x) => x.includes('channel "production"'))).toBe(true);
      expect(p.some((x) => x.includes('"testflight" reads the production channel'))).toBe(true);
    });

    it('reds on internal distribution, a missing submit profile, or another profile on production', () => {
      expect(easProblems(variant((j) => (j.build.testflight.distribution = 'internal')))).toEqual([
        'the testflight profile is not store distribution',
      ]);
      expect(easProblems(variant((j) => delete j.submit.testflight))).toHaveLength(1);
      expect(easProblems(variant((j) => (j.build.preview.channel = 'production')))).toEqual([
        'build profile "preview" reads the production channel; only the App Store build may',
      ]);
    });
  });
});
