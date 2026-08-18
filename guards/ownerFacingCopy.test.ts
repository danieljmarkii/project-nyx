// The owner-facing-copy guard (B-477 / CUL-445).
//
// Why this file exists: B-399 (#470) found that the pet-photo-upload alert was
// one of FIFTEEN sites piping a raw provider string — `error.message`,
// `e.message`, or a `functions.invoke` transport message — straight into an
// `Alert` body or a screen error state. All 15 were fixed by authorship, but
// `lib/authErrors.ts` is standing evidence the class recurs (its own header
// documents the same bug for auth), and nothing structurally stopped the 16th.
// `nyx-voice` Ambiguity #1 had judged a copy guard "not obviously worth the
// maintenance now" — 15 sites is the evidence that changed.
//
// So this is a source-scan in the shape of `widgets/CulpritWidget.test.ts`: it
// parses every owner-facing screen/component with the TypeScript compiler and
// fails CI when
//
//   (1) LEAK  — a raw error string reaches an owner-facing sink: an
//       `Alert.alert(...)` argument, or a `set*Error*()` state setter, that
//       reads a display string off an error (`error.message`, `String(err)`,
//       `err.toString()`, a template interpolating one, a Postgres
//       `.details`/`.hint`/`.code`), or passes a bare error object straight
//       into an alert body. The sanctioned escape hatch is an
//       `authErrorCopy`-style mapper: `authErrorCopy(error, ctx).message` reads
//       `.message` off `copy`, not off an error, so it is NOT flagged — the
//       rule keys on the BASE being error-like, which is exactly what separates
//       `error.message` (leak) from `copy.message` (mapped copy). Storing a raw
//       error in state for mapping-at-render — `setFailureError(error)`, then
//       `isOffline(failureError)` — is also fine: the setter rule flags only the
//       extraction of a display STRING, never the storage of the error object.
//
//   (2) BANG  — an owner-facing string carries an exclamation mark, which
//       `nyx-voice` Pattern 4 forbids ("a CLAUDE.md copy standard, not a
//       stylistic preference"). Scanned app-wide across rendered copy: JSX text,
//       string children of a `<Text>`-family element, the display-copy JSX
//       attributes/object-properties (`label`, `title`, `message`, …), and
//       `Alert.alert` / `set*Error*` literal arguments.
//
//   (3) JARGON — a clinical term `nyx-voice` Pattern 5 says to translate at the
//       UI boundary (`emesis`, `anorexia`, `lethargy`, `coffee-ground`) appears
//       in owner-facing ERROR copy. Deliberately scoped to the error sinks, NOT
//       app-wide: the vet report (`app/report.tsx`) is a different audience and
//       uses clinical language on purpose (Pattern 5's own carve-out), so an
//       app-wide jargon scan would fight it.
//
// Escape hatch for a genuine false positive (a string this scan mis-reads as
// owner-facing): an inline `// copy-guard-ok: <reason>` on the finding's line or
// the line above suppresses it. The reason is required, so every exemption is a
// named decision, not a silent hole — the same discipline `LOCAL_WIPE_TABLES`
// and `NOT_WIPED_ON_SIGN_OUT` use.
//
// Known limit (documented, as the widget test documents its own): copy defined
// as a bare module constant and referenced by variable — `const M = 'x'; <Text>
// {M}</Text>` — is caught at its DECLARATION only if the declaration uses a
// copy-named property; a plain `const M = 'x!'` referenced elsewhere is a blind
// spot the render site can't see (it holds an identifier, not a literal). Zero
// such cases exist today; the guard covers every path B-399 actually leaked
// through. Widen it if that blind spot ever bites.

const ts = require('typescript') as typeof import('typescript');
const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

// ── scope ─────────────────────────────────────────────────────────────────────
// The issue names app/ + components/. We scan wider: genuine owner-facing
// `Alert.alert` sinks also live in lib/ (vetDocumentPickers, supportFallback)
// and hooks/ (useDailyRecapOffer) — the exact "16th site" the guard exists to
// stop — and constants/ holds copy maps. All are clean today; scanning them is
// free and closes the gap.
const SCAN_DIRS = ['app', 'components', 'lib', 'hooks', 'store', 'constants'];
const REPO_ROOT = path.resolve(__dirname, '..');

