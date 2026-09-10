// The single-pass comment blanker every source-scanning guard should share (C-18;
// CUL-884 tracks moving the three that still chain `.replace()` calls onto it).
//
// It lives in its own module rather than inside one guard's test file because a test
// file cannot be imported by another test file without jest running its suites twice —
// and a guard that copies the function instead is exactly how the chained-replace bug
// propagated in the first place.

/**
 * Blank every comment in ONE left-to-right pass, preserving offsets and newlines.
 *
 * A CHAIN of `.replace()` calls is the wrong tool here and the codebase has the scar
 * to prove it (C-18): independent passes each read delimiters the other owns, so a
 * `//` inside a string literal eats the rest of the line and an apostrophe inside a
 * "…" string pairs with the next stray quote — each silently swallowing a real
 * violation. This walks the source once, tracking whether it is in code, a comment or
 * a string, which is the only way to get both right at the same time.
 *
 * Same-length replacement so every offset and line number the caller reports stays
 * honest.
 */
export function blankComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i += 1; }
      continue;
    }
    if (c === '/' && next === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      out += '  ';
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      out += c;
      i += 1;
      while (i < src.length) {
        if (src[i] === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
        out += src[i];
        if (src[i] === quote) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}
