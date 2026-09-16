// The vet report's STYLESHEET guards (CUL-999 R-17, CUL-1000 R-18).
//
// Run with:  deno test supabase/functions/generate-report/style.test.ts
//
// WHY THIS FILE EXISTS
// --------------------
// The app has enforced "theme tokens only" since session one and the report's stylesheet
// was the one place it did not. Measured on `main` before this pass: seventeen font sizes
// and ten letter-spacing values where a lab sheet uses eight and three; eight raw hexes
// over twenty-eight uses beside the tokens; and `--faint` at 3.32:1 — under the 4.5:1 floor
// for text — carrying the sentence that corrects the most misread number on the page, the
// chart legend, the section caveats, the footer's filing key, and the glyph that means
// "nothing was logged that week". None of that is visible in review. All of it is a
// measurement, which is what this file does.
//
// It guards the stylesheet as SHIPPED (`SHIPPED_STYLE` — comments stripped) rather than
// `STYLE`, deliberately: a hex or a size inside a CSS comment is not a declaration, and a
// guard that counted prose would go red on commentary and stay green on a real violation
// sitting behind it. The link to the rendered document — that `renderReport` still
// interpolates exactly this string — is asserted in `render.test.ts`, where the snapshot
// builders live. Without that assertion this file could drift onto a constant that stopped
// shipping and keep passing, which is the failure mode it is written against.
//
// THE REGISTRIES ARE EXEMPTIONS (C-32). Every entry below is a hole in the rule it sits in,
// so each one carries the reason it is allowed and is written as narrowly as it can be. An
// entry added to make a test green, rather than because the design decided it, is a
// pre-authorised violation of the rule it belongs to.
//
// EVERY RULE HERE PINS BOTH HALVES, in the shape `constants/theme.contrast.test.ts` uses:
// not only that the compliant values pass, but that the values they replaced FAIL. Without
// the second half, "simplifying" a caveat back to `--faint` is a green one-token edit;
// with it, that edit has to argue with the ratio.

import { strict as assert } from 'node:assert'
import { SHIPPED_STYLE } from './render.ts'

// ── The measure ───────────────────────────────────────────────────────────────

/** WCAG 2.1 relative luminance of an #rgb / #rrggbb colour (sRGB, linearized). */
function relativeLuminance(hex: string): number {
  const c = hex.replace('#', '')
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.1 contrast ratio between two opaque colours. Order-independent. */
function contrastRatio(fg: string, bg: string): number {
  const [lighter, darker] = [relativeLuminance(fg), relativeLuminance(bg)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

/** WCAG AA for normal-size text. Every rule on this sheet sets 9–27px, never "large". */
const AA_TEXT = 4.5
/** WCAG AA for a non-text mark that carries meaning (a chart glyph, an emphasis rule). */
const AA_MARK = 3

// ── Parsing the shipped sheet ─────────────────────────────────────────────────

interface Rule {
  readonly selector: string
  readonly body: string
}

/**
 * Every declaration block in the sheet, as { selector, body }.
 *
 * `@media print{...}` and `@page{...}` wrap their contents in a second pair of braces, and
 * this pattern simply cannot match across one — so the at-rule's own header is skipped and
 * the rules INSIDE it are returned flat, which is what every assertion here wants: a print
 * override is as much a shipped declaration as a screen one, and `.page{border-radius:0}`
 * in the print block is the reason the radius rule's one exemption is safe.
 */
function rules(): readonly Rule[] {
  return [...SHIPPED_STYLE.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].trim().replace(/\s+/g, ' '),
    body: m[2].trim(),
  }))
}

/** The `:root` token table, resolved to hex. */
function tokens(): Readonly<Record<string, string>> {
  const root = SHIPPED_STYLE.match(/:root\{([\s\S]*?)\}/)
  assert.ok(root, 'the sheet declares a :root token block')
  return Object.fromEntries(
    [...root[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6})/g)].map((m) => [m[1], m[2]]),
  )
}

