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
//   (1) LEAK  — a raw error string reaches an owner-facing display sink: an
//       `Alert.alert(...)` argument, a `set*Error*()` state setter, a Snackbar
//       `.show({ message })`, a `<Text>` child, or a display-copy prop — that
//       reads a display string off an error (`error.message`, `String(err)`,
//       `err.toString()`, `(error as Error).message`, `error!.message`, a
//       template interpolating one, a Postgres `.details`/`.hint`/`.code`), or
//       passes a bare error object into an immediate-display sink. The rule keys
//       on the BASE being error-like, which is what separates `error.message`
//       (leak) from `authErrorCopy(error, ctx).message` (base `copy` — the
//       sanctioned mapper, `lib/authErrors.ts`), with no hard-coded allow-list.
//       It follows ONE hop of local indirection (`const msg = e.message;
//       Alert.alert('X', msg)`) and it does NOT flag a branch condition
//       (`e.code === 'ENOENT' ? 'lit' : 'lit'` shows only literals — the
//       `authErrors.ts` idiom). Storing a raw error for mapping-at-render —
//       `setFailureError(error)`, then `isOffline(failureError)` — is spared:
//       the setter rule flags only the extraction of a display STRING, never
//       the storage of the error object.
//
//   (2) BANG  — an owner-facing string carries an exclamation mark, which
//       `nyx-voice` Pattern 4 forbids. Scanned app-wide across rendered copy:
//       JSX text, string children of a `<Text>`-family element, the display-copy
//       JSX attributes/object-properties (`label`, `title`, `message`, …), and
//       the `Alert.alert` / `set*Error*` / Snackbar literal arguments.
//
//   (3) JARGON — a clinical term `nyx-voice` Pattern 5 says to translate
//       (`emesis`, `anorexia`, `lethargy`, `coffee-ground`) appears in
//       owner-facing ERROR copy. Deliberately scoped to the error sinks, NOT
//       app-wide: the vet report (`app/report.tsx`) is a different audience and
//       uses clinical language on purpose (Pattern 5's own carve-out).
//
// Escape hatch for a genuine false positive: an inline `// copy-guard-ok:
// <reason>` on the finding's line, the line above, or anywhere inside the
// enclosing statement suppresses it. The reason is required, so every exemption
// is a named decision, not a silent hole — the same discipline
// `LOCAL_WIPE_TABLES` / `NOT_WIPED_ON_SIGN_OUT` use.
//
// What it does NOT catch (documented, not implied): indirection deeper than one
// local hop — a raw message routed through a HELPER FUNCTION (`show(describe(e))`)
// or renamed across an unrelated variable name two hops out. A syntactic scan
// can't chase arbitrary data flow without a type-checker pass; this covers the
// direct, single-hop, cast, and template forms that every one of the 15 B-399
// sites (and the most natural refactors of them) actually took. Copy defined as
// a bare module constant and referenced by variable (`const M = 'x!'; <Text>{M}
// </Text>`) is the matching blind spot for the BANG check. Widen the scan if a
// real miss ever shows up.

const ts = require('typescript') as typeof import('typescript');
const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

type TSNode = import('typescript').Node;
type TSExpr = import('typescript').Expression;

// ── scope ─────────────────────────────────────────────────────────────────────
// The issue names app/ + components/. We scan wider: genuine owner-facing sinks
// also live in lib/ (vetDocumentPickers, supportFallback) and hooks/
// (useDailyRecapOffer) — the exact "16th site" the guard exists to stop — and
// constants/ holds copy maps. All are clean today; scanning them is free.
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

// Peel the wrappers that don't change the value: parentheses, `as` casts,
// `satisfies`, and the non-null `!`. `(error as Error).message` and
// `error!.message` are the shapes `strict: true` forces on a caught `unknown`.
function unwrap(node: TSExpr): TSExpr {
  let n: TSExpr = node;
  while (
    ts.isParenthesizedExpression(n) ||
    ts.isAsExpression(n) ||
    ts.isNonNullExpression(n) ||
    ts.isSatisfiesExpression(n) ||
    ts.isTypeAssertionExpression(n)
  ) {
    n = n.expression;
  }
  return n;
}

// An expression that resolves to an error value: a plain error identifier
// (`e` / `err` / `error` / `uploadError` …) or a `*.error` access (the Supabase
// `{ data, error }` shape — `result.error`, `data.error`).
function isErrorBase(node: TSExpr): boolean {
  const n = unwrap(node);
  if (ts.isIdentifier(n)) return isErrorishName(n.text);
  if (ts.isPropertyAccessExpression(n)) {
    if (n.name.text.toLowerCase() === 'error') return true;
    return isErrorBase(n.expression);
  }
  return false;
}