// ── detector primitives ───────────────────────────────────────────────────────

// SCREAMING_SNAKE_CASE is the copy-constant convention (CLAUDE.md § Code
// Conventions). `ADD_TRIAL_FOOD_ERROR` is sanctioned owner copy, not an error
// object — so an all-caps name is never an "error-like base".
const isScreamingSnake = (name: string) => /^[A-Z0-9_]+$/.test(name);
const isErrorishName = (name: string) =>
  !isScreamingSnake(name) &&
  (/(^|_)(e|err|error|ex|exception)$/i.test(name) || /(Error|Err|Exception)$/.test(name));

// An expression that resolves to an error value: a plain error identifier
// (`e` / `err` / `error` / `uploadError` …) or a `*.error` access (the Supabase
// `{ data, error }` shape — `result.error`, `data.error`).
function isErrorBase(node: import('typescript').Expression): boolean {
  if (ts.isIdentifier(node)) return isErrorishName(node.text);
  if (ts.isPropertyAccessExpression(node)) {
    if (node.name.text.toLowerCase() === 'error') return true;
    return isErrorBase(node.expression);
  }
  if (ts.isParenthesizedExpression(node)) return isErrorBase(node.expression);
  return false;
}

// Postgres/PostgREST error fields + JS Error fields. A read of one of these off
// an error base is a display-string extraction.
const ERROR_FIELDS = new Set(['message', 'stack', 'details', 'hint', 'code']);

// Does this expression EXTRACT a display string from an error? (`.message` on an
// error base, `String(err)`, `err.toString()`, or a template interpolating one.)
function extractsErrorString(node: import('typescript').Node): string | null {
  let hit: string | null = null;
  const sf = node.getSourceFile();
  const visit = (n: import('typescript').Node) => {
    if (hit) return;
    if (ts.isPropertyAccessExpression(n) && ERROR_FIELDS.has(n.name.text) && isErrorBase(n.expression)) {
      hit = `${n.expression.getText(sf)}.${n.name.text}`;
      return;
    }
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      if (ts.isIdentifier(callee) && callee.text === 'String' && n.arguments.some((a) => isErrorBase(a))) {
        hit = `String(${n.arguments[0]?.getText(sf)})`;
        return;
      }
      if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'toString' && isErrorBase(callee.expression)) {
        hit = `${callee.expression.getText(sf)}.toString()`;
        return;
      }
    }
    n.forEachChild(visit);
  };
  visit(node);
  return hit;
}

// A bare error object passed straight into an immediate-display sink.
function isBareError(node: import('typescript').Expression): boolean {
  return (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) && isErrorBase(node);
}

// Every literal text piece an expression would contribute to a rendered string —
// string literals, unsubstituted templates, and the fixed spans of a template
// literal (interpolations excluded; they are values, not copy).
function stringPieces(node: import('typescript').Node): string[] {
  const out: string[] = [];
  const visit = (n: import('typescript').Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text);
    else if (ts.isTemplateExpression(n)) {
      out.push(n.head.text);
      n.templateSpans.forEach((s) => out.push(s.literal.text));
    }
    n.forEachChild(visit);
  };
  visit(node);
  return out;
}

const isTextTag = (tag: string) => /(^|\.)[A-Za-z]*Text$/.test(tag) || tag === 'Text';

// Display-copy attribute / object-property names — string values here render to
// the owner (accessibilityLabel/Hint are spoken).
const COPY_KEYS = new Set([
  'label', 'title', 'subtitle', 'sub', 'caption', 'heading', 'header',
  'placeholder', 'emptyText', 'helperText', 'body', 'cta', 'description',
  'message', 'accessibilityLabel', 'accessibilityHint',
]);

const JARGON = [/\bemesis\b/i, /\banorexia\b/i, /\blethargic?\b/i, /coffee[-\s]?ground/i];
const jargonHit = (s: string) => JARGON.map((re) => s.match(re)?.[0]).find(Boolean) ?? null;

// ── scan ───────────────────────────────────────────────────────────────────────

type Kind = 'leak' | 'bang' | 'jargon';
type Finding = { file: string; line: number; kind: Kind; sink: string; detail: string };