/**
 * Every declaration a selector makes, anywhere in the sheet, joined.
 *
 * NOT a `Map` keyed by selector, and that is not a style preference — it was a defect this
 * file caught in itself. Several selectors are declared TWICE, once for the screen and once
 * inside `@media print` (`.foot`, `.page`, `body`), and a Map keeps only the last one. The
 * footer assertion below read the print override, found no hairline, and failed over a rule
 * that was present the whole time. A lookup that silently discards half its input is the
 * same class of mistake as a normalizer that collapses a tree: the assertion still runs, it
 * just runs against the wrong thing.
 */
function bodyOf(selector: string): string {
  return rules().filter((r) => r.selector === selector).map((r) => r.body).join(';')
}

/** Resolve `var(--x)` (or a bare hex) against the token table; null if it is neither. */
function resolve(value: string, tok: Readonly<Record<string, string>>): string | null {
  const v = value.trim()
  const ref = v.match(/^var\(--([\w-]+)\)$/)
  if (ref) return tok[ref[1]] ?? null
  return /^#[0-9a-fA-F]{3,6}$/.test(v) ? v : null
}

/** Every `prop:value` pair in a rule body, in source order. */
function decls(body: string): ReadonlyArray<readonly [string, string]> {
  return body
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const at = d.indexOf(':')
      return [d.slice(0, at).trim(), d.slice(at + 1).trim()] as const
    })
}

/** The one ground on this sheet. The container pass is what makes this a single value. */
const PAPER = '#ffffff'

// ── Non-vacuity ───────────────────────────────────────────────────────────────
//
// Every assertion below iterates a set the parser produced. A parser that silently matched
// nothing would make all of them green over nothing — the exact trap `guards/vetVisitsFlagOff`
// fell into (C-36), where eight tests measured a collapsed tree. So the sizes of those sets
// are asserted first, with floors well under today's counts but far above zero.

Deno.test('the guards below are reading a real stylesheet, not an empty string', () => {
  const all = rules()
  assert.ok(all.length > 100, `parsed ${all.length} rules — the sheet has well over 100`)
  assert.ok(Object.keys(tokens()).length >= 8, 'the token table resolved')
  assert.ok(
    all.some((r) => r.selector === '.safetyband') && all.some((r) => r.selector === 'body'),
    'landmark selectors are present, so the parse is not returning fragments',
  )
  // The shipped sheet is the comment-stripped one. If this ever fails, the guards are
  // reading prose and their hex/size counts are measuring commentary.
  assert.ok(!SHIPPED_STYLE.includes('/*'), 'the SHIPPED sheet carries no comments')
})

// ── R-17 item 1 + 2: the contrast floor ───────────────────────────────────────

/**
 * Text allowed below the 4.5:1 floor. FURNITURE ONLY — a string that names the document
 * rather than reporting anything about the pet. The rule this encodes: an owner or a vet
 * who cannot read one of these loses nothing about the animal.
 *
 * These three are the entire list the issue permits, and each is here because of what it
 * says, not because of what it cost to fix.
 */
const FAINT_TEXT_OK: Readonly<Record<string, string>> = {
  '.brand .kind': 'the letterhead kind label — "OWNER-REPORTED PET-HEALTH SUMMARY", furniture',
  '.hqrcap': 'the QR caption — names the code, carries no clinical datum',
  '.tile .v .arw': 'the arrow glyph inside a tile value; the NUMBERS either side are --ink',
}

/** Marks exempt from even the 3:1 target: they rule the page, they do not report on it. */
const STRUCTURAL_MARKS: Readonly<Record<string, string>> = {
  'svg .grid': 'chart gridlines — the ruling behind the data, never a datum',
}

/**
 * Text whose ground is NOT the paper. One entry, and it is the §5.8 colour-as-enhancement
 * carve-out: the proportion bar's segments are filled from the protein palette in the render
 * body, and the label sits on that fill. The datum is carried by the label, the texture and
 * the legend count — never by the fill — so this is white-on-colour by design.
 */
const NON_PAPER_GROUND: Readonly<Record<string, string>> = {
  '.barmix .seg': 'a proportion-bar segment label, on the segment fill (§5.8 carve-out)',
}

