// Vet Report (Build Step 9) — pure snapshot → canonical HTML render layer.
//
// This is the report's analog of generate-signal/phrasing.ts's OUTPUT stage, but
// with NO LLM: a PURE module (no I/O, no DB, no network) that turns the immutable
// ReportSnapshot (built by report.ts, PR 1) into the one canonical HTML artifact a
// vet reads. It productionizes the two design mocks — docs/vet-report-mock-v3.html
// (the calm diet-trial dog) and docs/vet-report-mock-cat.html (the safety-led cat) —
// as ONE data-driven function: the same renderer emits the calm layout when
// snapshot.safetyFlags is empty and the safety-led layout (safety band above the
// fold) when it is not. Nothing here decides clinical content; it only lays out
// already-true structured facts. See docs/nyx-vet-report-requirements.md ("the
// spec"): §3 (the IA / 60s scan path), §4 (must-carry sections), §5 (honesty rules),
// §5.8 (no load-bearing colour / B&W-print), §12 PR 2.
//
// THE HONESTY INVARIANTS ARE ENFORCED AT THE RENDER LAYER TOO (report.ts bakes them
// into the data; render.ts must not reintroduce them):
//   §5.3  Absence ≠ wellness — the safety band renders ONLY when a flag is present;
//         an EMPTY safetyFlags array renders NOTHING (never a fabricated "all clear").
//   §5.5  Frequency over severity — the symptom read is frequency. The owner-entered
//         severity rating is NOT rendered anywhere in this report (PM round-3 feedback:
//         it was an unused column of blanks that added noise); it stays captured in-app
//         and on the event, but never reaches the artifact, so it is never averaged.
//   §5.8  No load-bearing colour — every datum is carried by a NUMBER, a BAR HEIGHT,
//         a LABEL, or POSITION; the only fills are grayscale, and every fill/swatch
//         carries `print-color-adjust:exact` so it survives a default clinic printer.
//   §5.9  Present-only for blood / foreign / mucus — these render ONLY from the
//         snapshot's present-incident arrays. When those arrays are empty the render
//         is a de-weighted LIMITATION note ("not seen … this is NOT a clearance"),
//         NEVER a "0 of N" (which would fold the enum's `unsure` into a safe zero).
//   §5.10 Assessed denominators — the vomit phenotype mix renders over the ASSESSED
//         (completed) set; completed / uncertain / failed / pending stay distinct and
//         are disclosed, never collapsed into the denominator.
//   §4/B-117 A regimen with adherenceState==='not_tracked' renders "adherence not
//         tracked", NEVER "compliant"/"given" — a zero-dose drug is not a taken drug.
//   §4/B-040 Free-fed intake renders the VERBATIM string "Intake not directly
//         observed"; absence of a logged meal is never rendered as "didn't eat".
//   §4/B-010 A non-witnessed event renders as a time RANGE or estimate, never a false
//         precise point.
//
// PRIVACY (spec §8): this file emits ZERO third-party subresources — no CDN font
// link, no remote image, no external stylesheet — so the token-served page makes no
// third-party request that could leak the share token in a `Referer`. The serif
// display face degrades to the local Georgia/serif stack; self-hosted Newsreader is
// wired in on the share-path PR (rls-privacy-reviewer gate), not baked in here. The
// `Referrer-Policy: no-referrer` meta is included now (harmless, forward-compatible).
// The QR / verify-URL footer furniture from the mocks belongs to the share path
// (there is no token yet at PR 2), so the footer here carries the wordmark +
// pet + range + section label only — no placeholder URL.

import type {
  ReportSnapshot,
  SafetyFlag,
  SymptomAggregate,
  VomitContentCategory,
  StoolCharacteristics,
  WeightSection,
  DietSummary,
  MedicationAdherence,
  UnlinkedMedicationGroup,
  CorrelationSummary,
  ConcurrentChange,
  SymptomLogEntry,
  IntakeLogEntry,
  ConfounderExposure,
  ScopeInfo,
  Signalment,
  AtAGlance,
  IncidentPhoto,
  SymptomLogPhenotype,
} from './report.ts'

// ── HTML escaping — EVERY interpolated data string flows through here ────────────
// The snapshot carries owner-entered free text (pet name, food labels, notes, drug
// names). Unescaped, a `<` breaks the markup and a token-served page becomes an XSS
// sink. `h()` escapes text nodes AND attribute values (quotes included).
function h(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** A tabular-figures numeric span (cosmetic alignment only; the value is the datum). */
function num(v: string | number): string {
  return `<span class="num">${h(v)}</span>`
}

/**
 * The ONE uniform provenance badge for any AI-derived datum (R2-4 disclaimer consolidation). It
 * replaces the ~per-flag "This is an AI read of an owner photo — owner-reviewable and not confirmed"
 * sentences that the first real artifact repeated ~23 times; a single, scannable "AI read ·
 * unconfirmed" chip carries the same provenance without the prose. Data-qualifiers that change a
 * datum's clinical MEANING (e.g. "a photo cannot exclude bleeding") are NOT hedges and are kept.
 */
function aiBadge(): string {
  return `<span class="aibadge">AI read &middot; unconfirmed</span>`
}

// ── Date / time formatting (deterministic; formats GIVEN instants, no Date.now) ──
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Parse a 'YYYY-MM-DD' day key into calendar parts (no tz shift — it is already a local day). */
function dayParts(dayKey: string): { y: number; m: number; d: number } | null {
  const mm = /^(\d{4})-(\d{2})-(\d{2})/.exec(dayKey)
  if (!mm) return null
  const m = Number(mm[2])
  const d = Number(mm[3])
  // Bounds-check so an out-of-range month/day degrades to the raw-string fallback (via the
  // callers' `h(dayKey)`) rather than interpolating `MONTHS[12] === undefined` verbatim into
  // a document a vet reads (code-reviewer).
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return { y: Number(mm[1]), m, d }
}

/** 'YYYY-MM-DD' → "Mon D" (no year). */
function fmtDay(dayKey: string | null): string {
  if (!dayKey) return '—'
  const p = dayParts(dayKey)
  return p ? `${MONTHS[p.m - 1]} ${p.d}` : h(dayKey)
}

/** 'YYYY-MM-DD' → "Mon D, YYYY". */
function fmtDayYear(dayKey: string | null): string {
  if (!dayKey) return '—'
  const p = dayParts(dayKey)
  return p ? `${MONTHS[p.m - 1]} ${p.d}, ${p.y}` : h(dayKey)
}

/** Inclusive window "Mon D – Mon D, YYYY" (single year) or full both-years form. */
function fmtRange(start: string, end: string): string {
  const s = dayParts(start)
  const e = dayParts(end)
  if (!s || !e) return `${h(start)} – ${h(end)}`
  if (s.y === e.y) return `${MONTHS[s.m - 1]} ${s.d} – ${MONTHS[e.m - 1]} ${e.d}, ${e.y}`
  return `${MONTHS[s.m - 1]} ${s.d}, ${s.y} – ${MONTHS[e.m - 1]} ${e.d}, ${e.y}`
}

/** An ISO instant → the owner-local "Mon D" (falls back to UTC slice on a bad tz). */
function fmtLocalDay(iso: string, tz: string | null): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return h(iso)
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        month: 'short',
        day: 'numeric',
      }).formatToParts(new Date(ms))
      const mo = parts.find((p) => p.type === 'month')?.value ?? ''
      const da = parts.find((p) => p.type === 'day')?.value ?? ''
      return `${mo} ${da}`
    } catch {
      /* invalid IANA zone → UTC fallback */
    }
  }
  return fmtDay(new Date(ms).toISOString().slice(0, 10))
}

/** An ISO instant → owner-local "HH:MM" 24h (falls back to UTC on a bad tz). */
function fmtLocalTime(iso: string, tz: string | null): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return '—'
  if (tz) {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(ms))
    } catch {
      /* invalid IANA zone → UTC fallback */
    }
  }
  return new Date(ms).toISOString().slice(11, 16)
}

/**
 * B-213 — a whole-hour gap rendered as the clinically-natural unit: hours below the feline
 * 72 h window (so a vet can place the pet in the ≥48–72 h band), days above it. Deterministic,
 * no rounding surprises (input is already whole hours from report.ts). A whole-day value drops
 * the ".0" so "about 3 days" reads cleanly (a "3.0" alongside "about" is self-contradictory —
 * cold-read nit).
 */
function humanizeGap(hours: number): string {
  if (hours < 72) return `${num(hours)}&nbsp;h`
  const days = hours / 24
  const oneDp = days.toFixed(1)
  const d = days >= 30 ? String(Math.round(days)) : oneDp.endsWith('.0') ? oneDp.slice(0, -2) : oneDp
  return `${num(d)}&nbsp;days`
}

// ── Display-label maps ───────────────────────────────────────────────────────────

/** Owner-recorded intake, as a clinical label for the meal appendix (B-213). */
function intakeLabel(rating: string): string {
  switch (rating) {
    case 'all':
      return 'Ate it all'
    case 'most':
      return 'Ate most'
    case 'some':
      return 'Ate some'
    case 'picked':
      return 'Picked at it'
    case 'refused':
      return 'Refused'
    default:
      return rating.replace(/_/g, ' ')
  }
}

function symptomLabel(type: string): string {
  switch (type) {
    case 'vomit':
      return 'Vomiting'
    case 'diarrhea':
      return 'Loose stool'
    case 'itch':
      return 'Itching'
    case 'scratch':
      return 'Scratching'
    case 'skin_reaction':
      return 'Skin reaction'
    case 'lethargy':
      return 'Lethargy'
    case 'stool_normal':
      return 'Stool (normal)'
    case 'meal':
      return 'Meal'
    default:
      return type.replace(/_/g, ' ')
  }
}

function speciesLabel(species: string): string {
  if (species === 'dog') return 'Canine'
  if (species === 'cat') return 'Feline'
  return species.charAt(0).toUpperCase() + species.slice(1)
}

function contentsLabel(cat: VomitContentCategory): string {
  switch (cat) {
    case 'food':
      return 'Undigested / partly-digested food'
    case 'bile':
      return 'Bile'
    case 'hairball':
      return 'Hairball'
    case 'foam_liquid':
      return 'Foam / liquid'
    case 'grass':
      return 'Grass / plant'
    case 'unsure':
      return 'Not classified'
  }
}

/** Fixed render order for the phenotype mix (deterministic segment order). */
const CONTENTS_ORDER: VomitContentCategory[] = ['food', 'bile', 'foam_liquid', 'hairball', 'grass', 'unsure']

/** A grayscale ramp for proportion-bar segments — NEVER colour (§5.8). Cycles if >6. */
// A calm mid-to-light grayscale ramp for the phenotype proportion bar + its key swatches. The
// dominant segment used to render near-black (#1a1c22), which read as a heavy "chart" slab on the
// first artifact (PM #1); a muted mid-gray start keeps the segments distinguishable without the
// black shout. No colour carries data (§5.8) — the key's swatch + label + count is the datum.
const GRAY_RAMP = ['#585c64', '#74777f', '#8f929a', '#a9acb2', '#c2c4c9', '#d8d9dd']

// ── Small SVG builders (all non-colour) ──────────────────────────────────────────

/**
 * The symptom-frequency bar chart (§3.5, the hero) — non-colour, B&W-safe. Bars are
 * dark; a ZERO week renders as a short "nub" at the baseline with a `0` label (a
 * visible zero, never a blank). Dashed vertical intervention markers (§3.5) are drawn
 * at the bucket where a diet/drug/supplement/free-fed change started, so the reader
 * cannot miss that "something changed here" — the full enumeration lives in the
 * `Reading the trend` note below the chart (GP-0).
 */
function symptomChart(sym: SymptomAggregate, markers: ConcurrentChange[], windowEndDate: string): string {
  const buckets = sym.weeklyBuckets
  const n = Math.max(1, buckets.length)
  const L = 40
  const R = 628
  const BASE = 116
  const TOP = 28
  const plotW = R - L
  const slot = plotW / n
  const barW = Math.max(10, Math.min(30, slot * 0.5))
  const yMax = Math.max(2, ...buckets)
  const centerX = (i: number): number => L + (i + 0.5) * slot
  const yFor = (count: number): number => BASE - (count / yMax) * (BASE - TOP)

  const parts: string[] = []
  // Gridlines + baseline axis + Y ticks (max / mid / 0).
  parts.push(`<line class="grid" x1="${L}" y1="${TOP}" x2="${R}" y2="${TOP}"/>`)
  parts.push(`<line class="grid" x1="${L}" y1="${(TOP + BASE) / 2}" x2="${R}" y2="${(TOP + BASE) / 2}"/>`)
  parts.push(`<line class="axis" x1="${L}" y1="${BASE}" x2="${R}" y2="${BASE}"/>`)
  parts.push(`<text class="yl num" x="30" y="${TOP + 3}" text-anchor="end">${yMax}</text>`)
  parts.push(`<text class="yl num" x="30" y="${(TOP + BASE) / 2 + 3}" text-anchor="end">${Math.round(yMax / 2)}</text>`)
  parts.push(`<text class="yl num" x="30" y="${BASE + 3}" text-anchor="end">0</text>`)

  // Intervention markers (dashed verticals + a short date at the top of each). The date carries a
  // small "start" prefix and NO ▲ glyph — on the first real artifact the triangle read as a data
  // spike/peak on the chart itself (R2-6); a dashed rule + a labelled "start ·" is unambiguously a
  // divider, and the one-line legend below the panels spells out what it marks.
  const markedBuckets = new Set<number>()
  for (const m of markers) {
    if (m.bucketIndex === null || m.bucketIndex < 0 || m.bucketIndex >= n) continue
    if (markedBuckets.has(m.bucketIndex)) continue
    markedBuckets.add(m.bucketIndex)
    const mx = centerX(m.bucketIndex)
    parts.push(`<line class="mark" x1="${mx.toFixed(1)}" y1="18" x2="${mx.toFixed(1)}" y2="${BASE}"/>`)
    // Anchor the date label so it stays inside the plot (end-anchor in the right third).
    const anchor = mx > L + plotW * 0.66 ? 'end' : 'start'
    const lx = anchor === 'end' ? mx - 3 : mx + 3
    parts.push(`<text class="ann" x="${lx.toFixed(1)}" y="11" text-anchor="${anchor}">start &middot; ${h(fmtDay(m.startDate))}</text>`)
  }

  // X-axis: week-start date labels (PM) via the shared helper the protein chart also uses, so the
  // two weekly charts align on identical dates. Replaces the month-only ticks (R2-6) with per-week
  // orientation ("May 11, May 18 …"); the exact window bounds stay in the range box + caption.
  parts.push(weekAxisLabels(sym.bucketStartDates, L, slot, n, BASE))

  // Bars + count labels.
  for (let i = 0; i < n; i++) {
    const c = buckets[i]
    const cx = centerX(i)
    const x = cx - barW / 2
    if (c > 0) {
      const y = yFor(c)
      const height = BASE - y
      parts.push(`<rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${height.toFixed(1)}" rx="4"/>`)
      parts.push(`<text class="cap num" x="${cx.toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle">${c}</text>`)
    } else {
      parts.push(`<rect class="nub" x="${x.toFixed(1)}" y="${BASE - 3}" width="${barW.toFixed(1)}" height="3" rx="1.5"/>`)
      parts.push(`<text class="z num" x="${cx.toFixed(1)}" y="${BASE - 7}" text-anchor="middle">0</text>`)
    }
  }

  const aria = `${symptomLabel(sym.type)} episodes per week: ${buckets.join(', ')}. Window ends ${h(fmtDay(windowEndDate))}.`
  return `<svg viewBox="0 0 648 150" role="img" aria-label="${h(aria)}">${parts.join('')}</svg>`
}

/**
 * Week-start x-axis labels shared by the symptom + protein charts, so both weekly charts line up
 * on the same dates (PM: "work the week-over-week labels — May 11, May 18 — into the vomit chart").
 * A light tick at each week edge + the week-start date centred under the bar. Every week when there
 * are ≤14; every other above that, so a long window never crowds the axis (never a silent drop —
 * the range box + caption still carry the exact bounds).
 */
function weekAxisLabels(bucketStartDates: string[], L: number, slot: number, n: number, BASE: number): string {
  const stride = n > 14 ? 2 : 1
  const parts: string[] = []
  for (let i = 0; i < n; i++) {
    if (i % stride !== 0) continue
    const p = dayParts(bucketStartDates[i] ?? '')
    if (!p) continue
    const xEdge = L + i * slot
    const xMid = L + (i + 0.5) * slot
    parts.push(`<line class="mtick" x1="${xEdge.toFixed(1)}" y1="${BASE}" x2="${xEdge.toFixed(1)}" y2="${BASE + 4}"/>`)
    parts.push(`<text class="xl" x="${xMid.toFixed(1)}" y="${BASE + 15}" text-anchor="middle">${MONTHS[p.m - 1]} ${p.d}</text>`)
  }
  return parts.join('')
}

// ── Protein-over-time stacked bar (#9) ─────────────────────────────────────────────
// The report is otherwise grayscale (§5.8). This one chart introduces a MUTED palette to separate
// up to ~8 proteins — but colour is NEVER load-bearing: every segment ALSO carries a distinct SVG
// texture AND a legend count, so it reads identically in a B&W photocopy (the mock's greyscale
// proof validated this). Largest protein sits on the baseline; a no-recorded-protein band caps it.
const PROTEIN_COLORS = ['#d69a3f', '#6f92c9', '#4c9c8d', '#c67f9a', '#9184bf', '#7f8894', '#b17f63', '#89a25c']
const UNKNOWN_COLOR = '#d3d5d9'

/** A tile-clean, print-visible texture over a muted fill — one per protein index (cycles at 8). */
function proteinPattern(id: string, color: string, texIndex: number): string {
  const ink = 'rgba(20,24,34,.34)'
  let tex = ''
  switch (texIndex % 8) {
    case 0: tex = ''; break // solid (the dominant baseline protein)
    case 1: tex = `<circle cx="4" cy="4" r="1.5" fill="${ink}"/>`; break // dots
    case 2: tex = `<path d="M0 4 H8" stroke="${ink}" stroke-width="1.4"/>`; break // horizontal
    case 3: tex = `<path d="M4 0 V8" stroke="${ink}" stroke-width="1.4"/>`; break // vertical
    case 4: tex = `<path d="M-2 2 L2 -2 M0 8 L8 0 M6 10 L10 6" stroke="${ink}" stroke-width="1.3"/>`; break // diagonal /
    case 5: tex = `<path d="M-2 6 L2 10 M0 0 L8 8 M6 -2 L10 2" stroke="${ink}" stroke-width="1.3"/>`; break // diagonal \
    case 6: tex = `<path d="M0 4 H8 M4 0 V8" stroke="${ink}" stroke-width="1"/>`; break // grid
    case 7: tex = `<path d="M0 0 L8 8 M0 8 L8 0" stroke="${ink}" stroke-width="1"/>`; break // cross
  }
  return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${color}"/>${tex}</pattern>`
}