function scanSource(relFile: string, src: string): Finding[] {
  const sf = ts.createSourceFile(relFile, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines = src.split('\n');
  const findings: Finding[] = [];

  const lineOf = (node: import('typescript').Node) =>
    sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  // `// copy-guard-ok: <reason>` on the finding line or the line above suppresses
  // it. The reason (a non-space char after the colon) is mandatory.
  const suppressed = (line: number) => {
    const ok = (n: number) => n >= 1 && n <= lines.length && /copy-guard-ok:\s*\S/.test(lines[n - 1]);
    return ok(line) || ok(line - 1);
  };
  const add = (node: import('typescript').Node, kind: Kind, sink: string, detail: string) => {
    const line = lineOf(node);
    if (!suppressed(line)) findings.push({ file: relFile, line, kind, sink, detail });
  };

  // A rendered owner-facing copy string → BANG (app-wide). Jargon is NOT checked
  // here; only in the error sinks below.
  const checkBang = (node: import('typescript').Node, sink: string) => {
    for (const piece of stringPieces(node)) {
      if (piece.includes('!')) add(node, 'bang', sink, `"${piece.trim()}" contains "!"`);
    }
  };
  // An owner-facing ERROR copy string → BANG + JARGON.
  const checkErrorCopy = (node: import('typescript').Node, sink: string) => {
    for (const piece of stringPieces(node)) {
      if (piece.includes('!')) add(node, 'bang', sink, `"${piece.trim()}" contains "!"`);
      const j = jargonHit(piece);
      if (j) add(node, 'jargon', sink, `"${piece.trim()}" uses clinical term "${j}" (translate at the UI boundary — nyx-voice Pattern 5)`);
    }
  };

  const walk = (node: import('typescript').Node) => {
    // ── error sinks ──────────────────────────────────────────────────────────
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const calleeText = callee.getText(sf);

      // Alert.alert(title, body) — immediate display; both args.
      if (calleeText === 'Alert.alert') {
        node.arguments.slice(0, 2).forEach((arg, i) => {
          const detail = extractsErrorString(arg);
          if (detail) add(arg, 'leak', `Alert.alert arg ${i + 1}`, `renders \`${detail}\` — a raw provider string`);
          else if (isBareError(arg)) add(arg, 'leak', `Alert.alert arg ${i + 1}`, `renders the bare error object \`${arg.getText(sf)}\``);
          checkErrorCopy(arg, `Alert.alert arg ${i + 1}`);
        });
      }

      // set*Error*(value) — stored error state. Flag only the extraction of a
      // display STRING (not the storage of an error object for later mapping).
      if (ts.isIdentifier(callee) && /^set/.test(callee.text) && /error/i.test(callee.text)) {
        const arg = node.arguments[0];
        if (arg) {
          const detail = extractsErrorString(arg);
          if (detail) add(arg, 'leak', `${callee.text}()`, `stores \`${detail}\` for display — a raw provider string`);
          checkErrorCopy(arg, `${callee.text}()`);
        }
      }
    }

    // ── app-wide rendered copy → BANG ─────────────────────────────────────────
    // JSX text between tags is only ever rendered inside a <Text> family element.
    if (ts.isJsxText(node) && node.text.trim() && node.text.includes('!')) {
      add(node, 'bang', 'JSX text', `"${node.text.trim()}" contains "!"`);
    }
    // Display-copy JSX attributes: label="…", accessibilityLabel={…}, …
    if (ts.isJsxAttribute(node) && node.name && COPY_KEYS.has(node.name.getText(sf)) && node.initializer) {
      checkBang(node.initializer, `<… ${node.name.getText(sf)}>`);
    }
    // Display-copy object properties: { label: '…', title: '…', … }
    if (ts.isPropertyAssignment(node)) {
      const key = node.name.getText(sf).replace(/['"]/g, '');
      if (COPY_KEYS.has(key)) checkBang(node.initializer, `{ ${key} }`);
    }
    // String children of a <Text>-family element via {…} (e.g. a ternary).
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      if (isTextTag(opening.tagName.getText(sf)) && ts.isJsxElement(node)) {
        for (const child of node.children) {
          if (ts.isJsxExpression(child) && child.expression) checkBang(child.expression, '<Text>{…}');
        }
      }
    }

    node.forEachChild(walk);
  };

  walk(sf);
  // De-dupe (a node can be reached by more than one rule).
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.file}:${f.line}:${f.kind}:${f.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTsFiles(p, out);
    // Skip test files and type-decl files — they hold banned words as data.
    else if (/\.tsx?$/.test(ent.name) && !/\.(test|spec|d)\.tsx?$/.test(ent.name)) out.push(p);
  }
  return out;
}