Deno.test('R-17 item 1 — no informational TEXT sits below the 4.5:1 floor', () => {
  const tok = tokens()
  let checked = 0
  for (const { selector, body } of rules()) {
    for (const [prop, value] of decls(body)) {
      // A `color:`, or a `fill:` on an SVG text node — those are the two ways this sheet
      // sets the colour of something a person reads. `stroke:` on an svg text node is the
      // white HALO under the glyphs (CUL-993 A.3), not the glyph colour, so it is not text.
      const isText = prop === 'color' || (prop === 'fill' && /\bsvg text/.test(selector))
      if (!isText) continue
      const hex = resolve(value, tok)
      if (hex === null) continue
      if (selector in NON_PAPER_GROUND) continue
      checked += 1
      const ratio = contrastRatio(hex, PAPER)
      if (selector in FAINT_TEXT_OK) {
        assert.ok(ratio < AA_TEXT, `${selector} is registered as furniture but now CLEARS the floor — take it off the list`)
        continue
      }
      assert.ok(
        ratio >= AA_TEXT,
        `${selector} sets ${prop}:${value} = ${ratio.toFixed(2)}:1 on paper. Informational text needs ${AA_TEXT}:1 — use --muted, or add it to FAINT_TEXT_OK with the reason it says nothing about the pet.`,
      )
    }
  }
  assert.ok(checked > 40, `only ${checked} text colours checked — the sheet sets far more`)
})

Deno.test('R-17 item 2 — a chart mark that carries meaning clears the 3:1 mark target', () => {
  const tok = tokens()
  let checked = 0
  for (const { selector, body } of rules()) {
    if (!/^svg /.test(selector) || /\bsvg text/.test(selector)) continue
    if (selector in STRUCTURAL_MARKS) continue
    for (const [prop, value] of decls(body)) {
      if (prop !== 'fill' && prop !== 'stroke') continue
      const hex = resolve(value, tok)
      if (hex === null) continue
      checked += 1
      assert.ok(
        contrastRatio(hex, PAPER) >= AA_MARK,
        `${selector} sets ${prop}:${value} = ${contrastRatio(hex, PAPER).toFixed(2)}:1 — a mark standing for an observation must clear ${AA_MARK}:1`,
      )
    }
  }
  assert.ok(checked >= 5, `only ${checked} chart marks checked`)
})

Deno.test('R-17 item 2 — the two no-count marks read, and are told apart by SHAPE', () => {
  // The pair this item is about. `.nolog` means NOTHING WAS LOGGED that week; `.nub` means a
  // week was observed and the count was ZERO. Recolouring only `.nolog` — which is what the
  // issue asked for — would have left the no-data mark DARKER than the measured-zero mark,
  // inverting the emphasis in the direction that reassures. Both are raised; the distinction
  // is carried by fill-vs-stroke and the dash, which is a shape, which survives a photocopy
  // and a colour-blind reader (§5 rule 8).
  const nolog = bodyOf('svg .nolog')
  const nub = bodyOf('svg .nub')
  assert.ok(nolog && nub, 'both marks are declared')
  assert.ok(/stroke:var\(--muted\)/.test(nolog!), 'the no-data mark is stroked --muted')
  assert.ok(/fill:var\(--muted\)/.test(nub!), 'the measured-zero mark is filled --muted')
  assert.ok(/fill:none/.test(nolog!) && /stroke-dasharray/.test(nolog!), 'no-data stays HOLLOW and dashed')
  assert.ok(!/fill:none/.test(nub!), 'measured-zero stays SOLID')
  // And the token they shared is gone, so neither can drift back to it.
  assert.ok(!('nub' in tokens()), '--nub had no other consumer and was deleted with this fix')
})