/** A small legend swatch (self-contained svg + its own pattern def, unique id) mirroring a bar fill. */
function proteinSwatch(id: string, color: string | null, texIndex: number): string {
  const def = color === null
    ? `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${UNKNOWN_COLOR}"/></pattern>`
    : proteinPattern(id, color, texIndex)
  return `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><defs>${def}</defs><rect width="12" height="12" rx="2" fill="url(#${id})" stroke="rgba(20,24,34,.25)"/></svg>`
}

function proteinTimelineChart(t: import('./report.ts').ProteinTimeline): string {
  const n = Math.max(1, t.weekStartDates.length)
  const L = 40
  const R = 628
  const BASE = 124
  const TOP = 20
  const slot = (R - L) / n
  const barW = Math.max(12, Math.min(34, slot * 0.6))
  const weekTotal = (w: number): number => t.bins[w].reduce((a, b) => a + b, 0) + (t.unknownByWeek[w] ?? 0)
  const yMax = Math.max(2, ...Array.from({ length: n }, (_, w) => weekTotal(w)))
  const yFor = (v: number): number => BASE - (v / yMax) * (BASE - TOP)
  const centerX = (i: number): number => L + (i + 0.5) * slot

  const defs =
    t.proteins.map((_, j) => proteinPattern(`ptc-${j}`, PROTEIN_COLORS[j % PROTEIN_COLORS.length], j)).join('') +
    `<pattern id="ptc-u" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${UNKNOWN_COLOR}"/></pattern>`

  const parts: string[] = []
  parts.push(`<line class="grid" x1="${L}" y1="${TOP}" x2="${R}" y2="${TOP}"/>`)
  parts.push(`<line class="grid" x1="${L}" y1="${(TOP + BASE) / 2}" x2="${R}" y2="${(TOP + BASE) / 2}"/>`)
  parts.push(`<line class="axis" x1="${L}" y1="${BASE}" x2="${R}" y2="${BASE}"/>`)
  parts.push(`<text class="yl num" x="30" y="${TOP + 3}" text-anchor="end">${yMax}</text>`)
  parts.push(`<text class="yl num" x="30" y="${(TOP + BASE) / 2 + 3}" text-anchor="end">${Math.round(yMax / 2)}</text>`)
  parts.push(`<text class="yl num" x="30" y="${BASE + 3}" text-anchor="end">0</text>`)

  for (let i = 0; i < n; i++) {
    const x = centerX(i) - barW / 2
    let yCursor = BASE
    for (let j = 0; j < t.proteins.length; j++) {
      const v = t.bins[i]?.[j] ?? 0
      if (v <= 0) continue
      const hgt = (v / yMax) * (BASE - TOP)
      yCursor -= hgt
      parts.push(
        `<rect x="${x.toFixed(1)}" y="${yCursor.toFixed(1)}" width="${barW.toFixed(1)}" height="${hgt.toFixed(1)}" fill="url(#ptc-${j})" stroke="#fff" stroke-width="0.6"/>`,
      )
    }
    const u = t.unknownByWeek[i] ?? 0
    if (u > 0) {
      const hgt = (u / yMax) * (BASE - TOP)
      yCursor -= hgt
      parts.push(
        `<rect x="${x.toFixed(1)}" y="${yCursor.toFixed(1)}" width="${barW.toFixed(1)}" height="${hgt.toFixed(1)}" fill="url(#ptc-u)" stroke="#fff" stroke-width="0.6"/>`,
      )
    }
    const total = weekTotal(i)
    if (total > 0) parts.push(`<text class="cap num" x="${centerX(i).toFixed(1)}" y="${(yFor(total) - 5).toFixed(1)}" text-anchor="middle">${total}</text>`)
  }
  parts.push(weekAxisLabels(t.weekStartDates, L, slot, n, BASE))
  // print-color-adjust:exact inherits to the pattern fills so the bars survive a default clinic printer.
  return `<svg viewBox="0 0 648 148" role="img" aria-label="Off-diet protein exposure per week." style="-webkit-print-color-adjust:exact;print-color-adjust:exact;"><defs>${defs}</defs>${parts.join('')}</svg>`
}

/** Capitalise a protein label for the legend ("chicken" → "Chicken"), leaving multi-word casing alone. */
function capProtein(p: string): string {
  return p.length ? p.charAt(0).toUpperCase() + p.slice(1) : p
}

function proteinTimelineSection(snap: ReportSnapshot): string {
  const t = snap.proteinTimeline
  if (t.proteins.length === 0 && !t.hasUnknown) return '' // nothing off-diet to chart
  const n = t.weekStartDates.length
  const legend =
    t.proteins
      .map((p, j) => `<span class="ptleg">${proteinSwatch(`pts-${j}`, PROTEIN_COLORS[j % PROTEIN_COLORS.length], j)}${h(capProtein(p))} ${num(t.totalByProtein[p] ?? 0)}</span>`)
      .join('') +
    (t.hasUnknown ? `<span class="ptleg">${proteinSwatch('pts-u', null, 0)}no recorded protein ${num(t.unknownByWeek.reduce((a, b) => a + b, 0))}</span>` : '')
  return `
  <div class="sec">
    <h2>Off-diet protein exposure over time</h2>
    <div class="trend">
      ${proteinTimelineChart(t)}
      <div class="ptlegend">${legend}</div>
      <div class="subnote">${num(t.totalFeedings)} off-diet feeding${
        t.totalFeedings === 1 ? '' : 's'
      } (treats + human food) over ${num(n)} week${n === 1 ? '' : 's'}; each bar is one week, stacked by protein. Colour is a convenience — every protein also carries a texture, so this reads in black &amp; white. Itemised in appendix&nbsp;C.</div>
    </div>
  </div>`
}

/** A tiny weight sparkline (non-colour): polyline over the in-window series + dots. */
function weightSpark(seriesKg: number[]): string {
  const W = 118
  const Hh = 34
  const padX = 6
  const padY = 8
  const n = seriesKg.length
  if (n === 0) return ''
  const min = Math.min(...seriesKg)
  const max = Math.max(...seriesKg)
  const span = max - min || 1
  const xFor = (i: number): number => (n === 1 ? W / 2 : padX + (i * (W - 2 * padX)) / (n - 1))
  // Higher weight sits HIGHER on the sparkline (y inverted).
  const yFor = (v: number): number => padY + (1 - (v - min) / span) * (Hh - 2 * padY)
  const pts = seriesKg.map((v, i) => `${xFor(i).toFixed(0)},${yFor(v).toFixed(0)}`).join(' ')
  const dots = seriesKg
    .map((v, i) => `<circle class="spkdot" cx="${xFor(i).toFixed(0)}" cy="${yFor(v).toFixed(0)}" r="2.6"/>`)
    .join('')
  const line = n >= 2 ? `<polyline class="spk" points="${pts}"/>` : ''
  return `<svg class="spark" width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Weight trend over ${n} owner weigh-in${n === 1 ? '' : 's'}.">${line}${dots}</svg>`
}

// ── Page-1 sections ──────────────────────────────────────────────────────────────

// The Culprit "Moon & Signal" brand QR, encoding https://getculprit.app so a vet who reads the
// report can scan through to learn about Culprit (the distribution wedge — vets recommend the app).
// The URL is STATIC across every report, so the module matrix is generated once, offline, and
// embedded as a constant — the Edge Function needs no runtime QR dependency, and the code prints
// black-on-white (§5.8 B&W-safe, carries no data colour). To regenerate if the URL ever changes
// (e.g. to getculprit.app/vets): run scripts/gen-report-qr.mjs and paste its output here.
// Source: "https://getculprit.app", errorCorrectionLevel "Q", 29×29 modules.
const GETCULPRIT_QR: readonly string[] = [
  '11111110000011101010101111111',
  '10000010101001111111101000001',
  '10111010111110101000101011101',
  '10111010000000111101101011101',
  '10111010001001111101001011101',
  '10000010010001010001101000001',
  '11111110101010101010101111111',
  '00000000010110101110000000000',
  '01110110000010110001100000110',
  '01101001101101110000010011001',
  '01100110010010101000001100110',
  '00110001000100110011000001001',
  '10001011011010100100010100111',
  '00100101111011101011001101111',
  '11001010110101100111110111011',
  '01111100010010110111111011000',
  '00000111111111111110111011001',
  '01001101111010101001101100100',
  '10111010001101011001001010100',
  '00011001011010100111011101101',
  '01000110010001100110111111111',
  '00000000111000001010100011011',
  '11111110001111100101101010110',
  '10000010111100001010100010000',
  '10111010000101010010111111110',
  '10111010101010001011000010110',
  '10111010110110111010100100001',
  '10000010101000001011010011010',
  '11111110011001111010110101010',
]

/** Render a QR module matrix as inline SVG (horizontal run-length merged; a 2-module quiet zone). */
function qrSvg(matrix: readonly string[], sizePx: number): string {
  const n = matrix.length
  const quiet = 2
  const dim = n + quiet * 2
  let rects = ''
  for (let y = 0; y < n; y++) {
    const row = matrix[y]
    let x = 0
    while (x < n) {
      if (row[x] === '1') {
        let run = 1
        while (x + run < n && row[x + run] === '1') run++
        rects += `<rect x="${x + quiet}" y="${y + quiet}" width="${run}" height="1"/>`
        x += run
      } else {
        x++
      }
    }
  }
  return (
    `<svg class="hqr" width="${sizePx}" height="${sizePx}" viewBox="0 0 ${dim} ${dim}" ` +
    `role="img" aria-label="QR code linking to getculprit.app">` +
    `<rect width="${dim}" height="${dim}" fill="#fff"/><g fill="#111">${rects}</g></svg>`
  )
}

/**
 * The "Moon & Signal" brand mark — a moonlight crescent (mask cut-out) + the Signal dot. Rendered
 * MONOCHROME in the letterhead ink (--brand): the report is a clinical artifact and §5.8 keeps
 * colour off the page, so the mark carries the brand by SHAPE, not the app's teal accent (which
 * would read as the "consumer-app" tell the cold-reads flagged). Degrades to dark gray in B&W.
 */
function brandMark(): string {
  return (
    `<svg class="cmark" viewBox="0 0 32 32" aria-hidden="true">` +
    `<defs><mask id="cmMoon"><rect width="32" height="32" fill="#fff"/>` +
    `<circle cx="21" cy="13" r="9.4" fill="#000"/></mask></defs>` +
    `<circle cx="16" cy="16" r="12.4" fill="var(--brand)" mask="url(#cmMoon)"/>` +
    `<circle cx="23.4" cy="22.6" r="2.5" fill="var(--brand)"/></svg>`
  )
}

function letterhead(snap: ReportSnapshot): string {
  // The lettered appendices run A–D, plus a conditional meals appendix (E, whenever the owner
  // logged meals or an intake flag fired) and a conditional incident-photos appendix (PR 7, the
  // last letter — E or F); the closing "How to read" page is deliberately unlettered. State the
  // ACCURATE range — the first round-2 artifact said "A–F", sending a careful vet hunting for a
  // non-existent appendix on a document whose whole pitch is "traces to every figure" (cold-read).
  const lastAppendix = lastAppendixLetter(snap)
  return `
  <div class="letter">
    <div class="brand">
      ${brandMark()}
      <span class="wordmark">Culprit</span>
      <span class="kind">Owner-reported<br/>pet-health summary</span>
    </div>
    <div class="lh-right">
      <div class="stamp">
        <div><b>Prepared for veterinary review</b></div>
        <div>Not a diagnosis · owner-reported observations</div>
        <div>Generated ${h(fmtDayYear(localDayKeyOf(snap.generatedAt, snap.timezone)))}</div>
      </div>
      <div class="hqrblock">
        ${qrSvg(GETCULPRIT_QR, 66)}
        <span class="hqrcap">About Culprit<br/>getculprit.app</span>
      </div>
    </div>
  </div>
  <div class="rule-brand"></div>
  <div class="orient">Clinical summary: this page. Appendices A&ndash;${lastAppendix} (+ a legend): the reference record behind every figure.</div>`
}

/** The generated-at day, localized (for the letterhead stamp). */
function localDayKeyOf(iso: string, tz: string | null): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return iso.slice(0, 10)
  if (tz) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
        new Date(ms),
      )
    } catch {
      /* fallthrough */
    }
  }
  return new Date(ms).toISOString().slice(0, 10)
}

function scopeBasisLabel(scope: ScopeInfo): string {
  switch (scope.basis) {
    case 'since_visit':
      return 'Since last vet visit'
    case 'diet_trial':
      return 'Since diet-trial start'
    case 'fallback_90d':
      return 'Last 90 days'
    case 'custom':
      return 'Custom range'
  }
}

function signalmentBlock(snap: ReportSnapshot): string {
  const s: Signalment = snap.signalment
  const sexBit = s.sex === 'unknown' ? 'sex not recorded' : s.sex
  const neuterBit =
    s.neuterStatus === 'not_recorded' ? 'neuter not recorded' : s.neuterStatus
  // An approximate DOB is a computed anchor from an entered age, not a witnessed
  // birthday (B-251) — render it as an estimated age ("~2 yr") and NEVER a birth
  // year, which would present false precision to the vet. Exact DOBs keep "(b. YYYY)".
  const ageBit =
    s.ageYears === null
      ? 'age not recorded'
      : s.dateOfBirthPrecision === 'approximate'
        ? `~${s.ageYears}&nbsp;yr`
        : `${s.ageYears}&nbsp;yr${s.dateOfBirth ? ` (b.&nbsp;${h(dayParts(s.dateOfBirth)?.y ?? '')})` : ''}`
  const sig = [speciesLabel(s.species), s.breed ? h(s.breed) : 'breed not recorded', `${h(sexBit)}, ${h(neuterBit)}`, ageBit].join(
    ' &middot; ',
  )
  const ownerBit = s.ownerName ? `Owner: ${h(s.ownerName)}` : 'Owner: not recorded'
  const weightBit = s.latestWeight
    ? ` &middot; latest weight ${num(s.latestWeight.kg.toFixed(1))}&nbsp;kg (${h(fmtDay(s.latestWeight.date))})`
    : ' &middot; no weigh-in recorded'

  const scope = snap.scope
  return `
  <div class="ident">
    <div class="who">
      <div class="name">${h(s.name)}</div>
      <div class="sig">${sig}</div>
      <div class="wt">${ownerBit}${weightBit}</div>
    </div>
    <div class="rangebox">
      <div class="win num">${h(fmtRange(scope.startDate, scope.endDate))}</div>
      <div class="days">${num(scope.windowDays)}&nbsp;days &middot; ${num(snap.atAGlance.loggedDays)}&nbsp;days with a log</div>
      <div class="basis">${h(scopeBasisLabel(scope))}</div>
    </div>
  </div>${cherryPickDisclosure(snap)}`
}

/** §6 cherry-pick guard — only on a custom window with out-of-window events. */
function cherryPickDisclosure(snap: ReportSnapshot): string {
  const sc = snap.scope
  if (!sc.isCustomOverride || sc.outOfWindowSymptomCount <= 0) return ''
  const recent = sc.outOfWindowMostRecent ? ` (most recent ${h(fmtLocalDay(sc.outOfWindowMostRecent, snap.timezone))})` : ''
  return `
  <div class="cherry"><b>Custom range.</b> ${num(sc.outOfWindowSymptomCount)} symptom event${
    sc.outOfWindowSymptomCount === 1 ? '' : 's'
  } fall outside this window${recent} — shown so nothing is cropped to a good week.</div>`
}

/**
 * The safety-leads slot (§3.1, §5.3). Renders ONLY when flags are present — an empty
 * array returns '' (never a fabricated "all clear"). Mono-prominent: heavy border +
 * weight, never colour.
 */
function safetyBand(snap: ReportSnapshot): string {
  const flags = snap.safetyFlags
  if (flags.length === 0) return ''
  const rows = flags.map((f) => safetyFlagRow(f, snap)).join('')
  const warnIcon = `<svg viewBox="0 0 24 24" fill="#16181d" aria-hidden="true"><path d="M12 2 L23 21 H1 Z"/><rect x="11" y="9" width="2" height="6" fill="#fff"/><rect x="11" y="16.5" width="2" height="2" fill="#fff"/></svg>`
  return `
  <div class="safetyband">
    <div class="h">${warnIcon} Safety — flags for review</div>
    ${rows}
  </div>`
}

function flagRow(tag: string, body: string): string {
  // The type chip leads the line INLINE (not a fixed-width left column) — the same two-column-reads-
  // messy fix applied to the diet section (PM). The body flows full-width after/under the chip.
  return `<div class="flag"><span class="tag">${h(tag)}</span> ${body}</div>`
}

/**
 * The safety-band photo lead (PR 7, §2/§3.1): a safety-flagged photo (blood/foreign) also LEADS
 * the safety band on page 1, so the frame the flag is about is impossible to miss (prominence is
 * orthogonal to Appendix E inclusion). Renders the embedded thumbnails for the flagged incidents,
 * pointing to their full appendix entry. Only photos actually embedded (dataUri set) show here —
 * a photo whose server-side fetch failed still leaves its flag TEXT leading the band (the flag is
 * a fact independent of the image), just without a thumbnail. Photos never carry an n=1 verdict.
 *
 * The data URI is server-generated base64 over a fixed media-type allowlist (index.ts) — NOT owner
 * text — and the base64 alphabet contains none of h()'s escaped characters, so it is interpolated
 * directly (escaping a multi-hundred-KB string per photo would be pure waste); every owner-entered
 * string in this file still flows through h().
 */
function safetyBandThumbs(snap: ReportSnapshot, eventIds: string[]): string {
  const ids = new Set(eventIds)
  const photos = snap.incidentPhotos.filter((p) => ids.has(p.eventId) && p.dataUri)
  if (photos.length === 0) return ''
  const imgs = photos.map((p) => `<img class="sbthumb" src="${p.dataUri}" alt="" />`).join('')
  return `<div class="sbthumbs">${imgs}<span class="sbthumbnote">Full photo${
    photos.length === 1 ? '' : 's'
  } in appendix&nbsp;${photosAppendixLetter(snap)} (incident photos).</span></div>`
}