function scanTree(): Finding[] {
  const all: Finding[] = [];
  for (const dir of SCAN_DIRS) {
    const abs = path.join(REPO_ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of walkTsFiles(abs)) {
      all.push(...scanSource(path.relative(REPO_ROOT, file), fs.readFileSync(file, 'utf8')));
    }
  }
  return all;
}

function report(findings: Finding[], remedy: string): string {
  const lines = findings.map((f) => `  • ${f.file}:${f.line}  [${f.sink}]  ${f.detail}`);
  return `\n${findings.length} finding(s):\n${lines.join('\n')}\n\n${remedy}\n`;
}

// One scan for the whole suite.
const TREE = scanTree();

describe('B-477 — no raw provider string reaches an owner-facing sink', () => {
  it('every Alert.alert body and every error-state setter shows mapped copy, never a raw error', () => {
    const leaks = TREE.filter((f) => f.kind === 'leak');
    expect(
      leaks.length === 0 ||
        report(
          leaks,
          'Fix: route the error through an `authErrorCopy`-style mapper and show its\n' +
            'output (e.g. `const copy = authErrorCopy(error, ctx); Alert.alert(copy.title, copy.message)`),\n' +
            'and log the raw cause with `console.error` instead. A raw provider string is\n' +
            'unactionable dev-speak on an owner’s screen (B-399). For a genuine false\n' +
            'positive, add `// copy-guard-ok: <reason>` on the line.',
        ),
    ).toBe(true);
  });
});

describe('nyx-voice Pattern 4 — no exclamation marks in owner-facing copy', () => {
  it('no rendered owner-facing string carries a "!"', () => {
    const bangs = TREE.filter((f) => f.kind === 'bang');
    expect(
      bangs.length === 0 ||
        report(
          bangs,
          'Fix: remove the exclamation mark. Nyx does not shout — the register is calm\n' +
            'and quietly confident, including success states (nyx-voice Pattern 4, a\n' +
            'CLAUDE.md copy standard). For a genuine false positive, add\n' +
            '`// copy-guard-ok: <reason>` on the line.',
        ),
    ).toBe(true);
  });
});

describe('nyx-voice Pattern 5 — no clinical jargon in owner-facing error copy', () => {
  it('no Alert / error-state string uses an untranslated clinical term', () => {
    const jargon = TREE.filter((f) => f.kind === 'jargon');
    expect(
      jargon.length === 0 ||
        report(
          jargon,
          'Fix: use the plain-language label the owner knows ("vomiting", not "emesis").\n' +
            'Translate clinical terms at the UI boundary (nyx-voice Pattern 5). The vet\n' +
            'report is a separate audience and may keep clinical language.',
        ),
    ).toBe(true);
  });
});

