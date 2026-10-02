// Source-scan helpers for the guard tests under supabase/functions (moved out of
// incident-analysis.test.ts for the Engines v3 one-writer guard, PR-11a). Test-only: no
// deployed function imports this file.

// Every non-test .ts file under `dir`, recursively.
export async function* sourceFiles(dir: URL): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(dir)) {
    const child = new URL(entry.name + (entry.isDirectory ? '/' : ''), dir)
    if (entry.isDirectory) yield* sourceFiles(child)
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('_test.ts')) yield child
  }
}

// Comments blanked, newlines kept, in ONE left-to-right pass that tracks string literals,
// so a `//` inside a string is not a comment (C-18's single-pass rule). Strings are KEPT:
// a table name the scans look for is one. Known limit: a template literal is treated as a
// flat string (a nested backtick inside `${}` ends it early), and regex literals are not
// parsed, so a `//` inside one reads as a comment start.
export function blankComments(src: string): string {
  let out = ''
  let i = 0
  let quote: string | null = null
  while (i < src.length) {
    const c = src[i]
    if (quote) {
      out += c
      if (c === '\\') { out += src[i + 1] ?? ''; i += 2; continue }
      if (c === quote) quote = null
      i++
      continue
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; out += c; i++; continue }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++ }
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end < 0 ? src.length : end + 2
      for (; i < stop; i++) out += src[i] === '\n' ? '\n' : ' '
      continue
    }
    out += c
    i++
  }
  return out
}