// Postgres/PostgREST error fields + JS Error fields. A read of one of these off
// an error base is a display-string extraction.
const ERROR_FIELDS = new Set(['message', 'stack', 'details', 'hint', 'code']);

const COMPARISON_OPS = new Set<number>([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.InstanceOfKeyword,
  ts.SyntaxKind.InKeyword,
]);

// Does this expression EXTRACT a display string from an error? Walks only the
// sub-expressions that actually contribute to the DISPLAYED value — it skips a
// ternary's condition and a comparison's operands (both yield booleans, never
// the shown string), so `e.code === 'x' ? 'lit' : 'lit'` is not a leak while
// `` `failed: ${e.message}` `` and `'x' + e.message` still are.
function extractsErrorString(node: TSNode): string | null {
  let hit: string | null = null;
  const sf = node.getSourceFile();
  const visit = (raw: TSNode) => {
    if (hit) return;
    const n = ts.isExpression(raw as TSExpr) ? unwrap(raw as TSExpr) : raw;

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
    // Selective recursion — only into what's displayed.
    if (ts.isConditionalExpression(n)) {
      visit(n.whenTrue);
      visit(n.whenFalse);
      return;
    }
    if (ts.isBinaryExpression(n) && COMPARISON_OPS.has(n.operatorToken.kind)) {
      return; // a boolean result; its operands are never the shown string
    }
    n.forEachChild(visit);
  };
  visit(node);
  return hit;
}

// A bare error object passed straight into an immediate-display sink.
function isBareError(node: TSExpr): boolean {
  const n = unwrap(node);
  return (ts.isIdentifier(n) || ts.isPropertyAccessExpression(n)) && isErrorBase(n);
}

// The enclosing function body (or the source file at module scope) — the scope a
// one-hop local resolution is allowed to search.
function enclosingScope(node: TSNode): TSNode {
  let p: TSNode | undefined = node.parent;
  while (p) {
    if (
      ts.isFunctionDeclaration(p) ||
      ts.isFunctionExpression(p) ||
      ts.isArrowFunction(p) ||
      ts.isMethodDeclaration(p)
    ) {
      return p.body ?? p;
    }
    if (ts.isSourceFile(p)) return p;
    p = p.parent;
  }
  return node.getSourceFile();
}

// Resolve `name` to its `const`/`let` initializer within the same scope — ONE
// hop, no chasing further identifiers. Catches `const msg = e.message; sink(msg)`.
function resolveLocalInit(name: string, from: TSNode): TSExpr | null {
  const scope = enclosingScope(from);
  let found: TSExpr | null = null;
  const visit = (n: TSNode) => {
    if (found) return;
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) {
      found = n.initializer;
      return;
    }
    n.forEachChild(visit);
  };
  scope.forEachChild(visit);
  return found;
}

// The leak verdict for one sink argument. `immediate` = the value is stringified
// for display right here (an alert body, a `<Text>` child), so a bare error
// object also leaks; a stored/props value is checked for extraction only.
function leakDetail(arg: TSExpr, immediate: boolean): string | null {
  const a = unwrap(arg);
  const direct = extractsErrorString(a);
  if (direct) return direct;
  if (immediate && isBareError(a)) return `the bare error object \`${a.getText(a.getSourceFile())}\``;
  if (ts.isIdentifier(a)) {
    const init = resolveLocalInit(a.text, a);
    if (init) {
      const viaInit = extractsErrorString(init);
      if (viaInit) return `${a.text} = ${viaInit}`;
      if (immediate && isBareError(init)) return `the bare error object via \`${a.text}\``;
    }
  }
  return null;
}