// ── self-tests: prove the detector catches what it claims (and spares the
// sanctioned patterns) — the "red on a seeded leak" evidence, run against inline
// fixtures so it needs no real file to be dirty. ────────────────────────────────
describe('the detector itself', () => {
  const kinds = (src: string, kind: Kind) => scanSource('fixture.tsx', src).filter((f) => f.kind === kind).length;

  it('FLAGS a raw error string in an Alert body', () => {
    expect(kinds(`function f(){ Alert.alert('Upload failed', error.message); }`, 'leak')).toBe(1);
    expect(kinds(`function f(){ try {} catch (e) { Alert.alert('X', e.message); } }`, 'leak')).toBe(1);
    expect(kinds(`function f(){ Alert.alert('X', \`failed: \${error.message}\`); }`, 'leak')).toBe(1);
    expect(kinds(`function f(){ Alert.alert('X', String(err)); }`, 'leak')).toBe(1);
    expect(kinds(`function f(){ Alert.alert('X', err.toString()); }`, 'leak')).toBe(1);
    expect(kinds(`function f(){ Alert.alert('X', error); }`, 'leak')).toBe(1);
    expect(kinds(`function f(){ Alert.alert('X', result.error.message); }`, 'leak')).toBe(1);
    expect(kinds(`function f(){ Alert.alert('X', e.details); }`, 'leak')).toBe(1); // Postgres field
  });

  it('FLAGS a raw error string stored in an error-state setter', () => {
    expect(kinds(`function f(){ setLoadError(error.message); }`, 'leak')).toBe(1);
    expect(kinds(`function f(){ setLoadError(error?.message ?? 'Not found'); }`, 'leak')).toBe(1);
  });

  it('SPARES the authErrorCopy mapper output and the store-then-map pattern', () => {
    // copy.message reads off `copy`, not an error → not a leak.
    expect(kinds(`function f(){ const copy = authErrorCopy(error, 'login'); Alert.alert(copy.title, copy.message); }`, 'leak')).toBe(0);
    // A bare error stored in state for mapping-at-render is fine (forgot-password §5.6).
    expect(kinds(`function f(){ setFailureError(error); }`, 'leak')).toBe(0);
    // Literal branches, error used only as a boolean test.
    expect(kinds(`function f(){ setLoadError(error ? "Couldn't load this. Try again." : 'Not found'); }`, 'leak')).toBe(0);
    // A SCREAMING_SNAKE copy constant is copy, not an error.
    expect(kinds(`function f(){ Alert.alert('X', ADD_TRIAL_FOOD_ERROR); }`, 'leak')).toBe(0);
    // A non-error `.message` (a domain field) is not a leak.
    expect(kinds(`function f(){ Alert.alert('X', thread.message); }`, 'leak')).toBe(0);
    // Pure literal copy.
    expect(kinds(`function f(){ Alert.alert('Could not save', 'Try again in a moment.'); }`, 'leak')).toBe(0);
  });

  it('FLAGS an exclamation mark across the rendered-copy surfaces', () => {
    expect(kinds(`const C = () => <Text>Logged!</Text>;`, 'bang')).toBe(1);
    expect(kinds(`const C = () => <PrimaryButton label="Save it!" />;`, 'bang')).toBe(1);
    expect(kinds(`function f(){ Alert.alert('Done!', 'ok'); }`, 'bang')).toBe(1);
    expect(kinds(`const M = { title: 'Great job!' };`, 'bang')).toBe(1);
    expect(kinds(`const C = () => <Text>{done ? 'Nice!' : 'ok'}</Text>;`, 'bang')).toBe(1);
    expect(kinds(`function f(){ setLoadError('Boom!'); }`, 'bang')).toBe(1);
  });

  it('SPARES a "!" that is not owner-facing copy', () => {
    expect(kinds(`function f(){ if (!ready) return; }`, 'bang')).toBe(0); // logical not
    expect(kinds(`function f(){ console.error('upload failed!', e); }`, 'bang')).toBe(0); // dev log
    expect(kinds(`const x = arr!.length;`, 'bang')).toBe(0); // non-null assertion
    expect(kinds(`const C = () => <View testID="x!" />;`, 'bang')).toBe(0); // non-copy prop
  });

  it('FLAGS clinical jargon only in error copy, and SPARES the rendered app surface', () => {
    expect(kinds(`function f(){ Alert.alert('Reading failed', 'The emesis photo could not be read.'); }`, 'jargon')).toBe(1);
    expect(kinds(`function f(){ setLoadError('Anorexia read failed.'); }`, 'jargon')).toBe(1);
    // App-wide surface is not jargon-scanned (the vet report keeps clinical terms).
    expect(kinds(`const C = () => <Text>emesis</Text>;`, 'jargon')).toBe(0);
  });

  it('honours a reasoned // copy-guard-ok escape hatch', () => {
    expect(kinds(`function f(){ Alert.alert('X', error.message); // copy-guard-ok: legacy, tracked in CUL-999\n}`, 'leak')).toBe(0);
    expect(kinds(`function f(){\n  // copy-guard-ok: brand shout, PM-approved\n  Alert.alert('Welcome!', 'ok');\n}`, 'bang')).toBe(0);
  });

  it('an empty reason does NOT suppress (the hatch must be justified)', () => {
    expect(kinds(`function f(){ Alert.alert('X', error.message); // copy-guard-ok:\n}`, 'leak')).toBe(1);
  });
});

declare const __dirname: string;