function safetyFlagRow(f: SafetyFlag, snap: ReportSnapshot): string {
  const tz = snap.timezone
  switch (f.kind) {
    case 'present_blood': {
      const n = f.incidents.length
      const anyFresh = f.incidents.some((i) => i.kind === 'fresh_red')
      const kindPhrase = anyFresh
        ? f.incidents.every((i) => i.kind === 'fresh_red')
          ? 'possible fresh (red) blood'
          : 'possible blood (fresh and/or digested)'
        : 'possible coffee-ground (digested) blood'
      const dates = f.incidents.map((i) => fmtLocalDay(i.occurredAt, tz)).join(', ')
      return flagRow(
        'Possible blood',
        // R2-6 — attribute to the mechanism ("automated photo analysis"), never the brand ("a photo
        // Culprit flagged"). This originally guarded an app-name/patient-name collision (both "Nyx");
        // with the brand now "Culprit" the collision is gone, but mechanism-not-brand is still the
        // correct clinical voice, so the attribution stands. R2-4 — the AI provenance sentence
        // collapses into the uniform badge; the present-only qualifier stays.
        // PR 7 — the flagged photo also leads the band (thumbnail), impossible to miss.
        `<b>${num(n)} vomiting incident${n === 1 ? '' : 's'} (${h(dates)})</b> — ${h(kindPhrase)} on automated photo analysis. ${aiBadge()} Shown because it is present; a photo cannot exclude bleeding.${safetyBandThumbs(
          snap,
          f.incidents.map((i) => i.eventId),
        )}`,
      )
    }
    case 'present_foreign': {
      const n = f.incidents.length
      const notes = f.incidents.map((i) => i.note).filter((x): x is string => !!x)
      // The stored note usually ends with its own terminal punctuation — appending an
      // unconditional "." printed "…is notable.." on the first real artifact.
      const note0 = notes.length ? notes[0].trim() : ''
      const noteBit = note0 ? ` Owner/AI note: ${h(note0)}${/[.!?\u2026]$/.test(note0) ? '' : '.'}` : ''
      const dates = f.incidents.map((i) => fmtLocalDay(i.occurredAt, tz)).join(', ')
      return flagRow(
        'Foreign material',
        // R2-6 mechanism-not-brand + R2-4 badge (see present_blood above). PR 7 — thumbnail leads the band.
        `<b>${num(n)} vomiting incident${n === 1 ? '' : 's'} (${h(dates)})</b> — possible foreign material on automated photo analysis.${noteBit} ${aiBadge()}${safetyBandThumbs(
          snap,
          f.incidents.map((i) => i.eventId),
        )}`,
      )
    }
    case 'intake_decline': {
      const feline =
        f.species === 'cat'
          ? ' In cats, ≥48–72&nbsp;h of markedly reduced intake is a hepatic-lipidosis risk window.'
          : ''
      const baselineBit = ` Baseline read over ${num(f.ratedMealsConsidered)} recent rated meal${
        f.ratedMealsConsidered === 1 ? '' : 's'
      }.`
      // B-213 — the recent-intake SLOPE (cold-read fix): show the trajectory into the flag, not
      // just endpoints, so "N days since a full meal" can't be misread as N days of MARKED
      // anorexia. The pet may have eaten partially in between (all → some → picked → refused);
      // naming that shape is honest AND keeps the escalation (a decline TO refusal, not "picky").
      const recent = snap.provenance.intakeLog.slice(0, 4).reverse() // chronological, up to 4
      const trajectoryBit =
        recent.length >= 2
          ? ` Recent rated meals declined: ${h(recent.map((e) => intakeLabel(e.intakeRating).toLowerCase()).join(' → '))}.`
          : ''
      // "How long off food?" — time since the last FULLY-eaten meal, the number that places a pet
      // in (or before) the feline window above. Worded "without a full meal" (NOT "of reduced
      // intake") because the pet may have eaten partially since — the trajectory above shows it.
      // A fact the vet weighs: it escalates on a long gap and never reassures on a short one; the
      // flag itself still leads, and a recent full meal does NOT retract the decline that fired it.
      const durationBit =
        f.lastFullMealIso && f.hoursSinceLastFullMeal !== null
          ? ` The most recent fully-eaten meal was ${h(fmtLocalDay(f.lastFullMealIso, tz))} — about ${humanizeGap(
              f.hoursSinceLastFullMeal,
            )} without a full meal.`
          : ' No fully-eaten meal is recorded in this window.'
      const appendixBit =
        snap.provenance.intakeLog.length > 0 ? ' Meal-by-meal detail in appendix&nbsp;E (meals &amp; intake).' : ''
      const detail =
        f.trigger === 'refused_normal_food'
          ? `This pet <b>refused a food it normally eats</b>${
              f.refusedFoodLabel ? ` (${h(f.refusedFoodLabel)})` : ''
            }.${baselineBit}`
          : `Intake has been <b>below this pet's baseline for ${num(f.daysBelowBaseline)} consecutive day${
              f.daysBelowBaseline === 1 ? '' : 's'
            }</b>.${baselineBit}`
      return flagRow(
        'Intake',
        `<b>Reduced intake.</b> ${detail}${trajectoryBit}${durationBit}${feline} Recorded as a health signal — not &ldquo;picky.&rdquo;${appendixBit}`,
      )
    }
    case 'chronicity': {
      // activeWeeks is deliberately NOT rendered: it is the engine's phase-stable
      // distribution floor (B-188 buckets), not calendar weeks — next to the calendar
      // weekly chart it read as a contradiction on the first real artifact ("across 5
      // weeks" vs 8 non-zero bars). Span + days + recency carry the clinical picture and
      // every number traces to appendix A.
      return flagRow(
        'Chronicity',
        `<b>${h(symptomLabel(f.symptomType))} has been ongoing ${num(f.spanDays)} day${
          f.spanDays === 1 ? '' : 's'
        }</b> (first noted ~${h(fmtLocalDay(f.firstOnsetIso, tz))}): ${num(f.episodeCount)} episode${
          f.episodeCount === 1 ? '' : 's'
        } on ${num(f.symptomDays)} day${f.symptomDays === 1 ? '' : 's'}; most recent ${num(
          f.daysSinceLastEpisode,
        )} day${f.daysSinceLastEpisode === 1 ? '' : 's'} ago. A sustained pattern over many samples, not a single incident.`,
      )
    }
    case 'symptom_worsening': {
      // windowDays is the comparison-window LENGTH (7 = week-over-week); priorDays/
      // currentDays are the distinct symptom-DAYS WITHIN each window (density) — not the
      // window length. Conflating them printed an untraceable "prior 2 days" (cold-read
      // blocker). Every number here traces to appendix A: {priorCount} episodes in the
      // prior {windowDays}-day window, {currentCount} in the recent one.
      const sym = h(symptomLabel(f.symptomType))
      const w = f.windowDays
      const detail =
        f.trigger === 'more_days'
          ? `${sym} is spreading across more days — ${num(f.currentCount)} episode${
              f.currentCount === 1 ? '' : 's'
            } on ${num(f.currentDays)} of the recent ${num(w)} days, up from ${num(f.priorDays)} day${
              f.priorDays === 1 ? '' : 's'
            } with an episode in the prior ${num(w)} days.`
          : `${sym} rose from ${num(f.priorCount)} episode${f.priorCount === 1 ? '' : 's'} in the prior ${num(
              w,
            )} days to ${num(f.currentCount)} in the recent ${num(w)} days.`
      return flagRow('Worsening', `<b>Rising frequency.</b> ${detail}`)
    }
  }
}

function headline(snap: ReportSnapshot): string {
  const q = snap.clinicalQuestion
  const prim = snap.atAGlance.primarySymptom
  const primPhrase = prim ? `${h(symptomLabel(prim.type).toLowerCase())} (${num(prim.count)} logged)` : 'the logged observations'
  if (q.question === 'diet_trial_working' && snap.diet.activeTrial) {
    const t = snap.diet.activeTrial
    const food = t.foodLabel ? h(t.foodLabel) : 'a diet trial'
    const vet = t.vetName ? `, directed by ${h(t.vetName)}` : ''
    return `
  <div class="headline">Tracking <b>${food}</b> as a diet trial${vet} — day ${num(t.daysElapsed)} of ${num(
    t.targetDurationDays,
  )}. Primary sign logged: <b>${primPhrase}</b>.</div>`
  }
  const hasChronic = snap.safetyFlags.some((f) => f.kind === 'chronicity')
  const chronicBit = hasChronic ? ' Ongoing pattern — see the safety flags above.' : ''
  return `
  <div class="headline">Owner monitoring <b>${primPhrase}</b> over this window — no diet trial; symptom monitoring only.${chronicBit}</div>`
}

function weightBlock(snap: ReportSnapshot): string {
  const w: WeightSection = snap.weight
  // Empty state when there is genuinely nothing to draw. Belt-and-suspenders on `latest`
  // + `trend` (not just `isEmpty`): those are independent fields across the report.ts
  // boundary, and a fabricated "0.0 kg" (from a `?? 0` fallback) would be exactly the
  // invented value this file refuses to render (code-reviewer). Honest "—", never a zero.
  if (w.isEmpty || (!w.latest && !w.trend)) {
    return `
  <div class="weight weight-empty">
    <div class="wt-read"><span class="v">No home weigh-ins recorded.</span><br/>
    <span class="l">A weight trend is a useful GI bellwether; the owner can log weigh-ins in Culprit.</span></div>
  </div>`
  }
  const t = w.trend
  if (!t) {
    // A latest reading exists overall (guaranteed non-null by the guard above), but none
    // inside the window.
    const latest = w.latest!
    return `
  <div class="weight">
    <div class="wt-read"><span class="v num">${h(latest.kg.toFixed(1))}&nbsp;kg</span> <span class="l">&middot; latest weigh-in ${h(
      fmtDay(latest.date),
    )} (before this window)</span><br/>
    <span class="l">No weigh-ins fell inside this window. Descriptive — not a diagnosis; body condition not assessed.</span></div>
  </div>`
  }
  const first = t.seriesKg[0]
  const last = t.latestKg ?? t.seriesKg[t.seriesKg.length - 1]
  const trajectory =
    t.readingCount >= 2
      ? `${num(first.toFixed(1))} &rarr; ${num(last.toFixed(1))}&nbsp;kg`
      : `${num(last.toFixed(1))}&nbsp;kg`
  const dateSpan =
    t.earliestDate && t.latestDate && t.readingCount >= 2
      ? `${h(fmtDay(t.earliestDate))} &ndash; ${h(fmtDay(t.latestDate))}`
      : h(fmtDay(t.latestDate ?? t.earliestDate))
  return `
  <div class="weight">
    ${weightSpark(t.seriesKg)}
    <div class="wt-read">
      <span class="v num">${trajectory}</span> <span class="l">&middot; ${num(t.readingCount)} owner weigh-in${
        t.readingCount === 1 ? '' : 's'
      }, ${dateSpan}</span><br/>
      <span class="l">A home-scale weight trend, read as a trajectory rather than a single point. Descriptive — not a diagnosis, and body condition was not assessed.</span>
    </div>
  </div>`
}

function atAGlance(snap: ReportSnapshot): string {
  const ag = snap.atAGlance
  // Shape-conditional tile set (R2-2). A diet-trial report keeps the trial-oriented tiles
  // (symptom events · trial-days-logged · weight · coverage). A no-trial / symptom-monitoring
  // report — the first real artifact's shape — gets a symptom-trajectory set instead, because on
  // that shape the old tiles duplicated the trend headline, showed the misleading "0 of 25 fully
  // eaten" for a free-fed grazer (R2-3), and restated the range box.
  const tiles = snap.diet.activeTrial ? trialTiles(snap) : monitoringTiles(snap)
  const aside = snap.diet.activeTrial
    ? `counts over the ${num(ag.windowDays)}-day window`
    : `symptom trajectory over the window`
  return `
  <div class="sec">
    <h2>At a glance <span class="aside">${aside}</span></h2>
    <div class="tiles">${tiles.join('')}</div>
  </div>`
}

/** The diet-trial At-a-glance tiles (the pre-round-2 set — appropriate only when a trial is active). */
function trialTiles(snap: ReportSnapshot): string[] {
  const ag = snap.atAGlance
  const tiles: string[] = []

  // Tile 1 — symptom events + breakdown.
  const breakdown = snap.symptoms
    .map((s) => `${num(s.count)} ${h(symptomLabel(s.type).toLowerCase())}`)
    .join(', ')
  tiles.push(
    tile(
      `${ag.totalSymptomIncidents}`,
      `<small>&nbsp;/&nbsp;${ag.windowDays}&nbsp;d</small>`,
      `Symptom events${breakdown ? `<br/>${breakdown}` : ''}`,
    ),
  )

  // Tile 2 — trial days logged, else intake summary, else meal completion.
  const intake = snap.safetyFlags.find((f) => f.kind === 'intake_decline')
  if (ag.trialDaysLogged !== null && snap.diet.activeTrial) {
    tiles.push(
      tile(
        `${ag.trialDaysLogged}`,
        `<small>&nbsp;/&nbsp;${snap.diet.activeTrial.daysElapsed}</small>`,
        `Trial-diet days logged (&ge;1 meal)<br/>not a clean-elimination count`,
      ),
    )
  } else if (intake && intake.kind === 'intake_decline' && intake.trigger === 'consecutive_low') {
    tiles.push(
      tile(
        `${intake.daysBelowBaseline}`,
        `<small>&nbsp;d</small>`,
        `Consecutive days below intake baseline<br/>a health signal, not preference`,
      ),
    )
  } else if (snap.diet.mealCompletion) {
    // A proper finished/rated denominator (avoids a bare, denominator-less count that
    // clashes with the feeding line, cold-read nit). When an intake flag is present the
    // decline itself leads the safety band — the tile points there rather than restating it.
    const mc = snap.diet.mealCompletion
    tiles.push(
      tile(
        `${mc.finishedMeals}`,
        `<small>&nbsp;/&nbsp;${mc.ratedMeals}</small>`,
        `Meals fully eaten (rated meals only)${intake ? '<br/>recent decline flagged above' : ''}`,
      ),
    )
  } else if (intake && intake.kind === 'intake_decline') {
    tiles.push(tile('—', '', `A normally-eaten food was refused<br/>a health signal — see the flags above`))
  } else {
    tiles.push(tile('—', '', `No rated meals in this window`))
  }

  tiles.push(weightTile(snap))
  tiles.push(coverageTile(ag))
  return tiles
}

/**
 * The no-trial / symptom-monitoring tiles (R2-2): episodes-since-onset · trajectory · days-since ·
 * off-diet. Each tile degrades gracefully when there is no primary symptom (a calm no-symptom
 * monitoring report), so the row is always four filled tiles, never a broken grid.
 */
function monitoringTiles(snap: ReportSnapshot): string[] {
  const ag = snap.atAGlance
  const ps = snap.symptoms[0] ?? null
  const tiles: string[] = []

  // Tile 1 — episodes since onset. An onset-scoped denominator, not the window: for a mid-window
  // onset (Nyx: ~46 of 91 days) the window denominator dilutes the rate a vet actually reads.
  if (ps && ag.sinceOnsetDays !== null) {
    tiles.push(
      tile(
        `${ps.count}`,
        `<small>&nbsp;/&nbsp;${ag.sinceOnsetDays}&nbsp;d</small>`,
        `${h(symptomLabel(ps.type))} since onset<br/>on ${num(ps.symptomDays)} of ${num(ag.sinceOnsetDays)} days`,
      ),
    )
  } else {
    tiles.push(
      tile(
        `${ag.totalSymptomIncidents}`,
        `<small>&nbsp;/&nbsp;${ag.windowDays}&nbsp;d</small>`,
        `Symptom events<br/>none logged in this window`,
      ),
    )
  }

  // Tile 2 — trajectory (first half → last half). When the early window is sparsely logged the
  // apparent acceleration is partly an artifact of WHEN logging started, so co-locate that caveat
  // (R2-6) rather than let "2 → 20" read as a clean worsening it can't support.
  if (ps && ps.weeklyBuckets.length >= 2) {
    const nB = ps.weeklyBuckets.length
    const mid = Math.floor(nB / 2)
    const firstCount = ps.weeklyBuckets.slice(0, mid).reduce((a, b) => a + b, 0)
    const lastCount = ps.weeklyBuckets.slice(mid).reduce((a, b) => a + b, 0)
    const firstDays = Math.min(ps.windowDays, mid * 7)
    const lastDays = ps.windowDays - firstDays
    const earlySparse = lastCount > firstCount && ag.firstHalfLoggedDays < Math.max(1, Math.ceil(firstDays / 3))
    const sub = earlySparse
      ? `early window sparsely logged (${num(ag.firstHalfLoggedDays)} of ${num(firstDays)} d)`
      : `first ${num(firstDays)}&nbsp;d &rarr; last ${num(lastDays)}&nbsp;d`
    tiles.push(
      tileHtml(`${firstCount} <span class="arw">&rarr;</span> ${lastCount}`, `Episodes, first &rarr; last half<br/>${sub}`),
    )
  } else {
    tiles.push(weightTile(snap))
  }

  // Tile 3 — days since the most recent episode. ADVERSARIAL GUARD (spec §5.3 / this PR's gate):
  // a gap must NEVER read as recovery. Always framed "not recovery"; when the gap spans days that
  // were mostly unlogged, the logged-day coverage is disclosed so the gap is not mistaken for a
  // real symptom-free stretch (absence of a logged episode is not evidence the sign resolved).
  if (ps && ag.daysSinceLastEpisode !== null) {
    const dsl = ag.daysSinceLastEpisode
    const logged = ag.loggedDaysSinceLastEpisode ?? 0
    // Three registers, so the caveat strength SCALES with the recovery-misread risk (adversarial
    // residual — the old logic gave the biggest, best-logged gap the THINNEST disclaimer):
    //   under-logged gap → show the coverage (it may be a logging gap, not a real absence);
    //   long gap (≥14 d) → the most emphatic "not evidence the signs resolved";
    //   short well-logged gap → the plain non-recovery framing.
    const guard =
      dsl >= 3 && logged < dsl
        ? `${num(logged)} of the last ${num(dsl)} days logged — not recovery`
        : dsl >= 14
          ? `a gap is not evidence the signs resolved`
          : `not a measure of recovery`
    tiles.push(tile(`${dsl}`, `<small>&nbsp;d</small>`, `Since the most recent episode<br/>${guard}`))
  } else {
    tiles.push(coverageTile(ag))
  }

  // Tile 4 — off-diet load.
  tiles.push(offDietTile(snap))
  return tiles
}

function tile(value: string, small: string, label: string): string {
  return `<div class="tile"><div class="v num">${h(value)}${small}</div><div class="l">${label}</div></div>`
}

/** Like tile(), but the value is pre-built HTML (built ONLY from numbers + safe entities, never owner text). */
function tileHtml(valueHtml: string, label: string): string {
  return `<div class="tile"><div class="v num">${valueHtml}</div><div class="l">${label}</div></div>`
}