Deno.test('R-17 item 1 — the FAILING half: the greys these rules replaced do not clear the floor', () => {
  // Without this, demoting a caveat back to --faint is a green one-token edit. With it, the
  // edit has to argue with the ratio. These are the values measured on `main` before the pass.
  const tok = tokens()
  assert.ok(contrastRatio(tok.faint, PAPER) < AA_TEXT, '--faint must NOT clear AA as text — that is why it is furniture-only')
  assert.ok(contrastRatio(tok.hair, PAPER) < AA_MARK, '--hair must NOT clear the mark target — it rules, it never reports')
  assert.ok(contrastRatio(tok.muted, PAPER) >= AA_TEXT, '--muted is the floor informational text is raised TO')
})

Deno.test('R-17 item 1 — the named informational sites are pinned individually', () => {
  // The issue named these as carrying information in the palest grey on the page. Pinning
  // them by name means a regression on any ONE of them fails with its own name in the
  // message, rather than somewhere inside the sweep above.
  const tok = tokens()
  const named = [
    ['.trend .big .delta-caveat', 'corrects the tile a reader misreads as a 3-to-20 jump'],
    ['.sec > h2 .aside', 'says what the section’s numbers are NOT'],
    ['.foot .pg', 'the filing key on a sheet photocopied out of context'],
    ['.orient', 'tells the reader how the document is ordered'],
    ['.ref', 'points at the appendix behind the figure'],
    ['.trend .who .win', 'the window every bar in the chart is relative to'],
    ['.nb-first', 'the date a word was first marked (C-37)'],
    ['.ng-trunc', 'discloses that the owner’s own words were cut'],
    ['td.omit', 'discloses an omitted cell'],
    ['.rnote', 'says what the record does NOT contain'],
    ['.phimg-missing', 'says a photo could not be shown'],
    ['svg text.yl', 'the y-axis scale'],
    ['svg text.z', 'the label on the no-data mark'],
  ] as const
  for (const [selector, why] of named) {
    const body = bodyOf(selector)
    assert.ok(body, `${selector} is still declared`)
    const set = decls(body!).find(([p]) => p === 'color' || p === 'fill')
    assert.ok(set, `${selector} sets a colour`)
    const hex = resolve(set![1], tok)
    assert.ok(hex, `${selector} uses a token, not a raw value`)
    assert.ok(
      contrastRatio(hex!, PAPER) >= AA_TEXT,
      `${selector} (${why}) dropped below the floor at ${contrastRatio(hex!, PAPER).toFixed(2)}:1`,
    )
  }
})

// ── R-17 item 3: the type scale ───────────────────────────────────────────────

/** The ladder. Seven sizes plus 9px, which the registry below confines to three rules. */
const LADDER = [27, 22, 15, 13.5, 12, 11, 10, 9] as const
/** Nothing INFORMATIONAL below 10px. These three are not informational — see each reason. */
const BELOW_TEN_OK: Readonly<Record<string, string>> = {
  '.safetyband .flag .tag': 'a chip INSIDE the safety band, beside 12px body text that says the same thing',
  '.phtag': 'the same chip in the photo appendix, beside its own 11px caption',
  '.hqrcap': 'the QR caption — furniture (it also holds the only sub-floor colour, above)',
}

Deno.test('R-17 item 3 — every size is on the ladder, and nothing informational is under 10px', () => {
  const seen = new Set<number>()
  let checked = 0
  for (const { selector, body } of rules()) {
    for (const [prop, value] of decls(body)) {
      if (prop !== 'font-size') continue
      const pt = value.match(/^([\d.]+)pt$/)
      if (pt) {
        // The print block re-bases the document in points. One rule, by design: it is the
        // paper's body size, not a step on the screen ladder.
        assert.equal(selector, 'body', `a pt size outside the print body rule: ${selector}`)
        continue
      }
      const px = Number(value.replace('px', ''))
      assert.ok(Number.isFinite(px), `${selector} sets an unparseable font-size: ${value}`)
      checked += 1
      seen.add(px)
      assert.ok(
        (LADDER as readonly number[]).includes(px),
        `${selector} sets ${px}px, which is not on the ladder [${LADDER.join(', ')}]. Seventeen sizes is what this rule exists to stop.`,
      )
      if (px < 10) {
        assert.ok(
          selector in BELOW_TEN_OK,
          `${selector} sets ${px}px. Nothing informational goes under 10px — raise it, or register it with the reason it carries no clinical datum.`,
        )
      }
    }
  }
  assert.ok(checked > 80, `only ${checked} font-size declarations checked`)
  assert.ok(seen.size <= LADDER.length, `${seen.size} distinct sizes ship; the ladder allows ${LADDER.length}`)
  // The failing half: the sizes the pass removed must stay removed. 9.5 and 10.5 are the two
  // that carried most of the drift — near-identical neighbours nobody could see the reason for.
  for (const gone of [9.5, 10.5, 11.5, 12.5, 8]) {
    assert.ok(!seen.has(gone), `${gone}px is back on the sheet — it was consolidated away for a reason`)
  }
})

