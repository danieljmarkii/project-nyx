// Static guard: the EXTENSION-SIDE modules must never (transitively) import
// the app-only graph. Metro bundles whole modules, so one careless import in
// lib/widgetCapture.ts or lib/widgetSession.ts ships SQLite/supabase/auth
// scaffolding into the widget extension bundle — the leak class the W4 code
// review caught twice by hand (captureRecord.ts and secureStoreTiers.ts exist
// because of it). This test walks the real import statements on disk so the
// third occurrence fails CI instead of needing a reviewer.

// Untyped requires — the app tsconfig carries no node types (the
// captureInbox.test.ts node:sqlite precedent).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');
declare const __dirname: string;

// The modules the W5 widget/intent wiring is allowed to import from.
const EXTENSION_ENTRY_MODULES = ['widgetCapture', 'widgetSession'];

// App-only module specifiers (lib-local names and package names) that must
// never appear anywhere in the extension bundle's transitive import graph.
const FORBIDDEN = [
  './db',
  './sync',
  './supabase',
  './signal',
  './secureStore', // drags authDebug — use ./secureStoreTiers instead
  './authDebug',
  './meals',
  './analytics',
  '@react-native-async-storage/async-storage',
  'expo-sqlite',
  '@supabase/supabase-js',
];

const LIB_DIR = __dirname;

// All static import specifiers of one lib module (side-effect, named, and
// type-only alike — type-only imports are erased at runtime, but keeping them
// off the app-only graph too means a later "make it a value import" edit can't
// silently start the leak).
function importSpecifiers(moduleName: string): string[] {
  const source = fs.readFileSync(path.join(LIB_DIR, `${moduleName}.ts`), 'utf8');
  const out: string[] = [];
  const re = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/g;
  for (let m = re.exec(source); m; m = re.exec(source)) out.push(m[1]);
  return out;
}

function transitiveLibImports(entry: string): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  const queue = [entry];
  while (queue.length > 0) {
    const mod = queue.pop()!;
    if (graph.has(mod)) continue;
    const specs = importSpecifiers(mod);
    graph.set(mod, specs);
    for (const spec of specs) {
      if (spec.startsWith('./')) queue.push(spec.slice(2));
    }
  }
  return graph;
}

describe.each(EXTENSION_ENTRY_MODULES)('extension bundle purity: lib/%s.ts', (entry) => {
  it('never transitively imports the app-only graph', () => {
    const graph = transitiveLibImports(entry);
    const violations: string[] = [];
    for (const [mod, specs] of graph) {
      for (const spec of specs) {
        if (FORBIDDEN.includes(spec)) violations.push(`lib/${mod}.ts imports '${spec}'`);
      }
    }
    expect(violations).toEqual([]);
  });
});