/** §3.4 weight tile (trend delta / single reading / empty) — shared by both tile sets. */
function weightTile(snap: ReportSnapshot): string {
  if (snap.weight.isEmpty) {
    return tile('—', '', `Weight<br/>no weigh-ins yet — a useful trend to log`)
  }
  if (snap.weight.trend && snap.weight.trend.readingCount >= 2 && snap.weight.trend.deltaKg !== null) {
    const d = snap.weight.trend.deltaKg
    const sign = d > 0 ? '+' : ''
    // Descriptive, but NEVER reassuring — a loss is the danger direction (B-186 guardrail).
    return tile(
      `${sign}${d.toFixed(1)}`,
      `<small>&nbsp;kg</small>`,
      `Weight over ${snap.weight.trend.readingCount} weigh-ins<br/>home-scale trajectory (descriptive)`,
    )
  }
  // IN-WINDOW readings only (weight.trend). weight.latest may be a stale, out-of-window reading —
  // the Weight block discloses it as "(before this window)", but a bare tile cannot carry that
  // caveat, so a months-old weight would read as current in the 60-second scan (code-review find).
  const kg = snap.weight.trend?.latestKg ?? null
  return kg === null
    ? tile('—', '', `Weight<br/>no reading in this window`)
    : tile(`${kg.toFixed(1)}`, `<small>&nbsp;kg</small>`, `Latest weigh-in<br/>single reading — no trend yet`)
}

/** §3.4 logging-coverage tile — shared by both tile sets. */
function coverageTile(ag: AtAGlance): string {
  return tile(`${ag.loggedDays}`, `<small>&nbsp;/&nbsp;${ag.windowDays}</small>`, `Days with any log<br/>gaps could mask events`)
}

/**
 * R2-2 off-diet load tile — leads with the total treat COUNT (the exposure magnitude a vet weighs),
 * not the distinct-item count. On the first artifact the tile led with "2 distinct", which
 * undersold a 343-feeding load until the sub-label was read (cold-read NIT).
 */
function offDietTile(snap: ReportSnapshot): string {
  const treats = snap.diet.treats
  const hf = snap.diet.humanFood
  if (treats.count > 0) {
    const hfBit = hf.count > 0 ? ` &middot; human food ${num(hf.days)} d` : ''
    return tile(`${treats.count}`, `<small>&nbsp;treats</small>`, `Off-diet load<br/>${num(treats.distinctItems)} distinct${hfBit}`)
  }
  if (hf.count > 0) {
    return tile(`${hf.count}`, `<small>&nbsp;feedings</small>`, `Human food<br/>on ${num(hf.days)} day${hf.days === 1 ? '' : 's'}`)
  }
  return tile('—', '', `Off-diet load<br/>none logged in this window`)
}

function symptomTrend(snap: ReportSnapshot): string {
  if (snap.symptoms.length === 0) {
    return `
  <div class="sec">
    <h2>Symptom frequency &amp; trend</h2>
    <div class="empty">No symptom events were logged in this window. Absence of a log is not evidence a symptom did not occur.</div>
  </div>`
  }
  const panels = snap.symptoms.map((s) => symptomPanel(s, snap)).join('')
  // One legend line for the dashed intervention markers on the charts (R2-6) — so a reader who
  // sees a dashed vertical knows it is a start-of-intervention divider, not a data spike, and where
  // the detail lives. Only shown when there is at least one marker to explain.
  const markerLegend =
    snap.concurrentChanges.some((c) => c.bucketIndex !== null)
      ? `<div class="chartlegend">A dashed vertical marks when a diet, medication, or supplement <b>started</b> — each is named in &ldquo;Reading the trend&rdquo; below.</div>`
      : ''
  return `
  <div class="sec">
    <h2>Symptom frequency &amp; trend</h2>
    ${panels}
    ${markerLegend}
    ${readingTheTrend(snap)}
  </div>`
}

function symptomPanel(s: SymptomAggregate, snap: ReportSnapshot): string {
  // First-half vs last-half split for the delta (from the weekly buckets).
  const nB = s.weeklyBuckets.length
  let deltaHtml = ''
  if (nB >= 2) {
    const mid = Math.floor(nB / 2)
    const firstCount = s.weeklyBuckets.slice(0, mid).reduce((a, b) => a + b, 0)
    const lastCount = s.weeklyBuckets.slice(mid).reduce((a, b) => a + b, 0)
    const firstDays = Math.min(s.windowDays, mid * 7)
    const lastDays = s.windowDays - firstDays
    // Co-locate the unlogged-early-window caveat (R2-6): a first→last acceleration is partly an
    // artifact of when logging began. Shown only on a RISE (the misleading direction) when the
    // first half was sparsely logged — so the delta can't be read as a clean worsening it can't bear.
    const earlySparse = lastCount > firstCount && snap.atAGlance.firstHalfLoggedDays < Math.max(1, Math.ceil(firstDays / 3))
    const caveat = earlySparse
      ? `<div class="delta-caveat">early window sparsely logged (${num(snap.atAGlance.firstHalfLoggedDays)} of ${num(
          firstDays,
        )}&nbsp;d)</div>`
      : ''
    deltaHtml = `<div class="delta">first ${num(firstDays)}&nbsp;d <b class="num">${firstCount}</b> &rarr; last ${num(
      lastDays,
    )}&nbsp;d <b class="num">${lastCount}</b></div>${caveat}`
  }
  const markers = snap.concurrentChanges
  return `
    <div class="trend">
      <div class="top">
        <div class="who">${h(symptomLabel(s.type))} <span class="win num">${h(fmtDay(snap.scope.startDate))} &rarr; ${h(
    fmtDay(snap.scope.endDate),
  )}</span></div>
        <div class="big">
          <div class="n num">${s.count}<small>&nbsp;/&nbsp;${s.windowDays}&nbsp;d</small></div>
          ${deltaHtml}
        </div>
      </div>
      ${symptomChart(s, markers, snap.scope.endDate)}
      <div class="subnote">${num(s.symptomDays)} of ${num(s.windowDays)} days had an episode · ${num(
    s.loggedDays,
  )} of ${num(s.windowDays)} days logged.</div>
    </div>`
}

/**
 * The `Reading the trend` note (§3.5, GP-0) — the single highest-consequence misread
 * to prevent. Names EVERY concurrent confound (diet + drug + supplement + free-fed)
 * with its start date, states the co-attribution caution, and calls out logging gaps.
 */
function readingTheTrend(snap: ReportSnapshot): string {
  const changes = snap.concurrentChanges
  const gapDays = snap.atAGlance.windowDays - snap.atAGlance.loggedDays
  const gapBit =
    gapDays > 0
      ? ` Nothing was logged on ${num(gapDays)} of ${num(
          snap.atAGlance.windowDays,
        )} days, which could mask events on those days.`
      : ''

  if (changes.length === 0) {
    return `
    <div class="callout">
      <span class="k">Reading the trend</span>
      Read the trend by how often episodes occur across the window.${gapBit}</div>`
  }

  // Split real in-window CHANGES (something started or stopped mid-window — a dated event with a
  // chart marker) from STANDING context (a diet/regimen present across the whole window, no
  // in-window transition). A standing maintenance diet is NOT a "change" — it is the constant
  // backdrop the trend can't be cleanly attributed against; framing it as a change was the
  // "why call free-feeding an intervention" complaint (PM #6 / B-233). A pre-window drug that
  // ran throughout, or one that STOPPED mid-window (a dated transition), still counts as a change.
  const started = changes.filter((c) => !c.ongoing || c.endInWindow)
  const standing = changes.filter((c) => c.ongoing && !c.endInWindow)
  const parts: string[] = []
  if (started.length > 0) {
    // changeTiming carries the dated transition ("started <date>" / "started <date>, stopped
    // <date>" / "until <date>") — the real in-window change the marker points at.
    const list = started.map((c) => `${changeLabel(c)} (${changeTiming(c)})`).join('; ')
    const s = started.length > 1
    parts.push(`<b>${s ? `${num(started.length)} changes` : 'One change'} overlap${s ? '' : 's'} this window:</b> ${list}.`)
  }
  if (standing.length > 0) {
    // changeTiming renders "ongoing since <date>" for a recorded start (a pre-window steroid) and
    // "ongoing, start not recorded" for a free-fed diet whose only date is a first-food-log, not a
    // real diet start (B-233) — so a maintenance diet is framed as standing context, never a change.
    const list = standing.map((c) => `${changeLabel(c)} (${changeTiming(c)})`).join('; ')
    // "Present during this window" — NOT "across this whole window": a free-fed diet renders
    // null-start (its logged date is unreliable), so a positive full-span duration claim would
    // over-state the data and, for a genuine mid-window free-fed switch the app can't distinguish,
    // could let a vet dismiss a real trigger as "always there" (adversarial direction-of-error).
    parts.push(`<b>Present during this window:</b> ${list}.`)
  }
  // ONE co-attribution caution, keyed to the TOTAL confounder count — a diet PLUS a standing
  // steroid is two things the trend can't be cleanly attributed to, even though only one "changed".
  const caution =
    changes.length > 1
      ? ` A shift in signs over this period <b>cannot be attributed to any one of them alone</b> — they overlap in time.`
      : ` A shift in signs over this period <b>cannot be attributed to it alone</b> while it overlaps.`
  return `
    <div class="callout">
      <span class="k">Reading the trend</span>
      ${parts.join(' ')}${caution}${gapBit}</div>`
}

/**
 * The honest timing clause for a concurrent intervention (adversarial findings): "started
 * <date>" in-window (with a chart marker); "ongoing since <date>" / "ongoing (start not
 * recorded)" for a standing one still active at the window end; "until <date>" when it stopped
 * mid-window — so a completed trial or a finished course is never mislabelled present-tense.
 */
function changeTiming(c: ConcurrentChange): string {
  const start = c.startDate ? h(fmtDay(c.startDate)) : null
  const end = c.endInWindow ? h(fmtDay(c.endInWindow)) : null
  if (!c.ongoing) {
    // Started in-window.
    return end ? `started ${start}, stopped ${end}` : `started ${start}`
  }
  // Started before the window (or unrecorded start).
  if (end) return start ? `from before this window until ${end}` : `until ${end}`
  return start ? `ongoing since ${start}` : 'ongoing, start not recorded'
}

function changeLabel(c: ConcurrentChange): string {
  switch (c.kind) {
    case 'diet_trial':
      return `the trial diet (${h(c.label)})`
    case 'medication':
      return `${h(c.label)} (medication)`
    case 'supplement':
      return `${h(c.label)} (a supplement)`
    case 'free_fed':
      return `free-fed ${h(c.label)}`
  }
}

/** Vomit characteristics (§3.6) — assessed denominators + present-only blood/foreign. */
function vomitCharacteristics(snap: ReportSnapshot): string {
  const p = snap.vomitPhenotype
  if (!p) return ''
  const assessed = p.assessedCount
  const barSegs = CONTENTS_ORDER.filter((c) => p.contentsMix[c] > 0)
  let mixHtml = ''
  let keyHtml = ''
  if (assessed > 0 && barSegs.length > 0) {
    mixHtml = barSegs
      .map((c, i) => {
        const gray = GRAY_RAMP[i % GRAY_RAMP.length]
        // White text on the two darkest fills (index 0–1), ink on the lighter rest — keeps the
        // segment-count label above the WCAG-AA contrast floor on the lightened ramp (code-reviewer).
        const light = i >= 2
        return `<div class="seg" style="flex:${p.contentsMix[c]};background:${gray}${light ? ';color:#16181d' : ''}">${
          p.contentsMix[c]
        }</div>`
      })
      .join('')
    keyHtml = barSegs
      .map(
        (c, i) =>
          `<span class="sw" style="background:${GRAY_RAMP[i % GRAY_RAMP.length]}"></span>${h(contentsLabel(c))} &times;${
            p.contentsMix[c]
          }`,
      )
      .join('&nbsp;&middot;&nbsp; ')
  } else {
    mixHtml = `<div class="seg" style="flex:1;background:#c7c9ce;color:#16181d">no legible read yet</div>`
  }

  // Consistency: name the most-common deterministically (no average). On a TIE for the
  // top count, say so rather than picking one — asserting "most often foamy" when foamy
  // and watery are 2–2 is a false majority (cold-read).
  const consistEntries = Object.entries(p.consistencyDistribution).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )
  let consistBit = ''
  if (consistEntries.length > 0) {
    const maxN = consistEntries[0][1]
    const tied = consistEntries.filter(([, n]) => n === maxN).map(([k]) => k.replace(/_/g, ' '))
    consistBit =
      tied.length === 1
        ? ` Consistency, where legible, was most often ${h(tied[0])}.`
        : ` Consistency, where legible, had no single predominant type (${h(tied.slice(0, 3).join(', '))}).`
  }

  // The four-state denominator disclosure (§5.10) — kept distinct, never collapsed.
  const noPhoto = p.totalIncidents - p.withAnalysis
  const stateBits: string[] = []
  if (p.states.uncertain) stateBits.push(`${p.states.uncertain} uncertain`)
  if (p.states.failed) stateBits.push(`${p.states.failed} not legible`)
  if (p.states.pending) stateBits.push(`${p.states.pending} still processing`)
  if (noPhoto > 0) stateBits.push(`${noPhoto} without a photo`)
  const stateDisclosure = stateBits.length ? ` (${stateBits.join(', ')})` : ''
  const denom = `Across all ${num(p.totalIncidents)} vomiting incident${
    p.totalIncidents === 1 ? '' : 's'
  }; ${num(assessed)} ${assessed === 1 ? 'has' : 'have'} a legible AI read${stateDisclosure}.${consistBit} Per-incident detail in appendix&nbsp;A.`

  // Present-only blood/foreign (§5.9).
  const blood = p.bloodPresent
  const foreign = p.foreignPresent
  let sideHtml = ''
  if (blood.length === 0 && foreign.length === 0) {
    // With ZERO legible photos, "not seen in the legible photos" is vacuously true (cold-read NIT) —
    // say plainly that there was nothing to read; the "not a clearance" caveat carries either way.
    const openLine =
      assessed > 0
        ? '<b>Not seen</b> in the legible photos.'
        : '<b>No photos were legible</b> for a blood or foreign-material read.'
    sideHtml = `
      <div class="limit">
        <span class="h">Blood &amp; foreign material</span>
        ${openLine} This is <b>not</b> a clearance — a photo cannot exclude bleeding, digested (coffee-ground) blood photographs poorly, and these are AI reads. If blood or foreign material <b>is</b> seen in any incident, that incident leads the flags for review at the top of the report.
      </div>`
  } else {
    const lines: string[] = []
    if (blood.length > 0) {
      const dates = blood.map((b) => `${fmtLocalDay(b.occurredAt, snap.timezone)} (${b.kind === 'fresh_red' ? 'fresh red' : 'coffee-ground'})`).join(', ')
      lines.push(`<b>Possible blood — ${num(blood.length)} incident${blood.length === 1 ? '' : 's'}:</b> ${h(dates)}.`)
    }
    if (foreign.length > 0) {
      const dates = foreign.map((fo) => fmtLocalDay(fo.occurredAt, snap.timezone)).join(', ')
      lines.push(`<b>Possible foreign material — ${num(foreign.length)} incident${foreign.length === 1 ? '' : 's'}:</b> ${h(dates)}.`)
    }
    sideHtml = `
      <div class="present">
        <span class="h">Present findings</span>
        ${lines.join('<br/>')}<br/>Shown because present. ${aiBadge()} ${
      blood.length > 0 || foreign.length > 0 ? 'These lead the flags for review above.' : ''
    }
      </div>`
  }

  return `
  <div class="sec">
    <h2>Vomit characteristics <span class="aitag">Automated photo analysis &middot; owner-reviewable</span></h2>
    <p class="note lead">Colour, contents, and consistency are read automatically from the photo the owner took of each incident, then aggregated below. Each read is shown for the owner to confirm; none carries a diagnosis or a verdict on a single incident.</p>
    <div class="pheno">
      <div>
        <div class="barmix">${mixHtml}</div>
        <div class="mixkey">${keyHtml}<br/>${denom}</div>
      </div>
      ${sideHtml}
    </div>
  </div>`
}

/** Stool characteristics (§3.7) — normal vs loose + present-only blood/mucus note. */
function stoolCharacteristics(snap: ReportSnapshot): string {
  const st: StoolCharacteristics | null = snap.stool
  if (!st) return ''
  const segs: string[] = []
  const key: string[] = []
  if (st.normalCount > 0) {
    segs.push(`<div class="seg" style="flex:${st.normalCount};background:#5f636c">${st.normalCount}</div>`)
    key.push(`<span class="sw" style="background:#5f636c"></span>Normal / formed &times;${st.normalCount}`)
  }
  if (st.looseCount > 0) {
    segs.push(`<div class="seg" style="flex:${st.looseCount};background:#1a1c22">${st.looseCount}</div>`)
    key.push(`<span class="sw" style="background:#1a1c22"></span>Loose / watery &times;${st.looseCount}`)
  }
  return `
  <div class="sec">
    <h2>Stool characteristics <span class="aside">${num(st.total)} stool event${
      st.total === 1 ? '' : 's'
    } · owner-described</span></h2>
    <div class="pheno">
      <div>
        <div class="barmix">${segs.join('')}</div>
        <div class="mixkey">${key.join('&nbsp;&middot;&nbsp; ')}<br/>Owner-described over ${num(st.loggedDays)} of ${num(
    st.windowDays,
  )} days logged. Loose-stool events are itemised in the symptom log (appendix&nbsp;A); normal stools are counted from the owner's logs, not itemised.</div>
      </div>
      <div class="limit">
        <span class="h">Blood &amp; mucus</span>
        <b>Not reported</b> by the owner. This is <b>not</b> an exam finding — large-bowel signs like fresh blood or mucus are not reliably owner-detected without a photo or a fecal check. Absence here is not evidence of their absence.
      </div>
    </div>
  </div>`
}

/**
 * Distinct food-item labels, capped, with an honest "+N more" (never a silent truncation).
 * Human food is logged per-feeding, so four table-scraps of the same item would otherwise
 * render "Ground beef, Ground beef, Ground beef, Ground beef" — a broken-looking list that
 * makes a vet discount the page (cold-read + adversarial finding A6). The count/days stay on
 * the line; this only collapses the ITEM list to what's distinct.
 */
function distinctLabels(items: ReadonlyArray<{ label: string | null }>, cap: number): string {
  const seen: string[] = []
  for (const it of items) {
    const l = it.label ?? 'item'
    if (!seen.includes(l)) seen.push(l)
  }
  const shown = seen.slice(0, cap).map((l) => h(l)).join(', ')
  return seen.length > cap ? `${shown} +${seen.length - cap} more` : shown
}