Deno.test('R-17 item 3 — tracking is three values, not ten', () => {
  const seen = new Set<string>()
  for (const { body } of rules()) {
    for (const [prop, value] of decls(body)) if (prop === 'letter-spacing') seen.add(value)
  }
  assert.deepEqual([...seen].sort(), ['.05em', '.12em', '0'], 'tracking is 0 (default) / .05em (small caps) / .12em (the letterhead kind)')
})

// ── R-17 item 4: the tokens are the palette ───────────────────────────────────

Deno.test('R-17 item 4 — no hex appears outside :root', () => {
  const rootEnd = SHIPPED_STYLE.indexOf('}', SHIPPED_STYLE.indexOf(':root'))
  assert.ok(rootEnd > 0, 'the :root block is found')
  const outside = SHIPPED_STYLE.slice(rootEnd)
  const found = [...outside.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0])
  assert.deepEqual(
    found,
    [],
    `raw hexes outside :root: ${[...new Set(found)].join(', ')}. The app enforces tokens everywhere; this sheet is not an exception.`,
  )
  // Non-vacuity: the search space is real, and :root is where the colours actually live.
  assert.ok(outside.length > 5000, 'the region searched is the whole sheet below :root')
  assert.ok(Object.keys(tokens()).length >= 8, 'and :root carries the palette it is supposed to')
})

Deno.test('R-17 item 4 — a token with no consumer is deleted, not left as a hole', () => {
  // --hair2 and --brand-soft had ZERO consumers before this pass; --nub lost its last two to
  // item 2; --tint was never minted, because the container pass removes every near-white
  // tint it would have named. A token nothing uses is a value the next author will reach for
  // without a reason, which is how six ad hoc greys got here.
  for (const dead of ['hair2', 'brand-soft', 'nub', 'tint']) {
    assert.ok(!(dead in tokens()), `--${dead} is declared but this sheet has no use for it`)
  }
  for (const [name] of Object.entries(tokens())) {
    assert.ok(
      new RegExp(`var\\(--${name}\\)`).test(SHIPPED_STYLE),
      `--${name} is declared and never used — delete it or use it`,
    )
  }
})

// ── R-17 item 6: the prose measure ────────────────────────────────────────────

Deno.test('R-17 item 6 — prose is capped and data is not', () => {
  for (const prose of ['.note', '.appx-sub', '.legend dd', '.callout', '.limit', '.divider']) {
    assert.ok(/max-width:140mm/.test(bodyOf(prose)), `${prose} is prose and runs to the capped measure`)
  }
  // The other half, and the one that matters: a table or a chart capped to a prose measure
  // would strand a third of every appendix. Data keeps the full width.
  for (const data of ['table', '.tiles', '.trend svg', '.ns-row']) {
    assert.ok(!/max-width/.test(bodyOf(data)), `${data} carries data and must keep the full page width`)
  }
})

// ── R-18: the container pass ──────────────────────────────────────────────────

/**
 * Selectors permitted a four-sided border. `.safetyband` is the rule's entire point; the
 * rest are inline chips and data frames, which are not the "cards and tinted callouts"
 * direction A removes — a chip is a label with an outline, not a container holding a block.
 */