// Every literal text piece an expression would contribute to a rendered string.
function stringPieces(node: TSNode): string[] {
  const out: string[] = [];
  const visit = (n: TSNode) => {
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

const JARGON = [/\bemesis\b/i, /\banorexia\b/i, /\bletharg(y|ic)\b/i, /coffee[-\s]?ground/i];
const jargonHit = (s: string) => JARGON.map((re) => s.match(re)?.[0]).find(Boolean) ?? null;

// ── scan ───────────────────────────────────────────────────────────────────────

type Kind = 'leak' | 'bang' | 'jargon';
type Finding = { file: string; line: number; kind: Kind; sink: string; detail: string };

function scanSource(relFile: string, src: string): Finding[] {
  const sf = ts.createSourceFile(relFile, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines = src.split('\n');
  const findings: Finding[] = [];

  const lineOf = (node: TSNode) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  // `// copy-guard-ok: <reason>` (reason mandatory) on the finding line, the line
  // above, or anywhere inside the enclosing statement suppresses it.
  const hasToken = (n: number) => n >= 1 && n <= lines.length && /copy-guard-ok:\s*\S/.test(lines[n - 1]);
  const enclosingStmtStart = (node: TSNode): number => {
    let p: TSNode | undefined = node;
    while (p && !ts.isStatement(p)) p = p.parent;
    return p ? lineOf(p) : lineOf(node);
  };
  const suppressed = (node: TSNode, line: number) => {
    if (hasToken(line) || hasToken(line - 1)) return true;
    for (let n = enclosingStmtStart(node); n <= line; n++) if (hasToken(n)) return true;
    return false;
  };
  const add = (node: TSNode, kind: Kind, sink: string, detail: string) => {
    const line = lineOf(node);
    if (!suppressed(node, line)) findings.push({ file: relFile, line, kind, sink, detail });
  };

  // BANG only (app-wide rendered copy). Jargon is checked ONLY in the error sinks.
  const checkBang = (node: TSNode, sink: string) => {
    for (const piece of stringPieces(node)) {
      if (piece.includes('!')) add(node, 'bang', sink, `"${piece.trim()}" contains "!"`);
    }
  };
  // A displayed error-copy value: LEAK + BANG + JARGON.
  const checkErrorSink = (node: TSExpr, sink: string, immediate: boolean) => {
    const leak = leakDetail(node, immediate);
    if (leak) add(node, 'leak', sink, `${immediate ? 'renders' : 'stores'} \`${leak}\` — a raw provider string`);
    for (const piece of stringPieces(node)) {
      if (piece.includes('!')) add(node, 'bang', sink, `"${piece.trim()}" contains "!"`);
      const j = jargonHit(piece);
      if (j) add(node, 'jargon', sink, `"${piece.trim()}" uses clinical term "${j}" (translate at the UI boundary — nyx-voice Pattern 5)`);
    }
  };
  // A displayed value that is NOT error copy (a <Text> child, a copy prop): LEAK
  // (extraction only, or bare-error when immediate) + BANG. No jargon (app-wide
  // jargon fights the vet report's clinical register).
  const checkDisplay = (node: TSExpr, sink: string, immediate: boolean) => {
    const leak = leakDetail(node, immediate);
    if (leak) add(node, 'leak', sink, `${immediate ? 'renders' : 'passes'} \`${leak}\` — a raw provider string`);
    checkBang(node, sink);
  };

  const walk = (node: TSNode) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const calleeText = callee.getText(sf);

      // Alert.alert(title, body) — immediate display; both args.
      if (calleeText === 'Alert.alert') {
        node.arguments.slice(0, 2).forEach((arg, i) => checkErrorSink(arg, `Alert.alert arg ${i + 1}`, true));
      }

      // set*Error*(value) — stored error state (flag extraction, not storage).
      if (ts.isIdentifier(callee) && /^set/.test(callee.text) && /error/i.test(callee.text)) {
        const arg = node.arguments[0];
        if (arg) checkErrorSink(arg, `${callee.text}()`, false);
      }

      // Snackbar `*.show({ message, title, description })` — the root-mounted toast
      // sink (store/snackbarStore.ts), an owner-facing error surface like the setters.
      if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'show') {
        const arg0 = node.arguments[0] ? unwrap(node.arguments[0]) : undefined;
        if (arg0 && ts.isObjectLiteralExpression(arg0)) {
          for (const prop of arg0.properties) {
            if (ts.isPropertyAssignment(prop)) {
              const key = prop.name.getText(sf).replace(/['"]/g, '');
              if (key === 'message' || key === 'title' || key === 'description') {
                checkErrorSink(prop.initializer, `Snackbar .show({ ${key} })`, false);
              }
            }
          }
        }
      }
    }

    // Rendered copy → BANG (app-wide). JSX text is only ever inside a <Text> family.
    if (ts.isJsxText(node) && node.text.trim() && node.text.includes('!')) {
      add(node, 'bang', 'JSX text', `"${node.text.trim()}" contains "!"`);
    }
    // Display-copy JSX attributes: label="…", message={…}, accessibilityLabel={…}.
    if (ts.isJsxAttribute(node) && node.name && COPY_KEYS.has(node.name.getText(sf)) && node.initializer) {
      const init = node.initializer;
      const expr = ts.isJsxExpression(init) ? init.expression : init;
      if (expr) checkDisplay(expr, `<… ${node.name.getText(sf)}>`, false);
    }
    // Display-copy object properties: { label: '…', title: '…' } — BANG only
    // (an object literal is data; error-copy leaks come via the sinks above).
    if (ts.isPropertyAssignment(node)) {
      const key = node.name.getText(sf).replace(/['"]/g, '');
      if (COPY_KEYS.has(key)) checkBang(node.initializer, `{ ${key} }`);
    }
    // Children of a <Text>-family element via {…}. Extraction-only (immediate=false,
    // so no bare-error rule): a raw Error OBJECT as a Text child crashes RN
    // ("Objects are not valid as a React child"), so a bare `{error}` here is
    // always a mapped error-message STRING (state named `error`/`loadError`), which
    // is the correct pattern — only `{error.message}` is a real leak.
    if (ts.isJsxElement(node) && isTextTag(node.openingElement.tagName.getText(sf))) {
      for (const child of node.children) {
        if (ts.isJsxExpression(child) && child.expression) checkDisplay(child.expression, '<Text>{…}', false);
      }
    }

    node.forEachChild(walk);
  };

  walk(sf);
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
  it('every alert / error-state / Snackbar / <Text> shows mapped copy, never a raw error', () => {
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
  it('no Alert / error-state / Snackbar string uses an untranslated clinical term', () => {
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
// sanctioned patterns). These are the "state the counterexample you tried"
// evidence, run against inline fixtures via the real `scanSource`. ───────────────
describe('the detector itself', () => {
  const kinds = (src: string, kind: Kind) => scanSource('fixture.tsx', src).filter((f) => f.kind === kind).length;

  it('FLAGS a raw error string in an Alert body', () => {
    expect(kinds(`function f(){ Alert.alert('Upload failed', error.message); }`, 'leak')).toBe(1);
    expect(kinds(`function f(){ try {} catch (e) { Alert.alert('X', e.message); } }`, 'leak')).toBe(1);
    expect(kinds(`function f(){ Alert.alert('X', \`failed: \${error.message}\`); }`, 'leak')).toBe(1);
    expect(kinds(`function f(){ Alert.alert('X', 'cause: ' + error.message); }`, 'leak')).toBe(1);
    expect(kinds(`function f(){ Alert.alert('X', String(err)); }`, 'leak')).toBe(1);
    expect(kinds(`function f(){ Alert.alert('X', err.toString()); }`, 'leak')).toBe(1);
    expect(kinds(`function f(){ Alert.alert('X', error); }`, 'leak')).toBe(1);
    expect(kinds(`function f(){ Alert.alert('X', result.error.message); }`, 'leak')).toBe(1);
    expect(kinds(`function f(){ Alert.alert('X', e.details); }`, 'leak')).toBe(1); // Postgres field
  });

  it('FLAGS the strict-mode cast/non-null idioms (the codebase default under strict)', () => {
    expect(kinds(`function f(){ Alert.alert('X', (error as Error).message); }`, 'leak')).toBe(1);
    expect(kinds(`function f(){ Alert.alert('X', error!.message); }`, 'leak')).toBe(1);
    expect(kinds(`function f(){ Alert.alert('X', e instanceof Error ? e.message : String(e)); }`, 'leak')).toBe(1);
  });

  it('FLAGS one hop of local indirection', () => {
    expect(kinds(`function f(){ const msg = error.message; Alert.alert('Failed', msg); }`, 'leak')).toBe(1);
    expect(kinds(`function f(){ const s = String(e); setLoadError(s); }`, 'leak')).toBe(1);
  });

  it('FLAGS a raw error string stored in an error-state setter', () => {
    expect(kinds(`function f(){ setLoadError(error.message); }`, 'leak')).toBe(1);
    expect(kinds(`function f(){ setLoadError(error?.message ?? 'Not found'); }`, 'leak')).toBe(1);
  });

  it('FLAGS a raw error reaching the Snackbar, a <Text> child, or a copy prop', () => {
    expect(kinds(`function f(){ useSnackbarStore.getState().show({ message: error.message }); }`, 'leak')).toBe(1);
    expect(kinds(`const C = () => <Text>{error.message}</Text>;`, 'leak')).toBe(1);
    expect(kinds(`const C = () => <Banner message={error.message} />;`, 'leak')).toBe(1);
  });

  it('SPARES the authErrorCopy mapper output and the store-then-map pattern', () => {
    expect(kinds(`function f(){ const copy = authErrorCopy(error, 'login'); Alert.alert(copy.title, copy.message); }`, 'leak')).toBe(0);
    expect(kinds(`function f(){ setFailureError(error); }`, 'leak')).toBe(0); // stored for mapping-at-render
    expect(kinds(`function f(){ setLoadError(error ? "Couldn't load this. Try again." : 'Not found'); }`, 'leak')).toBe(0);
    expect(kinds(`function f(){ Alert.alert('X', ADD_TRIAL_FOOD_ERROR); }`, 'leak')).toBe(0); // copy constant
    expect(kinds(`function f(){ Alert.alert('X', thread.message); }`, 'leak')).toBe(0); // non-error .message
    expect(kinds(`function f(){ Alert.alert('Could not save', 'Try again in a moment.'); }`, 'leak')).toBe(0);
    // A bare `{error}` / message={error} is a mapped error-message STRING (state
    // named `error`/`loadError`); a raw Error OBJECT there would crash RN. Only
    // `.message` extraction is a leak — the bare render is spared (TextField.tsx,
    // both detail screens' load state render exactly this on real copy strings).
    expect(kinds(`const C = () => <Text>{error}</Text>;`, 'leak')).toBe(0);
    expect(kinds(`const C = () => <Text>{loadError}</Text>;`, 'leak')).toBe(0);
    expect(kinds(`const C = () => <Banner message={error} />;`, 'leak')).toBe(0);
  });

  it('SPARES a branch-on-error-code whose branches are both literal copy (the authErrors idiom)', () => {
    expect(kinds(`function f(){ Alert.alert('Failed', error.code === 'ENOENT' ? 'File not found. Try again.' : 'Something went wrong.'); }`, 'leak')).toBe(0);
    expect(kinds(`function f(){ setLoadError(e.message.includes('network') ? 'You are offline.' : 'Try again.'); }`, 'leak')).toBe(0);
    // …but the SAME branch that displays the raw message in one arm is still caught.
    expect(kinds(`function f(){ Alert.alert('Failed', error.code === 'X' ? error.message : 'ok'); }`, 'leak')).toBe(1);
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
    expect(kinds(`function f(){ setLoadError('Lethargy read failed.'); }`, 'jargon')).toBe(1); // the real Nyx vocabulary
    expect(kinds(`const C = () => <Text>emesis</Text>;`, 'jargon')).toBe(0); // app-wide surface not jargon-scanned
  });

  it('honours a reasoned // copy-guard-ok escape hatch, including multi-line calls', () => {
    expect(kinds(`function f(){ Alert.alert('X', error.message); // copy-guard-ok: legacy, tracked in CUL-999\n}`, 'leak')).toBe(0);
    expect(kinds(`function f(){\n  // copy-guard-ok: brand shout, PM-approved\n  Alert.alert('Welcome!', 'ok');\n}`, 'bang')).toBe(0);
    // token on the opening line of a multi-line call still suppresses the arg finding.
    expect(kinds(`function f(){\n  Alert.alert( // copy-guard-ok: legacy\n    'X',\n    error.message,\n  );\n}`, 'leak')).toBe(0);
  });

  it('an empty reason does NOT suppress (the hatch must be justified)', () => {
    expect(kinds(`function f(){ Alert.alert('X', error.message); // copy-guard-ok:\n}`, 'leak')).toBe(1);
  });
});

// Characterization of the documented limits — NOT aspirational. These record
// what the syntactic scan deliberately does not chase, so a future reader knows
// the boundary is known, not accidental (see the file header).
describe('documented limits (characterization, not a guarantee)', () => {
  const leaks = (src: string) => scanSource('fixture.tsx', src).filter((f) => f.kind === 'leak').length;

  it('does NOT chase a raw message through a helper function (deeper than one hop)', () => {
    expect(leaks(`function f(){ Alert.alert('X', describeError(error)); }`)).toBe(0);
  });
  it('does NOT chase indirection two locals deep', () => {
    expect(leaks(`function f(){ const a = error.message; const b = a; Alert.alert('X', b); }`)).toBe(0);
  });
});

declare const __dirname: string;