/** Diet, feeding, medications & supplements (§3.8) — B-040, B-102, B-117, timing. */
function dietMeds(snap: ReportSnapshot): string {
  const d: DietSummary = snap.diet
  const left: string[] = []
  const right: string[] = []

  if (d.activeTrial) {
    const t = d.activeTrial
    left.push(
      kv(
        'Trial diet',
        `${t.foodLabel ? h(t.foodLabel) : 'Trial diet'}${
          t.primaryProtein ? ` (${h(t.primaryProtein)})` : ''
        } &middot; started ${h(fmtDay(t.startedAt))} &middot; target ${num(t.targetDurationDays)}&nbsp;d, now day ${num(
          t.daysElapsed,
        )}.`,
      ),
    )
  } else {
    left.push(kv('Diet', 'No active diet trial in this window — symptom monitoring.'))
  }

  // Feeding: meal completion (meals-only) + free-fed verbatim string (B-040).
  const isFreeFed = d.freeFed.length > 0
  const hasIntakeFlag = snap.safetyFlags.some((f) => f.kind === 'intake_decline')
  const freeFedLabels = d.freeFed.map((f) => (f.foodLabel ? h(f.foodLabel) : 'free-fed food')).join(', ')
  const feedBits: string[] = []
  if (isFreeFed && !hasIntakeFlag) {
    // R2-3 — a free-fed grazer with NO decline flag: DESCRIBE, don't score. "0 of 25 meals fully
    // eaten" reads as anorexia (feline lipidosis territory) for a cat that grazes across the day;
    // the intake-decline engine fired NO flag, so this is normal grazing. Framing only — the engine
    // and its fully-eaten anchor are untouched (clinical-guardrails floor). The verbatim B-040
    // string stays. If a decline flag WERE present, the else-branch keeps the scored figure and the
    // flag leads the safety band.
    const mc = d.mealCompletion
    const typically = mc && mc.intakeMode ? `, typically &ldquo;${h(intakeLabel(mc.intakeMode).toLowerCase())}&rdquo;` : ''
    // #8 — NAME the foods fed as meals (e.g. a wet diet) on page 1, not just a bare "N discrete
    // meals": the first real artifact left Nyx's wet food unnamed and cited a non-existent appendix.
    const mealNames = distinctLabels(d.mealItems.map((i) => ({ label: i.foodLabel })), 2)
    const mealsBit = mc
      ? ` Also fed as meals: ${mealNames} (${num(mc.ratedMeals)} meal${
          mc.ratedMeals === 1 ? '' : 's'
        }${typically}; itemised in appendix&nbsp;E).`
      : ''
    feedBits.push(`Primarily free-fed: ${freeFedLabels}. <b>Intake not directly observed.</b>${mealsBit}`)
  } else {
    if (d.mealCompletion) {
      feedBits.push(
        `${num(d.mealCompletion.finishedMeals)} of ${num(
          d.mealCompletion.ratedMeals,
        )} rated meals fully eaten (owner-observed; treats + free-fed excluded). Meals itemised in appendix&nbsp;E.`,
      )
    }
    if (isFreeFed) {
      // §4 / B-040 — the verbatim string, non-negotiable.
      feedBits.push(`Free-fed: ${freeFedLabels}. <b>Intake not directly observed.</b>`)
    }
  }
  if (feedBits.length === 0) feedBits.push('No rated meals logged in this window.')
  left.push(kv('Feeding', feedBits.join(' ')))

  // Off-diet (human food line B-102 + treats).
  const offBits: string[] = []
  if (d.humanFood.count > 0) {
    const items = distinctLabels(d.humanFood.items, 6)
    // Trial-aware framing (adversarial finding A4): "the #1 diet-trial confounder" is the
    // B-102 wedge phrasing, but it asserts a trial. On a no-trial monitoring report it reads
    // as a self-contradiction ("no diet trial" then "the diet-trial confounder").
    const confounderTag = d.activeTrial ? ' — the #1 diet-trial confounder.' : ' — a common dietary confounder.'
    offBits.push(
      `Human food on ${num(d.humanFood.days)} day${d.humanFood.days === 1 ? '' : 's'} (${num(
        d.humanFood.count,
      )} feeding${d.humanFood.count === 1 ? '' : 's'}: ${items})${confounderTag}`,
    )
  }
  if (d.treats.count > 0) {
    offBits.push(`${num(d.treats.count)} treat${d.treats.count === 1 ? '' : 's'} (${num(d.treats.distinctItems)} distinct). Dates in appendix&nbsp;C.`)
  }
  if (offBits.length === 0) offBits.push('None logged in this window.')
  left.push(kv('Off-diet', offBits.join(' ')))

  // Medications (B-117) + supplements as concurrent interventions.
  const meds = snap.medications.filter((m) => m.overlapsWindow && !m.isSupplement)
  const supps = snap.medications.filter((m) => m.overlapsWindow && m.isSupplement)
  // Ad-hoc / OTC doses with no configured regimen (§3.8 orphan-dose gap). Already window-scoped.
  const unlinked = snap.unlinkedMedications
  if (meds.length === 0 && supps.length === 0 && unlinked.length === 0) {
    right.push(kv('Medication', 'None logged in this window.'))
  }
  for (const m of meds) {
    right.push(kv(h(m.drugName), medicationLine(m)))
  }
  for (const u of unlinked) {
    right.push(kv(h(u.drugName), unlinkedMedLine(u)))
  }
  for (const m of supps) {
    right.push(
      kv(
        'Supplement',
        // "a concurrent intervention over this window" is self-contained; the old copy claimed
        // "named in the trend note above," but that note only renders when symptom events exist
        // (else it points at nothing) — adversarial finding A1 sibling. The note DOES name every
        // overlapping supplement now, so the phrasing holds when it renders without asserting it.
        `${h(m.drugName)}${m.scheduleNotes ? ` &middot; ${h(m.scheduleNotes)}` : ''} &middot; started ${h(
          fmtDay(m.startedAt),
        )} (owner-reported, OTC) — a concurrent change over this window.`,
      ),
    )
  }

  // Timing vs symptoms (associational; §3.8).
  right.push(kv('Timing vs symptoms', timingLine(snap.correlation, snap)))

  // Single aligned label column (PM #: the two-column split read as messy, especially with a sparse
  // meds column). One definition-list of Diet · Feeding · Off-diet · Medication · Timing, values
  // aligned off a fixed label gutter — the WSAVA-form register a vet scans top-to-bottom.
  return `
  <div class="sec">
    <h2>Diet, feeding, medications &amp; supplements</h2>
    <div class="kvcol">${left.join('')}${right.join('')}</div>
    <p class="ref">Full event log, diet history, off-diet exposures${
      mealsAppendixVisible(snap) ? ', medications &amp; meals: appendices A&ndash;E' : ' &amp; medications: appendices A&ndash;D'
    }.</p>
  </div>`
}

function kv(k: string, v: string): string {
  return `<div class="kv"><span class="k">${k}</span><span>${v}</span></div>`
}

/**
 * The regimen's date clause. A COMPLETED / STOPPED course carries its end date so the meds line and
 * Appendix D agree with the "Reading the trend" callout (which already says "stopped <date>") — a
 * cold-read coherence catch: a vet scanning only the meds column otherwise reads an ended ~2-week
 * course as still-active with an ongoing adherence gap. Still-active regimens read "since <start>".
 */
function regimenDates(m: MedicationAdherence): string {
  if (m.endedAt && (m.status === 'completed' || m.status === 'stopped')) {
    const verb = m.status === 'completed' ? ' (course complete)' : ' (stopped)'
    return `${h(fmtDay(m.startedAt))} &ndash; ${h(fmtDay(m.endedAt))}${verb}`
  }
  return `since ${h(fmtDay(m.startedAt))}`
}

/** The B-117 adherence line — "adherence not tracked" on zero doses, NEVER "compliant". */
function medicationLine(m: MedicationAdherence): string {
  // Dedupe strength vs dose-amount — a 250 mg tablet given as a 250 mg dose is ONE
  // "250 mg", not "250 mg · 250 mg" (cold-read nit). Show the dose only when it adds info.
  const doseBit = m.doseAmount && m.doseAmount !== m.strength ? h(m.doseAmount) : null
  const regimen = [
    m.strength ? h(m.strength) : null,
    doseBit,
    m.route ? `by ${h(m.route)}` : null,
    m.dosesPerDay != null ? `${m.dosesPerDay}×/day` : 'as needed',
    m.indication ? `for ${h(m.indication)}` : null,
    regimenDates(m),
  ]
    .filter(Boolean)
    .join(' &middot; ')

  if (m.adherenceState === 'not_tracked') {
    // §4 trap — a zero-dose drug is not "compliant".
    return `${regimen}. <b>Adherence not tracked</b> — no doses logged in this window.`
  }
  const administered = m.givenDoses + m.partialDoses
  const expected = m.expectedDoses != null ? ` of ${num(m.expectedDoses)}` : ''
  const extras: string[] = []
  if (m.partialDoses) extras.push(`${m.partialDoses} partial`)
  if (m.unconfirmedDoses) extras.push(`${m.unconfirmedDoses} unconfirmed`)
  extras.push(m.refusedDoses ? `${m.refusedDoses} refused` : 'none refused')
  if (m.missedDoses) extras.push(`${m.missedDoses} missed`)
  return `${regimen}. Adherence: ${num(administered)}${expected} dose${administered === 1 ? '' : 's'} on ${num(
    m.daysWithDose,
  )} of ${num(m.elapsedDaysInWindow)} days; ${extras.join(', ')}.`
}

/** Date range for an unlinked-dose group — "on Jul 10" for a single day, else "Jul 2 – Jul 10". */
function unlinkedSpan(u: UnlinkedMedicationGroup): string {
  return u.firstDate === u.lastDate
    ? `on ${h(fmtDay(u.lastDate))}`
    : `${h(fmtDay(u.firstDate))}&ndash;${h(fmtDay(u.lastDate))}`
}

/** Page-1 line for a drug the owner dosed with no configured regimen (§3.8). Factual counts only —
 *  no adherence RATE (no schedule to divide by), and an unconfirmed dose is never read as given. */
function unlinkedMedLine(u: UnlinkedMedicationGroup): string {
  const meta = [u.strength ? h(u.strength) : null, u.route ? `by ${h(u.route)}` : null]
    .filter(Boolean)
    .join(' &middot; ')
  const prefix = meta ? `${meta}. ` : ''
  const span = unlinkedSpan(u)
  const head =
    u.administeredDoses > 0
      ? `${num(u.administeredDoses)} dose${u.administeredDoses === 1 ? '' : 's'} given ${span}`
      : `${num(u.totalDoses)} dose${u.totalDoses === 1 ? '' : 's'} logged ${span}`
  const extras: string[] = []
  if (u.partialDoses) extras.push(`${num(u.partialDoses)} partial`)
  if (u.unconfirmedDoses) extras.push(`${num(u.unconfirmedDoses)} unconfirmed`)
  if (u.refusedDoses) extras.push(`${num(u.refusedDoses)} refused`)
  if (u.missedDoses) extras.push(`${num(u.missedDoses)} missed`)
  const extrasBit = extras.length ? ` ${extras.join(', ')}.` : ''
  const src = u.isSupplement ? 'owner-reported, OTC' : 'owner-reported'
  return `${prefix}${head} (${src}; no regimen configured).${extrasBit}`
}

function timingLine(c: CorrelationSummary, snap: ReportSnapshot): string {
  if (c.hasEstablished && c.established.length > 0) {
    const e = c.established[0]
    return `${h(e.protein)} reached the established association threshold for ${h(
      symptomLabel(e.symptomType).toLowerCase(),
    )} over this window (${num(e.caseExposed)}/${num(e.matchedPairs)} exposed cases vs ${num(
      e.controlExposed,
    )} controls; p&nbsp;=&nbsp;${e.pValue.toFixed(3)}). An association, <b>not a proven cause</b>. Detail in appendix&nbsp;C.`
  }
  const staple = c.stapleProtein
    ? ` — ${h(c.stapleProtein)} is in most of what ${h(snap.signalment.name)} eats, so it can't be isolated`
    : ''
  const timing = c.timing
    .map((t) => {
      if (t.kind === 'postprandial_timing' && 'rapidCount' in t.detail) {
        return `${num(t.detail.rapidCount)} of ${num(t.detail.eligibleCount)} timed ${h(
          symptomLabel(t.symptomType).toLowerCase(),
        )} episodes fell within ~${num(t.detail.rapidWindowMinutes)} min of eating`
      }
      return ''
    })
    .filter(Boolean)
    .join('; ')
  const timingBit = timing ? ` ${timing} — co-occurrence, not cause.` : ''
  return `<b>No single food/protein reached the established correlation threshold</b> over this window${staple}.${timingBit} Detail in appendix&nbsp;C.`
}

// ── Footer (per page/section) ────────────────────────────────────────────────────

function footer(snap: ReportSnapshot, sectionLabel: string): string {
  // R2-6 — an explicit "Patient:" label. It originally disambiguated the pet's name from the app
  // name (both "Nyx" on the first real artifact); with the brand now "Culprit" that collision is
  // gone, but the label is good PIMS practice so it stays. The owner is the client, labelled as
  // such for PIMS filing.
  const owner = snap.signalment.ownerName ? ` &middot; Owner: ${h(snap.signalment.ownerName)}` : ''
  return `
  <div class="foot">
    <div class="fbrand">
      <div class="fw">
        <span class="w">Culprit</span>
        <div class="scan">Patient: ${h(snap.signalment.name)}${owner} &middot; owner-reported observations &middot; associational, not a diagnosis.</div>
      </div>
    </div>
    <div class="pg">${h(fmtRange(snap.scope.startDate, snap.scope.endDate))}<br/>${h(sectionLabel)}</div>
  </div>`
}

// ── Appendices ────────────────────────────────────────────────────────────────────

/**
 * R2-5 — a divider between the self-sufficient clinical summary (page 1) and the appendices, so a
 * vet who has read the 60-second summary knows the rest is the reference record, and can find the
 * section behind any figure. Rendered at the top of the first appendix page (not its own sheet —
 * true per-section page numbers are a print-CSS / B-144 build item).
 */
/**
 * Appendix E (meals & intake) renders when the owner logged meals OR an intake flag fired. ONE
 * source of truth so the letterhead range, the divider, the page-1 ref line, and the appendix's
 * own guard never drift apart — the exact copy-paste-boolean drift class that produced round-2's
 * dangling-appendix bug (code-reviewer catch).
 */
function mealsAppendixVisible(snap: ReportSnapshot): boolean {
  return snap.diet.mealItems.length > 0 || snap.provenance.intakeLog.length > 0
}

/**
 * Incident-photo appendix (PR 7). Renders whenever any in-window incident was photographed.
 * Lettering: it is the LAST lettered appendix, after the (conditional) meals appendix — so it is
 * 'F' when meals render and 'E' when they don't (the meals-appendix 'E' cross-references, all
 * gated behind mealsAppendixVisible, never collide). The closing "How to read" page stays
 * unlettered. Kept as ONE source of truth so the letterhead orient line, the appendix divider,
 * this appendix's own heading, and the legend never drift apart.
 */
/**
 * The incident-photos appendix renders when there is a retained photo OR an incident that was
 * photographed + read but whose photo the owner has since removed (which must be DISCLOSED so the
 * "every photographed incident" claim never silently contradicts the analysis-scoped counts on
 * page 1 / Appendix A — vet-report-cold-read finding, PR 7).
 */
function hasIncidentPhotos(snap: ReportSnapshot): boolean {
  return snap.incidentPhotos.length > 0 || snap.incidentPhotosAnalyzedNoRetained > 0
}
function photosAppendixLetter(snap: ReportSnapshot): string {
  return mealsAppendixVisible(snap) ? 'F' : 'E'
}
/** The last LETTERED appendix (drives the page-1 orient line + the divider): photos → meals → D. */
function lastAppendixLetter(snap: ReportSnapshot): string {
  if (hasIncidentPhotos(snap)) return photosAppendixLetter(snap)
  return mealsAppendixVisible(snap) ? 'E' : 'D'
}

function appendixDivider(snap: ReportSnapshot): string {
  const eBit = mealsAppendixVisible(snap) ? ' &middot; E — meals &amp; intake' : ''
  const photoBit = hasIncidentPhotos(snap) ? ` &middot; ${photosAppendixLetter(snap)} — incident photos` : ''
  return `
  <div class="divider">
    <span class="k">End of clinical summary</span>
    The appendices are the reference record behind every figure on page&nbsp;1: A — event log &middot; B — diet history &middot; C — off-diet exposures &middot; D — medications${eBit}${photoBit} &middot; How to read this report.
  </div>`
}

function appendixA(snap: ReportSnapshot): string {
  const rows = snap.provenance.symptomLog.map((e) => symptomLogRow(e, snap.timezone)).join('')
  const count = snap.provenance.symptomLog.length
  const eN = snap.provenance.estimatedOrWindowCount
  const estBit =
    eN > 0
      ? ` ${num(eN)} of them ${eN === 1 ? 'has' : 'have'} an estimated or windowed time (found later, not witnessed).`
      : ''
  return `
<section class="page">
  ${appendixDivider(snap)}
  <p class="appx-title serif">Appendix A — Symptom event log</p>
  <p class="appx-sub">Every symptom event in the window, in order. &ldquo;Occurred&rdquo; is the owner's best account of when it happened; for events found later it is a time range, not the time it was noticed.${estBit} For photographed vomiting events the automated photo-analysis fields are shown beneath the note (owner-reviewable).</p>
  <table>
    <caption>${num(count)} symptom event${count === 1 ? '' : 's'} &middot; ${h(fmtRange(snap.scope.startDate, snap.scope.endDate))}</caption>
    <thead>
      <tr>
        <th style="width:64px">Date</th>
        <th>Type</th>
        <th style="width:140px">Occurred (owner-reported)</th>
        <th style="width:58px">Logged</th>
        <th>Owner note &amp; photo findings</th>
      </tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="5">No symptom events in this window.</td></tr>`}</tbody>
  </table>
  <p class="note" style="margin-top:9px"><b>Why a range and not a time:</b> a vomit found at 07:44 but occurring around 04:00 changes the interval from the prior meal from minutes to hours — a clinically different picture. Where the owner did not witness the event, the window it occurred in is shown, not the time it was noticed. Photo findings are Culprit's read of the owner's photo, owner-reviewable; they never carry a diagnosis or a single-incident verdict (that stays in the app, off this report).</p>
  ${footer(snap, 'Appendix A — event log')}