const BOXED_OK: Readonly<Record<string, string>> = {
  '.safetyband': 'THE ONE BOX — 2px ink, the element whose plainness must signal severity',
  '.safetyband .flag .tag': 'a chip inside the band',
  '.rangebox .basis': 'the scope chip under the window',
  '.conf': 'a time-confidence chip in an appendix row',
  '.aibadge': 'the AI-provenance chip',
  '.aitag': 'the AI-provenance chip, strip variant',
  '.phtag': 'the present-finding chip on a photo',
  '.sbthumb': 'a photo thumbnail frame, inside the band',
  '.barmix': 'the proportion bar’s own frame — a data encoding, not a panel',
  '.nb-track': 'the Noticed denominator track — a data encoding',
}

/** Borders allowed to exceed 1px, and why each is not a card. */
const HEAVY_OK: Readonly<Record<string, string>> = {
  '.safetyband': '2px ink — the one box',
  '.safetyband > .h': '1.5px ink, the band’s internal divider, inside the box',
  '.safetyband .flag .tag': '1.5px ink chip, inside the box',
  '.sbthumb': '1.5px ink thumbnail frame, inside the box',
  'thead th': '1.5px ink under a table head — item 7 keeps the sheet’s structural rules',
}

Deno.test('R-18 item 1 — the safety band is the only boxed element on the sheet', () => {
  let checked = 0
  for (const { selector, body } of rules()) {
    for (const [prop, value] of decls(body)) {
      if (prop !== 'border') continue
      if (/^(0|none)$/.test(value)) continue
      checked += 1
      assert.ok(
        selector in BOXED_OK,
        `${selector} declares a four-sided border. A clinical sheet uses rules, not containers — make it a hairline top/bottom, or register it with the reason it is not a card.`,
      )
    }
  }
  assert.ok(checked >= 8, `only ${checked} four-sided borders seen — the parse may be missing rules`)
  // The failing half: these NINE were boxed before the pass and must not come back. This is
  // the assertion that makes the rule mean something, because BOXED_OK alone is satisfied by
  // a sheet with no borders at all.
  for (const unboxed of ['.weight', '.tile', '.trend', '.rangebox', '.cherry', '.empty', '.limit', '.present', '.phcard', '.divider', '.callout']) {
    const body = bodyOf(unboxed)
    assert.ok(!decls(body).some(([p]) => p === 'border'), `${unboxed} is boxed again — it was un-boxed by the container pass`)
  }
})

Deno.test('R-18 item 1 — no border is heavier than a hairline, bar the band and the left ink rules', () => {
  let heavy = 0
  for (const { selector, body } of rules()) {
    for (const [prop, value] of decls(body)) {
      if (!/^border(-(top|bottom|left|right))?$/.test(prop)) continue
      const w = value.match(/^([\d.]+)px/)
      if (!w) continue
      const px = Number(w[1])
      if (px <= 1) continue
      heavy += 1
      // The one emphasis device direction A keeps: an ink rule down the left edge, which
      // replaces the box on a callout, a limitation and the present-findings block.
      if (prop === 'border-left' && px <= 3 && /var\(--(ink|faint)\)/.test(value)) continue
      assert.ok(
        selector in HEAVY_OK,
        `${selector} sets ${prop}:${value}. Outside the band, the table-head rule and the left ink rules, every border on this sheet is a 1px hairline.`,
      )
    }
  }
  assert.ok(heavy >= 6, `only ${heavy} borders over 1px seen — the parse may be missing rules`)
})

Deno.test('R-18 item 2 — no rounded corners on the sheet', () => {
  let checked = 0
  for (const { selector, body } of rules()) {
    for (const [prop, value] of decls(body)) {
      if (prop !== 'border-radius') continue
      checked += 1
      if (value === '0') continue
      // The one exemption, and the issue grants it in these words: the preview's page shadow
      // and radius may stay for the SCREEN. The print block below sets it to 0, so nothing
      // that reaches paper is rounded — which is asserted rather than assumed, just below.
      assert.equal(selector, '.page', `${selector} sets border-radius:${value}; a lab sheet has square corners`)
    }
  }
  assert.ok(checked >= 10, `only ${checked} border-radius declarations seen`)
  assert.ok(
    rules().some((r) => r.selector === '.page' && /border-radius:0/.test(r.body)),
    'the print block flattens .page, so the exemption never reaches paper',
  )
})