</section>`
}

/**
 * The owner-reviewable, PRESENT-only photo-analysis fields as one inline string — shared by
 * Appendix A's symptom log AND Appendix E's incident-photo caption, so the two can never phrase the
 * same read differently. Completed → colour · contents · consistency · (present-only) blood/foreign;
 * a non-completed state → the honest "not clear enough to read" (never a positive "no", §5.9).
 * Returns '' when there is no phenotype. NEVER an n=1 verdict/recommendation.
 */
function phenotypeFieldBits(ph: SymptomLogPhenotype | null): string {
  if (!ph) return ''
  if (ph.status === 'completed') {
    const bits = [
      ph.colour ? `colour ${h(ph.colour)}` : null,
      ph.contentsCategory ? `contents ${h(contentsLabel(ph.contentsCategory).toLowerCase())}` : null,
      ph.consistency ? `consistency ${h(ph.consistency.replace(/_/g, ' '))}` : null,
      // PRESENT-only (§5.9): render blood/foreign ONLY when present; silence otherwise.
      ph.bloodPresent ? `<b>blood ${ph.bloodPresent === 'fresh_red' ? 'possible fresh red' : 'possible coffee-ground'} (AI, unconfirmed)</b>` : null,
      ph.foreignPresent ? `<b>foreign material possible (AI, unconfirmed)${ph.foreignNote ? ` — ${h(ph.foreignNote)}` : ''}</b>` : null,
    ].filter(Boolean)
    return bits.join(' &middot; ')
  }
  const stateWord =
    ph.status === 'failed' ? 'present but not legible' : ph.status === 'uncertain' ? 'read uncertain' : 'still processing'
  return `${h(stateWord)} — not clear enough to read`
}

function symptomLogRow(e: SymptomLogEntry, tz: string | null): string {
  const dateCell = fmtLocalDay(e.occurredAt, tz)
  const occCell = occurredCell(e, tz)
  const loggedCell = fmtLocalTime(e.loggedAt, tz)
  const dup = e.dupCount > 1 ? ` <span class="conf">${e.dupCount} logs</span>` : ''
  let noteCell = e.notes ? h(e.notes) : ''
  if (e.phenotype) {
    noteCell += `<span class="fields"><b>Photo:</b> ${phenotypeFieldBits(e.phenotype)}</span>`
  }
  return `<tr><td class="num">${h(dateCell)}</td><td>${h(symptomLabel(e.type))}</td><td>${occCell}${dup}</td><td class="num">${h(
    loggedCell,
  )}</td><td>${noteCell || '&mdash;'}</td></tr>`
}

/** B-010 occurred cell — witnessed=exact+seen, estimated=~time+est, window=range+range. */
function occurredCell(e: SymptomLogEntry, tz: string | null): string {
  const conf = e.occurredAtConfidence
  if (conf === 'window' && !(e.occurredAtEarliest && e.occurredAtLatest)) {
    // One-sided window — the "Sometime before/after" capture mode records a single bound
    // (occurred_at IS that bound, B-010 addendum). The first real artifact rendered these as
    // bare, precise-looking points with no tag while the preamble still counted them as
    // windowed — the exact false precision §4/B-010 forbids. Render the bound the owner
    // actually asserted; a boundless window (shouldn't exist) degrades to an estimate mark.
    if (e.occurredAtLatest) {
      return `${num(`before ${fmtLocalTime(e.occurredAtLatest, tz)}`)} <span class="conf">range</span>`
    }
    if (e.occurredAtEarliest) {
      return `${num(`after ${fmtLocalTime(e.occurredAtEarliest, tz)}`)} <span class="conf">range</span>`
    }
    return `${num(`~${fmtLocalTime(e.occurredAt, tz)}`)} <span class="conf">est</span>`
  }
  if (conf === 'window' && e.occurredAtEarliest && e.occurredAtLatest) {
    return `${num(`~${fmtLocalTime(e.occurredAtEarliest, tz)}–${fmtLocalTime(e.occurredAtLatest, tz)}`)} <span class="conf">range</span>`
  }
  if (conf === 'estimated') {
    return `${num(`~${fmtLocalTime(e.occurredAt, tz)}`)} <span class="conf">est</span>`
  }
  if (conf === 'witnessed') {
    return `${num(fmtLocalTime(e.occurredAt, tz))} <span class="conf">seen</span>`
  }
  // null confidence (legacy rows logged before B-010) — tag it explicitly. A bare time in a
  // column of tagged rows reads as MORE certain than a witnessed one, the reassuring
  // direction; the honest render says the confidence was never recorded.
  return `${num(fmtLocalTime(e.occurredAt, tz))} <span class="conf">unspecified</span>`
}

/**
 * Meals & intake appendix (Appendix E). Renders whenever the owner logged meals in the window —
 * NOT only on an intake-decline flag (#7/#8: the first real artifact discarded the wet-diet meals
 * before render, so a substantial part of the diet was invisible and the page-1 feeding line cited
 * a non-existent appendix). Two layers:
 *   1. A grouped meal-item summary (always, when meals were logged) — the actual foods eaten as
 *      meals, grouped like the off-diet table so a wet diet is named + traceable.
 *   2. The detailed recent-meals list + last-full-meal anchor (B-213) — ONLY when a reduced-intake
 *      flag fired, giving the page-1 intake figures ("how long off food") their meal-by-meal home.
 * Escalate-only voice throughout: a declined meal is a possible health signal, NEVER "picky";
 * free-fed food is unobserved, unrated, and never appears here.
 *
 * Lettering: this is appendix E and the closing "How to read" page is deliberately unlettered, so
 * a report with no logged meals runs A–D with no gap (a hardcoded "F" read as a missing page on
 * the first real artifact).
 */
function mealsAppendix(snap: ReportSnapshot): string {
  const items = snap.diet.mealItems
  const log: IntakeLogEntry[] = snap.provenance.intakeLog
  if (!mealsAppendixVisible(snap)) return ''
  return `
<section class="page">
  <p class="appx-title serif">Appendix E — Meals &amp; intake</p>
  <p class="appx-sub">The meals the owner logged in this window — the food fed as discrete meals, distinct from free-fed food and treats (which appear in appendix&nbsp;C). &ldquo;Intake&rdquo; is what the owner recorded after each meal; a declined or barely-touched meal is a possible health signal, never &ldquo;picky.&rdquo; Free-fed food is not directly observed and is not rated, so it does not appear here.</p>
  ${items.length > 0 ? mealItemsTable(snap, items) : ''}
  ${log.length > 0 ? intakeDetailTable(snap, log) : ''}
  ${footer(snap, 'Appendix E — meals & intake')}
</section>`
}

/** The grouped meal-item summary — one row per food (label · protein · feedings · span · typical intake). */
function mealItemsTable(snap: ReportSnapshot, items: DietSummary['mealItems']): string {
  const total = items.reduce((a, i) => a + i.count, 0)
  const rows = items
    .map((i) => {
      const span =
        i.firstDate && i.lastDate && i.firstDate !== i.lastDate
          ? `${h(fmtDay(i.firstDate))} &ndash; ${h(fmtDay(i.lastDate))}`
          : h(fmtDay(i.firstDate ?? i.lastDate))
      const feedings = i.count > 1 ? `&times;${num(i.count)}` : num(1)
      const typical = i.intakeMode ? h(intakeLabel(i.intakeMode)) : '&mdash;'
      return `<tr><td>${i.foodLabel ? h(i.foodLabel) : '&mdash;'}</td><td>${
        i.primaryProtein ? h(i.primaryProtein) : ''
      }</td><td class="c num">${feedings}</td><td class="num">${span}</td><td>${typical}</td></tr>`
    })
    .join('')
  return `
  <table>
    <caption>${num(total)} logged meal${total === 1 ? '' : 's'} across ${num(items.length)} food${
    items.length === 1 ? '' : 's'
  } &middot; ${h(fmtRange(snap.scope.startDate, snap.scope.endDate))}</caption>
    <thead><tr><th>Food</th><th style="width:104px">Protein</th><th class="c" style="width:64px">Meals</th><th style="width:118px">Dates</th><th style="width:120px">Typical intake</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

/**
 * The detailed recent-meals list + last-full-meal anchor (B-213) — traceability for the page-1
 * reduced-intake flag. Most-recent-first; the last fully-eaten meal is tagged so the page-1
 * "last full meal" number has an unambiguous home, pinned back in past the cap when needed.
 */
function intakeDetailTable(snap: ReportSnapshot, log: IntakeLogEntry[]): string {
  const hidden = snap.provenance.intakeLogHiddenOlder
  const rows = log
    .map((e) => {
      const brk = e.pinned
        ? `<tr><td colspan="4" class="omit">&hellip; ${num(hidden)} earlier rated meal${
            hidden === 1 ? '' : 's'
          } omitted; the last fully-eaten meal (page&nbsp;1 anchor) is pinned below &hellip;</td></tr>`
        : ''
      return brk + intakeLogRow(e, snap.timezone)
    })
    .join('')
  const hasFull = log.some((e) => e.isLastFullMeal)
  const hiddenBit =
    hidden > 0
      ? ` ${num(hidden)} earlier rated meal${hidden === 1 ? '' : 's'} in this window ${
          hidden === 1 ? 'is' : 'are'
        } not shown (the most recent are listed${hasFull && log.some((e) => e.pinned) ? ', plus the last full meal' : ''}).`
      : ''
  // Only claim a tagged anchor row when one exists — a window with no fully-eaten meal has none.
  const anchorSentence = hasFull
    ? 'the &ldquo;last fully-eaten meal&rdquo; on page&nbsp;1 is the row tagged &ldquo;last full meal&rdquo; here; the time since it is how long the pet has gone without a full meal, which sets the urgency of a reduced-intake flag (especially the feline 48&ndash;72&nbsp;h window)'
    : 'no fully-eaten meal was recorded in this window, so page&nbsp;1 shows no &ldquo;last full meal&rdquo; and none is tagged here'
  return `
  <p class="note lead" style="margin-top:16px"><b>Recent rated meals</b> — the meals behind the reduced-intake flag on page&nbsp;1, most recent first.${hiddenBit}</p>
  <table>
    <caption>${num(log.length)} rated meal${log.length === 1 ? '' : 's'} shown &middot; ${h(
    fmtRange(snap.scope.startDate, snap.scope.endDate),
  )}</caption>
    <thead><tr><th style="width:64px">Date</th><th style="width:58px">Time</th><th>Food</th><th style="width:150px">Intake</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="note" style="margin-top:9px"><b>Reading this:</b> ${anchorSentence}. Absence of a full meal is not evidence the pet ate nothing — only that no fully-eaten meal was recorded.</p>`
}

function intakeLogRow(e: IntakeLogEntry, tz: string | null): string {
  const tag = e.isLastFullMeal ? ` <span class="conf">last full meal</span>` : ''
  const eaten = e.intakeRating === 'all' || e.intakeRating === 'most'
  // Below-baseline ratings get weight so the decline reads down the column; a full/most meal
  // stays plain. NOT a colour or a verdict — just typographic emphasis on the concerning rows.
  const intakeCell = eaten ? h(intakeLabel(e.intakeRating)) : `<b>${h(intakeLabel(e.intakeRating))}</b>`
  return `<tr><td class="num">${h(fmtLocalDay(e.occurredAt, tz))}</td><td class="num">${h(
    fmtLocalTime(e.occurredAt, tz),
  )}</td><td>${e.foodLabel ? h(e.foodLabel) : '&mdash;'}</td><td>${intakeCell}${tag}</td></tr>`
}

/**
 * Appendix E/F — incident photos (PR 7). Every photographed in-window incident, most-recent-first,
 * each with its owner-reviewable AI read (present-only; never an n=1 verdict) and owner note. All
 * photos are baked into the artifact (and the PDF), so the record the vet reviews is complete; the
 * bytes are EXIF/GPS-stripped and downscaled server-side (index.ts). A photo whose server-side
 * fetch failed still lists its incident + AI read, with an honest "could not be embedded"
 * placeholder — its metadata is not silently dropped. Incidents that were photographed + read but
 * whose photo the owner has since removed are DISCLOSED (not shown as a card — there is no image),
 * so this appendix's "every photographed incident" claim never silently contradicts the
 * analysis-scoped "Photo:" lines in Appendix A / the phenotype counts on page 1.
 */
function incidentPhotosAppendix(snap: ReportSnapshot): string {
  if (!hasIncidentPhotos(snap)) return ''
  const letter = photosAppendixLetter(snap)
  const photos = snap.incidentPhotos
  const n = photos.length
  const missing = photos.filter((p) => !p.dataUri).length
  const missingNote =
    missing > 0
      ? ` ${num(missing)} photo${missing === 1 ? '' : 's'} could not be embedded and ${
          missing === 1 ? 'is' : 'are'
        } shown as a labelled placeholder rather than dropped.`
      : ''
  // The analysis↔attachment divergence disclosure (cold-read fix): reconciles a vet's "N reads but
  // fewer photos?" cross-check without dropping the reads (which remain in Appendix A).
  const removed = snap.incidentPhotosAnalyzedNoRetained
  const removedNote =
    removed > 0
      ? ` ${num(removed)} further incident${removed === 1 ? ' was' : 's were'} photographed and read but ${
          removed === 1 ? 'its' : 'their'
        } photo is no longer retained (removed by the owner); the read${removed === 1 ? '' : 's'} ${
          removed === 1 ? 'remains' : 'remain'
        } in appendix&nbsp;A.`
      : ''
  const lead =
    n > 0
      ? `<span class="num">${n}</span> photographed incident${
          n === 1 ? '' : 's'
        } with a retained photo in this window, most recent first`
      : `No photographed incident in this window still has a retained photo`
  const cards = n > 0 ? `<div class="phgrid">${photos.map((p) => incidentPhotoCard(p, snap.timezone)).join('')}</div>` : ''
  return `
<section class="page">
  <p class="appx-title serif">Appendix ${letter} — Incident photos</p>
  <p class="appx-sub">${lead} — the owner's own photos, attached when the event was logged. For vomiting incidents the automated photo-analysis fields are shown beneath (owner-reviewable, unconfirmed); a photo flagged for possible blood or foreign material also leads the safety flags on page&nbsp;1. Photo metadata (location, device, capture time) is removed before embedding. A clear photo is never an all-clear and these never carry a diagnosis.${missingNote}${removedNote}</p>
  ${cards}
  ${footer(snap, `Appendix ${letter} — incident photos`)}
</section>`
}

function incidentPhotoCard(p: IncidentPhoto, tz: string | null): string {
  const date = fmtLocalDay(p.occurredAt, tz)
  const typeLabel = symptomLabel(p.type)
  const safetyTag = p.safety
    ? `<span class="phtag">${p.safety === 'blood' ? 'Possible blood' : 'Foreign material'}</span>`
    : ''
  const img = p.dataUri
    ? `<img class="phimg" src="${p.dataUri}" alt="Owner photo of a ${h(typeLabel.toLowerCase())} incident on ${h(date)}" />`
    : `<div class="phimg phimg-missing">Photo could not be embedded</div>`
  const readBits = phenotypeFieldBits(p.phenotype)
  const readLine = readBits ? `<div class="phread"><b>Photo:</b> ${readBits} ${aiBadge()}</div>` : ''
  const note = p.notes ? `<div class="phnote">${h(p.notes)}</div>` : ''
  return `
  <figure class="phcard">
    ${img}
    <figcaption class="phcap">
      <div class="phhead"><span class="phdate num">${h(date)}</span> <span class="phtype">${h(typeLabel)}</span>${safetyTag}</div>
      ${readLine}
      ${note}
    </figcaption>
  </figure>`
}

// Appendices B–D on one sheet, in reading order: diet history FIRST (what the pet is fed),
// then the off-diet exposures (the confounders), then medications (PM round-3 #3 — a vet reads
// the diet before the exceptions to it). Function names track CONTENT, not letter, so the
// physical order here is the letter order.
function appendixBCD(snap: ReportSnapshot): string {
  return `
<section class="page">
  ${dietHistoryAppendix(snap)}
  ${offDietAppendix(snap)}
  ${medicationAppendix(snap)}
  ${footer(snap, 'Appendices B–D — diet, exposures & meds')}
</section>`
}

/**
 * R2-1 — one grouped exposure row per (item, protein) instead of one row per feeding. The first
 * real artifact rendered 346 one-row-per-treat entries (~10–11 of 18 pages — THE thing that scared
 * a vet). Note-less treat/off-diet feedings collapse to a single row with a count + date span;
 * HUMAN FOOD stays itemised (few, and the confounder that matters); and any feeding carrying an
 * owner NOTE stays itemised so no note is silently dropped (§5.1). Sum-of-×N over the grouped rows
 * still equals the page-1 treat count, so provenance holds (§5.6).
 */
interface ConfounderRow {
  category: 'human' | 'treat' | 'other'
  label: string | null
  protein: string | null
  note: string | null
  count: number
  firstDay: string | null
  lastDay: string | null
}

function confCategory(c: ConfounderExposure): 'human' | 'treat' | 'other' {
  if (c.format === 'human_food') return 'human'
  if (c.foodType === 'treat' || c.format === 'treat') return 'treat'
  return 'other'
}

function confCategoryLabel(cat: 'human' | 'treat' | 'other'): string {
  return cat === 'human' ? 'Human food' : cat === 'treat' ? 'Treat' : 'Off-diet'
}

function groupConfounders(conf: ConfounderExposure[]): ConfounderRow[] {
  const itemised: ConfounderRow[] = []
  const groups = new Map<string, ConfounderRow>()
  for (const c of conf) {
    const cat = confCategory(c)
    const day = c.dayKey ?? c.occurredAt.slice(0, 10)
    // Human food OR any feeding carrying an owner note stays a discrete row (nothing dropped, §5.1).
    if (cat === 'human' || c.note) {
      itemised.push({ category: cat, label: c.foodLabel, protein: c.primaryProtein, note: c.note, count: 1, firstDay: day, lastDay: day })
      continue
    }
    const key = `${cat}||${c.foodLabel ?? ''}||${c.primaryProtein ?? ''}`
    let g = groups.get(key)
    if (!g) {
      g = { category: cat, label: c.foodLabel, protein: c.primaryProtein, note: null, count: 0, firstDay: day, lastDay: day }
      groups.set(key, g)
    }
    g.count++
    if (g.firstDay === null || (day && day < g.firstDay)) g.firstDay = day
    if (g.lastDay === null || (day && day > g.lastDay)) g.lastDay = day
  }
  // Order: human-food itemised rows first (the confounder that matters, few), by date; then the
  // grouped rows by descending count (the compressed bulk); then noted non-human rows by date.
  const human = itemised.filter((r) => r.category === 'human').sort((a, b) => (a.firstDay ?? '').localeCompare(b.firstDay ?? ''))
  const notedOther = itemised.filter((r) => r.category !== 'human').sort((a, b) => (a.firstDay ?? '').localeCompare(b.firstDay ?? ''))
  const grouped = [...groups.values()].sort((a, b) => b.count - a.count || (a.label ?? '').localeCompare(b.label ?? ''))
  return [...human, ...grouped, ...notedOther]
}

function confounderRowHtml(r: ConfounderRow): string {
  const span =
    r.firstDay && r.lastDay && r.firstDay !== r.lastDay
      ? `${h(fmtDay(r.firstDay))} &ndash; ${h(fmtDay(r.lastDay))}`
      : h(fmtDay(r.firstDay))
  const item = `${r.label ? h(r.label) : '&mdash;'}${r.note ? ` <span class="rnote">${h(r.note)}</span>` : ''}`
  const feedings = r.count > 1 ? `&times;${num(r.count)}` : num(1)
  return `<tr><td>${item}</td><td>${h(confCategoryLabel(r.category))}</td><td>${
    r.protein ? h(r.protein) : ''
  }</td><td class="c num">${feedings}</td><td class="num">${span}</td></tr>`
}

function offDietAppendix(snap: ReportSnapshot): string {
  const conf: ConfounderExposure[] = snap.provenance.confounders
  const hasTrial = !!snap.diet.activeTrial

  // Aggregate-first (R2-1): LEAD with the protein/product tally — the useful antigen picture the
  // first artifact buried at the very end — then the grouped exposure rows below it.
  const tally = Object.entries(snap.provenance.proteinExposureTally)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([p, n]) => `${h(p)} &times;${n}`)
    .join(', ')
  // Feedings whose item carries no usable protein (junk sentinels like the literal string "null",
  // or nothing recorded) are counted and disclosed, never tallied as a protein and never silently
  // dropped (§5.1 — the first artifact printed "null ×24" as the second-largest exposure).
  const unknownN = snap.provenance.proteinUnknownCount
  const unknownBit =
    unknownN > 0 ? ` (+&nbsp;${num(unknownN)} feeding${unknownN === 1 ? '' : 's'} with no recorded protein)` : ''
  // A continuously-available free-fed competing protein is the biggest breach of an elimination
  // trial, but it is not a discrete meal event so it never enters the count-based tally
  // (adversarial finding A2). Name it explicitly — a standing exposure, never a fabricated "×N".
  const freeFedProteins = [...new Set(snap.diet.freeFed.map((f) => f.primaryProtein).filter((p): p is string => !!p))]
  const tallyParts: string[] = []
  if (tally) {
    tallyParts.push(
      `<b>Protein exposures (off-diet):</b> ${tally}${unknownBit}${
        hasTrial
          ? ' — the antigens most likely to break an elimination trial.'
          : ' — off-diet protein exposures to weigh against the symptom pattern.'
      }`,
    )
  }
  if (hasTrial && freeFedProteins.length) {
    tallyParts.push(
      `<b>Free-fed alongside the trial:</b> ${freeFedProteins
        .map(h)
        .join(', ')} (continuously available; intake not directly observed) — a competing antigen the discrete tally above cannot count.`,
    )
  }
  const tallyBit = tallyParts.length ? `<p class="note lead">${tallyParts.join(' ')}</p>` : ''

  const rows = groupConfounders(conf).map(confounderRowHtml).join('')

  // Reconcile the caption with page 1, which reports treats and human food as SEPARATE counts.
  const humanN = conf.filter((c) => c.format === 'human_food').length
  const treatN = conf.filter((c) => c.format !== 'human_food' && (c.foodType === 'treat' || c.format === 'treat')).length
  const otherN = conf.length - humanN - treatN
  const breakdownParts = [
    treatN > 0 ? `${num(treatN)} treat${treatN === 1 ? '' : 's'}` : '',
    humanN > 0 ? `${num(humanN)} human-food feeding${humanN === 1 ? '' : 's'}` : '',
    otherN > 0 ? `${num(otherN)} other` : '',
  ].filter(Boolean)
  const breakdownBit = breakdownParts.length > 1 ? ` (${breakdownParts.join(' + ')})` : ''
  return `
  <p class="appx-title serif">Appendix C — Off-diet exposures (confounders)</p>
  <p class="appx-sub">${
    hasTrial
      ? 'Everything fed outside the trial diet, because these are the most common reasons a diet trial reads as &ldquo;not working.&rdquo;'
      : 'Everything fed outside the main diet — the exposures most worth weighing against the symptom pattern.'
  } Repeated treats are grouped by item (with a feeding count and date span); human food is listed feeding-by-feeding.</p>
  ${tallyBit}
  <table>
    <caption>${num(conf.length)} off-diet exposure${conf.length === 1 ? '' : 's'}${breakdownBit} &middot; ${h(
    fmtRange(snap.scope.startDate, snap.scope.endDate),
  )}</caption>
    <thead><tr><th>Item</th><th style="width:92px">Category</th><th style="width:104px">Protein</th><th class="c" style="width:72px">Feedings</th><th style="width:118px">Dates</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5">No off-diet exposures logged in this window.</td></tr>`}</tbody>
  </table>`
}

function dietHistoryAppendix(snap: ReportSnapshot): string {
  const d = snap.diet
  // Window-scoped like every other medication view (page-1 dietMeds + appendix D both
  // filter on overlapsWindow) — the meds pull is deliberately unbounded for the
  // concurrent-change logic, so without this guard a supplement stopped years ago would
  // render here as a live entry while page 1 correctly omits it (code-review find).
  const supps = snap.medications.filter((m) => m.isSupplement && m.overlapsWindow)
  const suppBit = supps.length
    ? supps.map((m) => `${h(m.drugName)} (started ${h(fmtDay(m.startedAt))})`).join('; ')
    : 'None recorded.'
  const treatBit = d.treats.count
    ? `${num(d.treats.count)} this window (${num(d.treats.distinctItems)} distinct). Dates in appendix&nbsp;C.`
    : 'None recorded.'
  // Meals (#7/#8) — the foods the owner logs AS MEALS (e.g. a wet diet). Previously discarded
  // before render, so a substantial part of the diet was invisible. Name the distinct foods here
  // and itemise them in appendix E; a free-fed-only pet with no logged meals reads "None recorded."
  const mealTotal = d.mealItems.reduce((a, i) => a + i.count, 0)
  const mealsBit = d.mealItems.length
    ? `${num(mealTotal)} logged meal${mealTotal === 1 ? '' : 's'} across ${num(d.mealItems.length)} food${
        d.mealItems.length === 1 ? '' : 's'
      }: ${distinctLabels(d.mealItems.map((i) => ({ label: i.foodLabel })), 4)}. Itemised in appendix&nbsp;E.`
    : 'None logged as discrete meals in this window.'
  const humanBit = d.humanFood.count
    ? `${num(d.humanFood.days)} day${d.humanFood.days === 1 ? '' : 's'} (${distinctLabels(d.humanFood.items, 6)}).`
    : 'None recorded.'
  // A concurrent free_choice bowl MUST appear in the diet history even when a trial is active —
  // an ad-lib competing-protein staple is the single thing most likely to break an elimination
  // trial, and the WSAVA diet history is exactly the section a vet reads to spot it. The old
  // ternary reached the free-fed branch ONLY when there was no trial, so a trial contaminated by
  // a duck bowl rendered a "clean" single-protein history (adversarial + cold-read finding A2 —
  // the highest-consequence WSAVA miss; the no-trial cat listed free-fed correctly, proving it a
  // bug not a design choice).
  const freeFedNames = d.freeFed.map((f) => (f.foodLabel ? h(f.foodLabel) : 'free-fed food')).join(', ')
  const freeFedClause = d.freeFed.length
    ? ` Also free-fed alongside: ${freeFedNames} (free-choice &mdash; intake not directly observed).`
    : ''
  const primaryDiet = d.activeTrial
    ? `${d.activeTrial.foodLabel ? h(d.activeTrial.foodLabel) : 'Trial diet'}. Started ${h(fmtDayYear(d.activeTrial.startedAt))}.${freeFedClause}`
    : d.freeFed.length
      ? `${freeFedNames} (free-choice &mdash; intake not directly observed).`
      : // No structured trial/arrangement to name here; the fed food still appears per-meal in the log
        // (and any refused-food note on page 1). Worded so it does not read as "diet unknown".
        'No diet trial or free-feeding arrangement recorded for this window; the fed diet appears per meal in the log.'
  const condBit = snap.provenance.conditions.length
    ? snap.provenance.conditions.map((c) => `${h(c.name)} (${h(c.status)})`).join('; ')
    : 'None recorded.'
  const weightBit = snap.weight.isEmpty
    ? 'No home weigh-ins recorded. Body-condition score and caloric adequacy not assessed in this record.'
    : `Weight trend on page&nbsp;1. Body-condition score and caloric adequacy not assessed in this record.`
  return `
  <p class="appx-title serif" style="margin-top:22px">Appendix B — Diet history</p>
  <p class="appx-sub">A picture of what ${h(snap.signalment.name)} is fed, in the spirit of the WSAVA Short Diet History Form. Fields the app does not yet capture are marked &ldquo;not recorded&rdquo; rather than guessed.</p>
  <table>
    <tbody>
      <tr><th style="width:180px">Primary diet</th><td>${primaryDiet}</td></tr>
      <tr><th>Meals logged</th><td>${mealsBit}</td></tr>
      <tr><th>Previous diet</th><td>Not recorded.</td></tr>
      <tr><th>Amount &amp; schedule</th><td>Not recorded in structured form (per-meal quantities are owner-entered free text${
        d.mealItems.length > 0 ? '; meals are itemised in appendix&nbsp;E' : ''
      }).</td></tr>
      <tr><th>Treats</th><td>${treatBit}</td></tr>
      <tr><th>Human food</th><td>${humanBit}</td></tr>
      <tr><th>Supplements</th><td>${suppBit}</td></tr>
      <tr><th>Active conditions</th><td>${condBit}</td></tr>
      <tr><th>Nutritional status</th><td>${weightBit}</td></tr>
    </tbody>
  </table>`
}

function medicationAppendix(snap: ReportSnapshot): string {
  const meds = snap.medications.filter((m) => !m.isSupplement && m.overlapsWindow)
  const unlinked = snap.unlinkedMedications
  const regimenRows = meds
    .map((m) => {
      const regimen = [
        m.strength ? h(m.strength) : null,
        m.route ? h(m.route) : null,
        m.dosesPerDay != null ? `${m.dosesPerDay}×/day` : 'as needed',
      ]
        .filter(Boolean)
        .join(', ')
      const logged =
        m.adherenceState === 'not_tracked'
          ? '0'
          : `${num(m.givenDoses + m.partialDoses)}${m.expectedDoses != null ? ` / ${m.expectedDoses}` : ''}`
      const adherence =
        m.adherenceState === 'not_tracked'
          ? '<b>Adherence not tracked</b> — no doses logged; never read as given.'
          : `Logged on ${num(m.daysWithDose)} of ${num(m.elapsedDaysInWindow)} days.${
              m.unconfirmedDoses ? ` ${num(m.unconfirmedDoses)} unconfirmed.` : ''
            }${m.refusedDoses ? ` ${num(m.refusedDoses)} refused.` : ' None recorded as refused.'}`
      return `<tr><td>${h(m.drugName)}${m.strength ? ` ${h(m.strength)}` : ''}</td><td>${regimen}${
        m.indication ? ` — for ${h(m.indication)}` : ''
      } &middot; ${regimenDates(m)}</td><td class="c num">${logged}</td><td>${adherence}</td></tr>`
    })
    .join('')
  // Ad-hoc / OTC doses with no regimen (§3.8) — logged but never configured as a course. Reported
  // here so nothing the owner logged is dropped; the "Regimen" cell states plainly there is none.
  const unlinkedRows = unlinked
    .map((u) => {
      const regimen = [`No regimen configured`, u.route ? `by ${h(u.route)}` : null, u.isSupplement ? 'OTC' : null]
        .filter(Boolean)
        .join(' &middot; ')
      const extras: string[] = []
      if (u.partialDoses) extras.push(`${num(u.partialDoses)} partial`)
      if (u.unconfirmedDoses) extras.push(`${num(u.unconfirmedDoses)} unconfirmed`)
      if (u.refusedDoses) extras.push(`${num(u.refusedDoses)} refused`)
      if (u.missedDoses) extras.push(`${num(u.missedDoses)} missed`)
      const adherence = `Owner-logged ad-hoc dose${u.totalDoses === 1 ? '' : 's'}, ${unlinkedSpan(u)} — not part of a configured regimen.${
        extras.length ? ` ${extras.join(', ')}.` : ''
      }`
      return `<tr><td>${h(u.drugName)}${u.strength ? ` ${h(u.strength)}` : ''}</td><td>${regimen}</td><td class="c num">${num(
        u.administeredDoses,
      )}</td><td>${adherence}</td></tr>`
    })
    .join('')
  const rows = regimenRows + unlinkedRows
  const hasAny = meds.length > 0 || unlinked.length > 0
  // R2-6 — the preamble referenced a page-1 adherence line that does not exist on a no-meds report;
  // make it conditional so an empty Appendix D never points at a section that isn't there.
  const sub = !hasAny
    ? 'No prescription medications overlap this window. Over-the-counter supplements, if any, are listed in the diet history (appendix&nbsp;B).'
    : 'Doses are owner-logged. The page-1 adherence line is computed from these entries; with no doses logged a drug reads &ldquo;adherence not tracked,&rdquo; never &ldquo;given.&rdquo; Doses logged without a configured regimen (including over-the-counter medications) appear as ad-hoc entries below; supplements taken as food are listed in the diet history (appendix&nbsp;B).'
  return `
  <p class="appx-title serif" style="margin-top:22px">Appendix D — Medication log</p>
  <p class="appx-sub">${sub}</p>
  <table>
    <thead><tr><th>Medication</th><th style="width:150px">Regimen</th><th class="c" style="width:100px">Doses logged</th><th>Adherence</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4">No prescription medications overlap this window.</td></tr>`}</tbody>
  </table>`
}

function appendixF(snap: ReportSnapshot): string {
  const hasSafety = snap.safetyFlags.length > 0
  const safetyDt = hasSafety
    ? `<dt>Safety flags</dt><dd>Shown only when present, above the fold. They escalate on the presence of a concern (chronicity, reduced intake, possible blood/foreign, worsening) and are owner-reported, not a diagnosis. Absence of a flag is never shown as an &ldquo;all clear.&rdquo;</dd>`
    : `<dt>Safety flags</dt><dd>Shown only when present, above the fold. None were present in this window — and an <b>absence</b> of a flag is never shown as an &ldquo;all clear.&rdquo;</dd>`
  // PR 7 — the incident-photos legend entry only renders when photos exist (so the legend never
  // points at an appendix that isn't there — the dangling-appendix class the meals appendix hit).
  const photoDt = hasIncidentPhotos(snap)
    ? `<dt>Incident photos</dt><dd>Every photographed incident in the window is in appendix&nbsp;${photosAppendixLetter(
        snap,
      )}, most recent first — the owner's own photos, attached when the event was logged. Location, device and capture-time metadata are removed before embedding, and the images are downscaled. A photo flagged for possible blood or foreign material also leads the safety flags on page&nbsp;1; a clear photo is never an all-clear.</dd>`
    : ''
  return `
<section class="page">
  <p class="appx-title serif">How to read this report</p>
  <dl class="legend">
    ${safetyDt}
    <dt>Owner-reported</dt><dd>Every entry was logged by the owner on a phone. This is a record of what the owner observed, not a clinical examination, and contains no diagnosis or treatment recommendation.</dd>
    <dt>Range</dt><dd>Scoped to ${h(scopeBasisLabel(snap.scope).toLowerCase())} (${h(fmtRange(snap.scope.startDate, snap.scope.endDate))}). A custom (hand-picked) window discloses the count of symptom events that fall outside it, so nothing is cropped to a good week.</dd>
    <dt>Denominators</dt><dd>Counts are shown over their window and the days logged, so a count is never read without knowing how long and how completely it was tracked.</dd>
    <dt>Time confidence</dt><dd><span class="conf">seen</span> witnessed (exact time) &middot; <span class="conf">est</span> an estimated time &middot; <span class="conf">range</span> found later; the window it occurred in is shown, not the time it was noticed — a one-sided account renders as &ldquo;before/after&rdquo; that bound &middot; <span class="conf">unspecified</span> logged without a time confidence; treat the time as approximate.</dd>
    <dt>Duplicate logs</dt><dd>A <span class="conf">N logs</span> tag marks the same incident logged more than once (a re-log or sync retry). It is counted once everywhere in this report; the duplicate count is disclosed rather than hidden.</dd>
    <dt>Photo analysis</dt><dd>For photographed incidents, structured fields (colour, contents, blood, foreign material) are read automatically from the photo the owner took. These are owner-reviewable and aggregated over the incidents with a legible read. They never carry a diagnosis or a single-incident verdict, and a clear photo is never an all-clear.</dd>
    ${photoDt}
    <dt>Blood &amp; foreign material</dt><dd>Reported <b>only when seen</b> in an incident — never as a &ldquo;0 of N&rdquo; count, because absence in a photo cannot exclude bleeding (digested blood photographs poorly) and these are AI reads. A flagged incident leads the flags for review at the top.</dd>
    <dt>Weight</dt><dd>Owner home-scale weigh-ins, shown as a trend rather than a single point. Descriptive context, never a diagnosis or an alarm; body condition is not assessed here.</dd>
    <dt>Intake</dt><dd>Where the owner logs meals, a declined or barely-touched meal is recorded as a possible health signal — never &ldquo;picky.&rdquo;${
      snap.provenance.intakeLog.length > 0
        ? ' When intake drops, page&nbsp;1 shows the time since the last <b>fully-eaten</b> meal (how long the pet has gone without a full meal), and the meals behind it are in appendix&nbsp;E (meals &amp; intake).'
        : snap.diet.mealItems.length > 0
          ? ' The meals the owner logged are itemised in appendix&nbsp;E (meals &amp; intake). A page-1 &ldquo;time since the last <b>fully-eaten</b> meal&rdquo; line is added only when a reduced-intake flag is raised; none was raised in this window.'
          : ' When a reduced-intake flag is raised, page&nbsp;1 adds the time since the last <b>fully-eaten</b> meal and a meals appendix lists the rated meals behind it; no meals were logged in this window.'
    } For free-fed food, intake is <b>not directly observed</b>; absence of a meal log is not read as &ldquo;didn't eat.&rdquo;</dd>
    <dt>Associations</dt><dd>Any timing relationship is reported as co-occurrence with counts for the clinician to weigh. Nothing in this report asserts that a food caused a symptom.</dd>
    <dt>Deleted entries</dt><dd>Entries the owner deleted are excluded. The symptom counts on page&nbsp;1 (including loose stools) trace line-by-line to appendix&nbsp;A and the off-diet exposures to appendix&nbsp;C; medication, diet, weight and normal-stool figures summarize the owner's logs for those items rather than itemising each one. Nothing is counted that the owner did not log.</dd>
  </dl>
  ${footer(snap, 'How to read this report')}
</section>`
}