Deno.test('R-18 items 3 + 6 — no tinted panels, and no zebra', () => {
  const tok = tokens()
  // Grounds that are not tints: the paper, the preview desk behind it, and the three fills
  // that ARE data — the Noticed track and its fill, and a photo's letterbox.
  const GROUND_OK: Readonly<Record<string, string>> = {
    'body': 'the paper, and the preview desk behind it',
    '.page': 'the paper',
    '.nb-track': 'the Noticed denominator track — a data encoding',
    '.nb-fill': 'the answered-days fill — a data encoding',
    '.phimg': 'a photo’s letterbox ground, so a pale image still has an edge',
    '.rule-brand': 'the letterhead rule, drawn as a 2px bar (item 7 keeps it)',
    '.barmix': 'the proportion bar’s own ground, behind the segments',
    '.barmix .seg': 'a segment separator drawn in the paper colour',
  }
  let checked = 0
  for (const { selector, body } of rules()) {
    for (const [prop, value] of decls(body)) {
      if (prop !== 'background' && prop !== 'background-color') continue
      checked += 1
      const hex = resolve(value, tok)
      if (hex !== null && hex.toLowerCase() === PAPER) continue
      assert.ok(
        selector in GROUND_OK,
        `${selector} sets ${prop}:${value}. The sheet is white: a tinted panel is a card without a border, and a light tint is noise on the 200dpi scan this becomes.`,
      )
    }
  }
  assert.ok(checked >= 6, `only ${checked} backgrounds seen`)
  // Item 6, named explicitly: the zebra and the omitted-cell tint are gone, and the row
  // hairline plus the italic are what carry the meaning now.
  assert.ok(!/nth-child\(even\)/.test(SHIPPED_STYLE), 'the table zebra is gone')
  const omit = rules().find((r) => r.selector === 'td.omit')
  assert.ok(omit && !/background/.test(omit.body), 'td.omit keeps its italic and centring, and loses its tint')
  assert.ok(omit && /font-style:italic/.test(omit.body) && /text-align:center/.test(omit.body), 'and still carries the meaning that tint was doing')
})

Deno.test('R-18 item 7 — the sheet’s structural rules stay', () => {
  assert.ok(/border-bottom:1px solid var\(--hair\)/.test(bodyOf('.sec > h2')), 'a section heading keeps its rule')
  assert.ok(/border-bottom:1px solid var\(--hair\)/.test(bodyOf('th,td')), 'table rows keep their hairline')
  assert.ok(/border-top:1px solid var\(--hair\)/.test(bodyOf('.foot')), 'the footer keeps its rule')
  assert.ok(/background:var\(--brand\)/.test(bodyOf('.rule-brand')), 'the letterhead brand rule is the one non-grey line beside the band')
  // And the tile row holds together as a row, which is item 5's stated risk on the render.
  assert.ok(/border-top:1px solid var\(--hair\)/.test(bodyOf('.tiles')), 'the tile ROW is ruled above')
  assert.ok(/border-left:1px solid var\(--hair\)/.test(bodyOf('.tile + .tile')), 'and the cells are divided by hairlines')
})

// ── R-17 item 5: keep-with-next ───────────────────────────────────────────────

Deno.test('R-17 item 5 — a heading never sits alone at the foot of a sheet', () => {
  const keep = rules().find((r) => /page-break-after:avoid/.test(r.body))
  assert.ok(keep, 'the sheet declares a keep-with-next rule')
  for (const sel of ['.sec > h2', '.appx-title', 'caption', '.trend .top']) {
    assert.ok(keep!.selector.includes(sel), `${sel} keeps with what follows it`)
  }
  assert.ok(/break-after:avoid/.test(keep!.body), 'and the un-prefixed property too, for WebKit (the device PDF path)')
  const body = rules().find((r) => r.selector === 'body' && /orphans/.test(r.body))
  assert.ok(body && /orphans:3/.test(body.body) && /widows:3/.test(body.body), 'prose inherits an orphan/widow floor')
})