// ── The document ─────────────────────────────────────────────────────────────────

/**
 * Render the immutable snapshot into the one canonical HTML artifact. Pure and
 * deterministic — the ONLY entry point. Emits a complete standalone document (the
 * served/printed report), self-contained (zero third-party subresources).
 */
export function renderReport(snap: ReportSnapshot): string {
  const title = `Owner-reported summary — ${h(snap.signalment.name)} · ${h(
    fmtRange(snap.scope.startDate, snap.scope.endDate),
  )}`
  const page1 = `
<section class="page">
  ${letterhead(snap)}
  ${signalmentBlock(snap)}
  ${safetyBand(snap)}
  ${headline(snap)}
  ${weightBlock(snap)}
  ${atAGlance(snap)}
  ${symptomTrend(snap)}
  ${proteinTimelineSection(snap)}
  ${vomitCharacteristics(snap)}
  ${stoolCharacteristics(snap)}
  ${dietMeds(snap)}
  ${footer(snap, 'Clinical summary')}
</section>`

  // Viewport width is pinned to the fixed page width (210mm ≈ 794px), NOT
  // device-width: this is a fixed-layout print document, so a mobile WebView must
  // shrink-to-fit the whole page rather than render it at 1:1 and strand the reader
  // zoomed into the top-left corner (the owner's in-app preview). Print/PDF pagination
  // is driven by the page box, not this meta, so the vet-facing PDF is unaffected.
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=794" />
<meta name="referrer" content="no-referrer" />
<title>${title}</title>
<style>${STYLE}</style>
</head>
<body>
${page1}
${appendixA(snap)}
${appendixBCD(snap)}
${mealsAppendix(snap)}
${incidentPhotosAppendix(snap)}
${appendixF(snap)}
</body>
</html>`
}

// ── Canonical stylesheet (productionized from the v3 + cat mocks) ────────────────
// No colour carries data (§5.8): --ink/--muted/--faint/--hair are grayscale; --brand
// is letterhead furniture only and degrades to dark gray in B&W. Every fill/swatch
// carries print-color-adjust:exact so it survives a default clinic printer.
const STYLE = `
  :root{
    --ink:#16181d;--muted:#565961;--faint:#8a8d94;--hair:#e4e5e8;--hair2:#eef0f2;
    --bar:#1a1c22;--nub:#c7c9ce;--fill:#f4f5f7;--surface:#ffffff;--brand:#2e3a4f;--brand-soft:#eef1f5;
  }
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{
    background:#eceef1;color:var(--ink);
    font-family:ui-sans-serif,-apple-system,system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    font-size:13.5px;line-height:1.5;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  }
  .num{font-variant-numeric:tabular-nums;}
  .serif{font-family:"Newsreader",Georgia,"Iowan Old Style","Palatino Linotype",serif;}

  .page{
    width:210mm;min-height:297mm;margin:16px auto;padding:15mm 16mm 12mm;
    background:var(--surface);box-shadow:0 1px 3px rgba(20,24,34,.10),0 8px 28px rgba(20,24,34,.10);border-radius:3px;
  }

  /* Letterhead */
  .letter{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;}
  .brand{display:flex;align-items:center;gap:10px;}
  .brand .cmark{width:30px;height:30px;flex:none;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .wordmark{font-family:"Newsreader",Georgia,serif;font-weight:600;font-size:27px;letter-spacing:.005em;color:var(--brand);line-height:1;}
  .brand .kind{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);font-weight:600;}
  .lh-right{display:flex;align-items:flex-start;gap:16px;}
  .letter .stamp{text-align:right;font-size:11px;line-height:1.55;color:var(--muted);}
  .letter .stamp b{color:var(--ink);font-weight:600;}
  /* Brand QR → getculprit.app. Black-on-white, crisp modules, prints exact. Carries no data (§5.8). */
  .hqrblock{display:flex;flex-direction:column;align-items:center;gap:3px;flex:none;}
  .hqr{display:block;shape-rendering:crispEdges;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .hqrcap{font-size:8px;line-height:1.32;letter-spacing:.02em;color:var(--faint);text-align:center;white-space:nowrap;}
  .rule-brand{height:2px;background:var(--brand);margin:9px 0 0;border-radius:2px;opacity:.9;-webkit-print-color-adjust:exact;print-color-adjust:exact;}

  /* Signalment + range */
  .ident{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-top:14px;}
  .ident .name{font-size:22px;font-weight:700;letter-spacing:.005em;line-height:1.05;}
  .ident .sig{font-size:12.5px;color:#25272d;margin-top:3px;}
  .ident .wt{font-size:12px;color:var(--muted);margin-top:2px;}
  .rangebox{flex:0 0 auto;text-align:right;border:1px solid var(--hair);border-radius:8px;padding:8px 12px;min-width:190px;background:#fcfcfd;}
  .rangebox .win{font-size:14px;font-weight:700;letter-spacing:.005em;}
  .rangebox .days{font-size:11.5px;color:var(--muted);margin-top:1px;}
  .rangebox .basis{display:inline-block;margin-top:6px;font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);border:1px solid var(--hair);border-radius:3px;padding:2px 7px;background:#fff;}
  .cherry{margin-top:9px;border:1px solid var(--hair);border-left:3px solid var(--ink);border-radius:0 7px 7px 0;padding:7px 11px;font-size:11.5px;background:#fcfcfd;}

  /* Safety band — leads the page. Mono-prominent: heavy border + weight, never colour. */
  .safetyband{border:2px solid var(--ink);border-radius:9px;padding:10px 14px 6px;margin-top:14px;}
  .safetyband > .h{font-size:10px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--ink);display:flex;align-items:center;gap:8px;padding-bottom:7px;border-bottom:1.5px solid var(--ink);}
  .safetyband > .h svg{width:16px;height:16px;flex:0 0 auto;}
  .safetyband > .h .sub{margin-left:auto;font-weight:500;letter-spacing:0;text-transform:none;font-size:10px;color:var(--muted);}
  .safetyband .flag{padding:8px 0;font-size:12.5px;line-height:1.5;}
  .safetyband .flag + .flag{border-top:1px solid var(--hair);}
  .safetyband .flag .tag{display:inline-block;font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--ink);border:1.5px solid var(--ink);border-radius:4px;padding:1px 6px;margin-right:4px;vertical-align:2px;}
  .safetyband .flag b{font-weight:700;}

  .headline{margin-top:14px;font-size:14px;line-height:1.45;border-left:3px solid var(--ink);padding:2px 0 2px 12px;}
  .headline b{font-weight:700;}

  /* Weight strip */
  .weight{display:flex;align-items:center;gap:14px;margin-top:12px;border:1px solid var(--hair);border-radius:9px;padding:9px 13px;background:#fcfcfd;}
  .weight.weight-empty{background:#fbfbfc;}
  .weight .spark{flex:0 0 auto;}
  .weight .wt-read{font-size:12px;line-height:1.45;}
  .weight .wt-read .v{font-weight:700;font-size:15px;}
  .weight .wt-read .l{color:var(--muted);}
  svg .spk{fill:none;stroke:var(--ink);stroke-width:2;stroke-linejoin:round;stroke-linecap:round;}
  svg .spkdot{fill:var(--ink);}

  /* Sections — the clinical summary gets vertical breathing room (PM #4: don't crowd the summary;
     appendices stay dense). Print keeps the same rhythm; page 1/2 have the room to spare. */
  .sec{margin-top:19px;}
  .sec > h2{font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 11px;padding-bottom:6px;border-bottom:1px solid var(--hair);display:flex;justify-content:space-between;align-items:baseline;gap:12px;}
  .sec > h2 .aside{font-weight:500;letter-spacing:0;text-transform:none;font-size:10.5px;color:var(--faint);}
  .note{font-size:11.5px;color:var(--muted);margin:6px 0 0;}
  .note b{color:var(--ink);}
  .ref{font-size:11px;color:var(--faint);font-style:italic;margin:6px 0 0;}
  .empty{font-size:12px;color:var(--muted);border:1px dashed var(--hair);border-radius:8px;padding:11px 13px;background:#fcfcfd;}

  /* Stat tiles */
  .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
  .tile{border:1px solid var(--hair);border-radius:9px;padding:13px 13px;background:#fcfcfd;}
  .tile .v{font-size:22px;font-weight:600;letter-spacing:-.01em;line-height:1.05;}
  .tile .v small{font-size:13px;color:var(--muted);font-weight:600;}
  .tile .l{font-size:11px;color:var(--muted);margin-top:4px;line-height:1.35;}

  /* Trend charts (the hero) */
  .trend{border:1px solid var(--hair);border-radius:10px;padding:10px 15px 4px;background:#fff;}
  .trend + .trend{margin-top:8px;}
  .trend .top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;}
  .trend .who{font-size:13.5px;font-weight:700;}
  .trend .who .win{font-weight:500;color:var(--faint);font-size:11.5px;margin-left:2px;}
  .trend .big{text-align:right;line-height:1.1;}
  .trend .big .n{font-size:24px;font-weight:600;letter-spacing:-.01em;}
  .trend .big .n small{font-size:13px;color:var(--muted);font-weight:600;}
  .trend .big .delta{font-size:11.5px;color:var(--muted);margin-top:1px;}
  .trend .big .delta b{color:var(--ink);font-weight:700;}
  .trend svg{display:block;width:100%;height:auto;margin-top:4px;}
  .trend .subnote{font-size:11px;color:var(--muted);margin:2px 0 6px;}
  svg .grid{stroke:var(--hair);stroke-width:1;}
  svg .axis{stroke:var(--ink);stroke-width:1.25;}
  svg .bar{fill:var(--bar);}
  svg .nub{fill:var(--nub);}
  svg .mark{stroke:var(--ink);stroke-width:1;stroke-dasharray:3 3;}
  svg text.yl{font-size:10px;fill:var(--faint);}
  svg text.xl{font-size:10.5px;fill:var(--muted);}
  svg text.cap{font-size:11px;fill:var(--muted);}
  svg text.z{font-size:11px;fill:var(--faint);}
  svg text.ann{font-size:10px;fill:var(--ink);font-weight:600;}

  /* Reading-the-trend callout — the GP-0 confound guard */
  .callout{margin-top:11px;background:var(--fill);border-left:3px solid var(--ink);border-radius:0 7px 7px 0;padding:9px 13px;font-size:12px;line-height:1.5;}
  .callout .k{font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:10px;color:var(--muted);display:block;margin-bottom:2px;}

  /* Phenotype strips */
  .aitag{font-weight:500;letter-spacing:0;text-transform:none;font-size:9.5px;color:var(--muted);border:1px solid var(--hair);border-radius:3px;padding:1px 7px;white-space:nowrap;}
  .pheno{display:grid;grid-template-columns:1.35fr 1fr;gap:16px;align-items:start;}
  .barmix{display:flex;height:26px;border-radius:6px;overflow:hidden;background:#fff;border:1px solid var(--hair);}
  .barmix .seg{position:relative;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:600;border-right:2px solid #fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;min-width:18px;}
  .barmix .seg:last-child{border-right:0;}
  .mixkey{margin-top:8px;font-size:11px;color:var(--muted);line-height:1.7;}
  .mixkey .sw{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;vertical-align:middle;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .limit{border:1px solid var(--hair);border-left:3px solid var(--faint);border-radius:0 8px 8px 0;padding:9px 12px;background:#fcfcfd;font-size:11.5px;line-height:1.5;color:var(--muted);}
  .limit b{color:var(--ink);}
  .limit .h{display:block;font-weight:700;text-transform:uppercase;letter-spacing:.05em;font-size:9.5px;color:var(--muted);margin-bottom:3px;}
  .present{border:1.5px solid var(--ink);border-radius:8px;padding:9px 12px;font-size:11.5px;line-height:1.5;}
  .present .h{display:block;font-weight:800;text-transform:uppercase;letter-spacing:.05em;font-size:9.5px;color:var(--ink);margin-bottom:3px;}
  .present b{color:var(--ink);}

  /* Diet / meds key-value */
  .cols2{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
  .kv{display:flex;gap:8px;margin:4px 0;font-size:12.5px;}
  .kv .k{flex:0 0 auto;font-weight:600;color:#25272d;}
  /* Single aligned column for the diet/feeding/meds list — values align off a fixed label gutter. */
  .kvcol .kv{margin:6px 0;}
  .kvcol .kv .k{flex:0 0 132px;}

  /* Appendix */
  .appx-title{font-size:14px;font-weight:700;margin:0 0 2px;}
  .appx-title.serif{font-family:"Newsreader",Georgia,serif;font-weight:600;font-size:16px;}
  .appx-sub{font-size:11.5px;color:var(--muted);margin:0 0 11px;line-height:1.5;}
  table{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:4px;}
  caption{caption-side:top;text-align:left;font-size:11px;color:var(--muted);margin-bottom:5px;}
  th,td{text-align:left;padding:5px 8px;border-bottom:1px solid var(--hair);vertical-align:top;}
  thead th{border-bottom:1.5px solid var(--ink);font-weight:700;font-size:10.5px;letter-spacing:.02em;text-transform:uppercase;color:var(--muted);}
  tbody tr:nth-child(even){background:#f8f9fa;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  td.r,th.r{text-align:right;}
  td.c,th.c{text-align:center;}
  td.omit{text-align:center;font-size:10.5px;font-style:italic;color:var(--faint);background:#fafbfc;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .conf{font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);border:1px solid var(--hair);border-radius:3px;padding:0 4px;white-space:nowrap;}
  .fields{display:block;color:var(--muted);font-size:10.5px;margin-top:2px;}
  .fields b{color:#25272d;font-weight:600;}
  .legend{font-size:11.5px;}
  .legend dt{font-weight:700;float:left;clear:left;width:120px;color:#25272d;}
  .legend dd{margin:0 0 6px 132px;color:#2a2c31;}

  /* Footer letterhead */
  .foot{margin-top:20px;border-top:1px solid var(--hair);padding-top:9px;display:flex;justify-content:space-between;align-items:center;gap:14px;font-size:10.5px;color:var(--muted);}
  .foot .fbrand{display:flex;align-items:center;gap:9px;}
  .foot .fbrand .fw{line-height:1.35;}
  .foot .fbrand .fw .w{font-family:"Newsreader",Georgia,serif;font-weight:600;font-size:14px;color:var(--brand);}
  .foot .fbrand .fw .scan{color:var(--muted);}
  .foot .pg{text-align:right;color:var(--faint);}

  /* Round-2 (B-221) additions */
  .orient{margin-top:7px;font-size:10.5px;color:var(--faint);letter-spacing:.01em;}
  .aibadge{display:inline-block;font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);border:1px solid var(--hair);border-radius:3px;padding:1px 5px;white-space:nowrap;vertical-align:baseline;}
  .tile .v .arw{color:var(--faint);font-weight:400;}
  .trend .big .delta-caveat{font-size:10px;color:var(--faint);margin-top:1px;font-style:italic;}
  .chartlegend{font-size:10.5px;color:var(--faint);margin:8px 0 0;padding-left:2px;}
  /* Protein-over-time legend (#9) — swatch (hue + texture) · protein · count, wrapping. */
  .ptlegend{margin-top:9px;font-size:10.5px;color:var(--muted);line-height:1.9;}
  .ptleg{display:inline-block;margin-right:13px;white-space:nowrap;}
  .ptleg svg{display:inline-block;width:12px;height:12px;vertical-align:-2px;margin-right:4px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .ptlegend .num{color:#25272d;font-weight:600;}
  .chartlegend b{color:var(--muted);font-weight:600;}
  .note.lead{margin:0 0 9px;}
  .rnote{color:var(--faint);font-style:italic;}
  .divider{margin:0 0 16px;border:1px solid var(--hair);border-left:3px solid var(--ink);border-radius:0 8px 8px 0;padding:9px 13px;font-size:11.5px;line-height:1.5;color:var(--muted);background:#fcfcfd;}
  .divider .k{display:block;font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:10px;color:var(--ink);margin-bottom:2px;}
  svg .mtick{stroke:var(--faint);stroke-width:1;}

  /* Incident-photos appendix (PR 7). The chrome is grayscale (§5.8); the photos are the
     source datum, not a colour-coded encoding, so they carry no §5.8 concern. */
  .phgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:13px;margin-top:6px;}
  .phcard{margin:0;border:1px solid var(--hair);border-radius:9px;overflow:hidden;background:#fcfcfd;}
  .phimg{display:block;width:100%;height:auto;max-height:340px;object-fit:contain;background:var(--fill);-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .phimg-missing{display:flex;align-items:center;justify-content:center;min-height:120px;font-size:11px;color:var(--faint);font-style:italic;border-bottom:1px solid var(--hair);}
  .phcap{padding:8px 11px 10px;font-size:11.5px;line-height:1.45;}
  .phhead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
  .phhead .phdate{font-weight:700;}
  .phhead .phtype{color:var(--muted);}
  .phtag{display:inline-block;font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--ink);border:1.5px solid var(--ink);border-radius:4px;padding:1px 6px;}
  .phread{color:var(--muted);font-size:10.5px;margin-top:4px;}
  .phread b{color:#25272d;font-weight:600;}
  .phnote{margin-top:4px;color:#2a2c31;}

  /* Safety-band photo lead — a small thumbnail row inside the flag, on page 1. */
  .sbthumbs{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:7px;}
  .sbthumb{width:66px;height:66px;object-fit:cover;border:1.5px solid var(--ink);border-radius:6px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .sbthumbnote{font-size:10px;color:var(--muted);font-style:italic;}

  @media print{
    body{background:#fff;font-size:10.4pt;}
    .no-print{display:none !important;}
    .page{width:auto;min-height:0;margin:0;padding:0;box-shadow:none;border-radius:0;}
    .page + .page{page-break-before:always;}
    thead{display:table-header-group;}
    /* Only ATOMIC units resist breaking — never a whole .sec (that fragments the page). */
    tr,.trend,.tile,.callout,.weight,.safetyband,.present,.divider,.phcard{page-break-inside:avoid;}
    .rule-brand,.wordmark,.foot .fbrand .fw .w,.hqr,.cmark{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  }
  @page{size:A4 portrait;margin:11mm;}
`
