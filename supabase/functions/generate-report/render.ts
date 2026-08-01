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
  ProteinSetView,
} from './report.ts'
// §5.5's standing contamination fact, shared with the trial block. Imported from the
// adapter rather than re-declared: the render must not hold its own idea of what a
// contamination finding is.
import type { ContaminationFact } from './trial.ts'
// Same list formatter the owner-facing contaminant copy uses — one spelling of
// "chicken, salmon and beef" across the product (B-351 slice 5).
import { proteinList } from '../../../lib/trialProtein.ts'

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

/** "dogs" / "cats" — how the time-to-flare evidence is actually stated (dog TTF90
 *  14d, cat TTF90 7d). `speciesLabel` gives the signalment register (Canine /
 *  Feline), which reads wrong inside a prose sentence. */
function speciesPlural(species: string): string {
  if (species === 'dog') return 'dogs'
  if (species === 'cat') return 'cats'
  return `${species}s`
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

/**
 * Bristol Stool Scale plain-language labels (§3.4). Vets think in Bristol, but the report shows
 * "Type N — <plain words>" so both the vet AND an owner relaying the page can read it (never the
 * bare number). Keyed by the stool_consistency enum (migration 034); 'unsure' is filtered upstream.
 */
const BRISTOL_LABEL: Record<string, string> = {
  type_1_hard_lumps: 'Type 1 — separate hard lumps',
  type_2_lumpy: 'Type 2 — lumpy, sausage-shaped',
  type_3_cracked: 'Type 3 — sausage with cracked surface',
  type_4_smooth_soft: 'Type 4 — smooth, soft',
  type_5_soft_blobs: 'Type 5 — soft blobs, clear edges',
  type_6_mushy: 'Type 6 — mushy, ragged edges',
  type_7_watery: 'Type 7 — watery, no solid pieces',
}

/** stool_colour enum → plain label. black_tarry / grey_pale / red_streaked are the clinically loud ones. */
const STOOL_COLOUR_LABEL: Record<string, string> = {
  brown: 'brown',
  dark_brown: 'dark brown',
  yellow: 'yellow',
  green: 'green',
  black_tarry: 'black / tarry',
  grey_pale: 'pale / clay-coloured',
  red_streaked: 'red-streaked',
}

/** A grayscale ramp for proportion-bar segments — NEVER colour (§5.8). Cycles if >6. */
// A calm mid-to-light grayscale ramp for the phenotype proportion bar + its key swatches. The
// dominant segment used to render near-black (#1a1c22), which read as a heavy "chart" slab on the
// first artifact (PM #1); a muted mid-gray start keeps the segments distinguishable without the
// black shout. No colour carries data (§5.8) — the key's swatch + label + count is the datum.
const GRAY_RAMP = ['#585c64', '#74777f', '#8f929a', '#a9acb2', '#c2c4c9', '#d8d9dd']

// ── Small SVG builders (all non-colour) ──────────────────────────────────────────

/**
 * Y-axis maximum for the weekly bar charts, forced to an EVEN number. The mid gridline is drawn
 * at the geometric midpoint of the plot, whose value is exactly `yMax / 2`; on an ODD max that
 * midpoint is an `x.5` value, and labelling it `round(x.5)` printed the `2.5` gridline as `3`, so
 * a bar of 3 topped visibly ABOVE its own labelled line (B-498). Keeping the max even makes
 * `yMax / 2` a whole number that sits exactly on the line it labels. The floor of 2 keeps a
 * one-episode week off a single-gridline axis.
 */
function evenAxisMax(values: number[]): number {
  const raw = Math.max(2, ...values)
  return raw % 2 === 0 ? raw : raw + 1
}

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
  const loggedByBucket = sym.loggedDaysByBucket
  const n = Math.max(1, buckets.length)
  const L = 40
  const R = 628
  const BASE = 116
  const TOP = 28
  const plotW = R - L
  const slot = plotW / n
  const barW = Math.max(10, Math.min(30, slot * 0.5))
  const yMax = evenAxisMax(buckets)
  const centerX = (i: number): number => L + (i + 0.5) * slot
  const yFor = (count: number): number => BASE - (count / yMax) * (BASE - TOP)

  const parts: string[] = []
  // Gridlines + baseline axis + Y ticks (max / mid / 0).
  parts.push(`<line class="grid" x1="${L}" y1="${TOP}" x2="${R}" y2="${TOP}"/>`)
  parts.push(`<line class="grid" x1="${L}" y1="${(TOP + BASE) / 2}" x2="${R}" y2="${(TOP + BASE) / 2}"/>`)
  parts.push(`<line class="axis" x1="${L}" y1="${BASE}" x2="${R}" y2="${BASE}"/>`)
  parts.push(`<text class="yl num" x="30" y="${TOP + 3}" text-anchor="end">${yMax}</text>`)
  parts.push(`<text class="yl num" x="30" y="${(TOP + BASE) / 2 + 3}" text-anchor="end">${yMax / 2}</text>`)
  parts.push(`<text class="yl num" x="30" y="${BASE + 3}" text-anchor="end">0</text>`)

  // Intervention markers (dashed verticals + a short date at the top of each). The date carries a
  // small "start" prefix and NO ▲ glyph — on the first real artifact the triangle read as a data
  // spike/peak on the chart itself (R2-6); a dashed rule + a labelled "start ·" is unambiguously a
  // divider, and the one-line legend below the panels spells out what it marks.
  //
  // The mark is WEEK-GRANULAR — drawn at the centre of the 7-day bucket the start falls in — so the
  // legend promises the WEEK, not the day (B-496). Two interventions that start in the same week
  // share one vertical: surface the COUNT rather than silently drop the second (the old de-dup
  // discarded it from the chart entirely). Every start is still enumerated with its exact date in
  // the "Reading the trend" note below.
  const markersByBucket = new Map<number, ConcurrentChange[]>()
  for (const m of markers) {
    if (m.bucketIndex === null || m.bucketIndex < 0 || m.bucketIndex >= n) continue
    const group = markersByBucket.get(m.bucketIndex) ?? []
    group.push(m)
    markersByBucket.set(m.bucketIndex, group)
  }
  for (const [bucketIndex, group] of [...markersByBucket.entries()].sort((a, b) => a[0] - b[0])) {
    const mx = centerX(bucketIndex)
    parts.push(`<line class="mark" x1="${mx.toFixed(1)}" y1="18" x2="${mx.toFixed(1)}" y2="${BASE}"/>`)
    // Anchor the date label so it stays inside the plot (end-anchor in the right third).
    const anchor = mx > L + plotW * 0.66 ? 'end' : 'start'
    const lx = anchor === 'end' ? mx - 3 : mx + 3
    // Date the marker with the EARLIEST start in the week; prefix a count when it carries more.
    const earliest = group.reduce((a, b) => ((a.startDate ?? '') <= (b.startDate ?? '') ? a : b))
    const label =
      group.length > 1
        ? `${group.length} starts &middot; ${h(fmtDay(earliest.startDate))}`
        : `start &middot; ${h(fmtDay(earliest.startDate))}`
    parts.push(`<text class="ann" x="${lx.toFixed(1)}" y="11" text-anchor="${anchor}">${label}</text>`)
  }

  // X-axis: week-start date labels (PM) via the shared helper the protein chart also uses, so the
  // two weekly charts align on identical dates. Replaces the month-only ticks (R2-6) with per-week
  // orientation ("May 11, May 18 …"); the exact window bounds stay in the range box + caption.
  parts.push(weekAxisLabels(sym.bucketStartDates, L, slot, n, BASE))

  // Bars + count labels.
  //
  // A ZERO BAR AND AN UNOBSERVED WEEK ARE NOT THE SAME FACT (B-532, cold-read blocking). Both
  // used to draw the identical flat nub with a `0` printed on it, so "the owner logged this week
  // and nothing happened" and "nobody logged anything" were one glyph. The cold read hit the
  // second reading where it costs most: on a trial the owner stopped logging a week early, the
  // final `0` nub is the visual terminus of a descending curve and reads as *resolved* — with no
  // delta-caveat firing, because seven unlogged days out of twenty-eight clear that threshold
  // comfortably. Absence of a log is never evidence a symptom did not occur, and the chart is
  // what a 60-second scan actually takes.
  //
  // So an unobserved week gets no bar and no number: a hollow marker and a dash, which cannot be
  // read as a measured zero. It stays a distinct SHAPE rather than a colour, because §5.8 says
  // this page has to survive a black-and-white print.
  const unobserved: number[] = []
  for (let i = 0; i < n; i++) {
    const c = buckets[i]
    const cx = centerX(i)
    const x = cx - barW / 2
    const observed = (loggedByBucket[i] ?? 0) > 0
    if (c > 0) {
      const y = yFor(c)
      const height = BASE - y
      parts.push(`<rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${height.toFixed(1)}" rx="4"/>`)
      parts.push(`<text class="cap num" x="${cx.toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle">${c}</text>`)
    } else if (observed) {
      parts.push(`<rect class="nub" x="${x.toFixed(1)}" y="${BASE - 3}" width="${barW.toFixed(1)}" height="3" rx="1.5"/>`)
      parts.push(`<text class="z num" x="${cx.toFixed(1)}" y="${BASE - 7}" text-anchor="middle">0</text>`)
    } else {
      unobserved.push(i)
      parts.push(
        `<rect class="nolog" x="${x.toFixed(1)}" y="${(BASE - 9).toFixed(1)}" width="${barW.toFixed(1)}" height="9" rx="2"/>`,
      )
      parts.push(`<text class="z num" x="${cx.toFixed(1)}" y="${BASE - 13}" text-anchor="middle">&ndash;</text>`)
    }
  }
  // The marker is only legible where the sheet defines it, and only emitted when one was drawn.
  if (unobserved.length > 0) {
    parts.push(
      `<text class="ann" x="${R}" y="${BASE + 26}" text-anchor="end">&ndash; nothing logged that week (not a week without episodes)</text>`,
    )
  }

  // The alt text has to draw the same distinction the bars now do.
  const ariaBuckets = buckets
    .map((c, i) => ((loggedByBucket[i] ?? 0) > 0 ? String(c) : 'not logged'))
    .join(', ')
  const aria = `${symptomLabel(sym.type)} episodes per week: ${ariaBuckets}. Window ends ${h(fmtDay(windowEndDate))}.`
  return `<svg viewBox="0 0 648 158" role="img" aria-label="${h(aria)}">${parts.join('')}</svg>`
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
  const yMax = evenAxisMax(Array.from({ length: n }, (_, w) => weekTotal(w)))
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
  parts.push(`<text class="yl num" x="30" y="${(TOP + BASE) / 2 + 3}" text-anchor="end">${yMax / 2}</text>`)
  parts.push(`<text class="yl num" x="30" y="${BASE + 3}" text-anchor="end">0</text>`)

  // AN OFF-DIET ZERO AND AN UNLOGGED WEEK ARE NOT THE SAME FACT (B-497). This chart used to draw
  // NOTHING for either — so a week the owner logged with no off-diet food (a clean week) was
  // pixel-identical to a week nobody logged. On the one chart where blank could mean "clean", blank
  // was indistinguishable from "no data", while the symptom charts beside it drew a labelled nub for
  // the same emptiness — three charts on one page, two meanings for empty. So an observed-zero week
  // now draws the symptom chart's baseline nub + a `0`, and an unlogged week draws a hollow dashed
  // marker + a dash, never a measured `0` (clinical-guardrails: absence of a log is not evidence of
  // adherence). The "observed" test is `loggedDaysByBucket` — the SAME signal the symptom chart
  // uses — so "empty" reads identically across all three charts.
  const unobservedWeeks: number[] = []
  for (let i = 0; i < n; i++) {
    const cx = centerX(i)
    const x = cx - barW / 2
    const total = weekTotal(i)
    if (total > 0) {
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
      parts.push(`<text class="cap num" x="${cx.toFixed(1)}" y="${(yFor(total) - 5).toFixed(1)}" text-anchor="middle">${total}</text>`)
    } else if ((t.loggedDaysByBucket[i] ?? 0) > 0) {
      // A CLEAN week — the owner logged, nothing off-diet was recorded. A measured zero, drawn as the
      // symptom chart's observed-zero nub so "empty" reads the same across every chart on the page.
      parts.push(`<rect class="nub" x="${x.toFixed(1)}" y="${BASE - 3}" width="${barW.toFixed(1)}" height="3" rx="1.5"/>`)
      parts.push(`<text class="z num" x="${cx.toFixed(1)}" y="${BASE - 7}" text-anchor="middle">0</text>`)
    } else {
      // NO log of any kind that week — never a measured `0`; a hollow marker + a dash, matching the
      // symptom chart, keeps "no data" distinct from "a week with zero off-diet food" (B-497).
      unobservedWeeks.push(i)
      parts.push(
        `<rect class="nolog" x="${x.toFixed(1)}" y="${(BASE - 9).toFixed(1)}" width="${barW.toFixed(1)}" height="9" rx="2"/>`,
      )
      parts.push(`<text class="z num" x="${cx.toFixed(1)}" y="${BASE - 13}" text-anchor="middle">&ndash;</text>`)
    }
  }
  parts.push(weekAxisLabels(t.weekStartDates, L, slot, n, BASE))
  // The alt text draws the same three-way distinction the bars do — a week with no log is named as
  // unlogged, never voiced as a zero (B-497; the symptom chart's aria does the same).
  const ariaWeeks = Array.from({ length: n }, (_, i) =>
    weekTotal(i) > 0 ? String(weekTotal(i)) : (t.loggedDaysByBucket[i] ?? 0) > 0 ? '0' : 'not logged',
  ).join(', ')
  const aria = `Off-diet protein exposure per week: ${ariaWeeks}.`
  // print-color-adjust:exact inherits to the pattern fills so the bars survive a default clinic printer.
  return `<svg viewBox="0 0 648 148" role="img" aria-label="${h(aria)}" style="-webkit-print-color-adjust:exact;print-color-adjust:exact;"><defs>${defs}</defs>${parts.join('')}</svg>`
}

/** Capitalise a protein label for the legend ("chicken" → "Chicken"), leaving multi-word casing alone. */
function capProtein(p: string): string {
  return p.length ? p.charAt(0).toUpperCase() + p.slice(1) : p
}

// ── Protein sets (B-351 slice 5 — §9, Dr. Chen's three conditions) ────────────
//
// The three conditions govern every string below:
//   1. PROVENANCE, STATED ONCE — `PROTEIN_PROVENANCE_NOTE`, on the appendix sheet
//      that carries the sets. Label-derived, not lab-verified.
//   2. PRIMARY FIRST — the set always renders `proteins[0]` in bold, with the
//      secondaries subordinate behind "also". A 60-second scan never hunts for the
//      headline protein.
//   3. PRESENT-ONLY, NEVER CAUSAL — these render what IS in a food. Nothing here
//      says a protein caused anything, and there is no negative form except the
//      one D10 licenses: "nothing else on the label" renders ONLY behind
//      `complete`, which requires that the panel was actually captured AND read.
//      Without it the copy says the list was not captured, because the commonest
//      reason a set looks clean is that nobody read it — and a vet is exactly the
//      reader who would otherwise act on that silence.
// Names the ACTUAL provenance, which is not "someone read a label": it is an automated
// read of the owner's photo of the ingredient panel. The cold read caught the earlier
// wording implying a human transcription — and the page-1 self-contamination line is the
// most action-changing sentence in the report, so the reader needs the cue to verify it
// against the bag. Matches the register the report already uses for vomit-photo reads.
const PROTEIN_PROVENANCE_NOTE =
  'Proteins are an automated read of the owner&rsquo;s photo of each product&rsquo;s ingredient panel, owner-correctable &mdash; label-derived, not lab-verified, and worth confirming against the bag before acting on it.'

/**
 * "during the trial" — or, when the report sees only part of it, what it actually saw.
 *
 * THE RULE THIS ENFORCES, in the form five review rounds beat it into:
 *
 *   • a POSITIVE EXISTENTIAL survives a subset. "The record shows chicken in Cooper's
 *     diet during the trial" is true however little of the trial the report covers, and
 *     it only ever escalates. These keep "during the trial".
 *   • a COUNT does not. "Chicken ×1 · proteins fed during the trial" is over the
 *     evidence range, and trial scope understates it in the reassuring direction.
 *   • a NEGATIVE EXISTENTIAL does not either — and that clause was MISSING from the
 *     first two statements of this rule, which is how it shipped a live defect.
 *     "No medication or supplement is recorded as overlapping the trial window" printed
 *     over a trial a prednisolone course demonstrably overlapped, because the course sat
 *     in the trial days the window excluded. The report was byte-identical to one with
 *     no medication at all, and the drug caveat that would have suppressed §7.2's
 *     affirmative never fired. Reassurance-on-absence, on the confound §7 calls
 *     decisive: "a steroid course and a successful elimination produce the identical
 *     improving curve."
 *
 * So: an absence is only ever asserted over the span that was actually examined.
 */
function trialCountScope(t: NonNullable<ReportSnapshot['trial']>): string {
  const outside = t.trialDaysOutsideRange.before + t.trialDaysOutsideRange.after
  return outside > 0
    ? `in the ${num(t.trialDaysElapsed - outside)} trial days this report covers`
    : 'during the trial'
}

/** The off-trial marker. Present-only and explicitly non-causal; defined once per sheet. */
function offTrialFootnote(targetProtein: string | null): string {
  return targetProtein
    ? `<p class="note"><b>*</b> a protein other than the trial protein (${h(
        capProtein(targetProtein),
      )}), present on that food&rsquo;s label. This records exposure only; Culprit draws no link between it and any symptom.</p>`
    : ''
}

/**
 * One food's protein set, rendered: bold primary, quiet secondaries, D10 qualifier.
 *
 * `markOffTrial` adds the `*` to each off-trial protein. It is passed in rather than
 * read off the view unconditionally because the marker is only meaningful on a sheet
 * that defines it — an unexplained asterisk on page 1 is worse than none.
 */
function proteinSetPhrase(v: ProteinSetView, markOffTrial: boolean): string {
  const off = new Set(markOffTrial ? v.offTrial : [])
  const star = (p: string): string => (off.has(p) ? '<b>*</b>' : '')
  const mark = (p: string): string => `${h(capProtein(p))}${star(p)}`
  const [main, ...rest] = v.proteins
  // No captured proteins at all: never "none" (that is a claim), always the absence
  // of a reading. Renders the same under complete/incomplete because an empty set can
  // never be complete — see mayClaimCompleteProteinSet.
  if (!main) return '<span class="rnote">no protein recorded</span>'
  // The marker sits OUTSIDE the emphasis, not inside it. A food whose own primary is
  // off-trial is the common case in this block (any non-trial food fed alongside a
  // trial), and wrapping mark() wholesale produced nested <b>Chicken<b>*</b></b>.
  const head = `<b>${h(capProtein(main))}</b>${star(main)}`
  if (!v.complete) {
    // The one branch that must never imply the set is everything. Secondaries still
    // render — they are real, captured exposures — but the qualifier travels with them.
    const alsoBit = rest.length ? `, also ${rest.map(mark).join(', ')}` : ''
    return `${head}${alsoBit} <span class="rnote">&middot; ingredient list not captured</span>`
  }
  if (rest.length === 0) return `${head} <span class="rnote">&middot; nothing else on the label</span>`
  return `${head}, also ${rest.map(mark).join(', ')}`
}

/**
 * The off-trial exposures that make an active trial's protein picture non-clean, split
 * by how they reach the pet (B-351 slice 5).
 *
 * Computed ONCE and shared by the headline, the trial-diet line and the exposure chart,
 * because a cold read caught the three disagreeing: the chart quantified chicken as 7
 * discrete feedings directly above a line saying chicken was continuously available.
 * Same page, same snapshot, two renderers, one of them missing the fact.
 *
 * `inTrialFood` is §8 shape ① (the trial diet contaminating itself); `freeFed` is the
 * worst form of shape ② — an ad-lib competing antigen the discrete tally structurally
 * cannot count, because it is not a feeding event at all.
 */
function trialProteinBreaches(snap: ReportSnapshot): {
  inTrialFood: string[]
  /** §5.5 D-A — a food on the ALLOWED LIST (not the trial diet) whose label carries a
   *  protein beyond its own front-of-pack claim. Its own set and its own sentence: the
   *  finding is about the owner's list and the vet's own prescribing, not about the
   *  trial food's manufacturer. */
  permittedExtras: ContaminationFact[]
  freeFed: string[]
  /** True when the off-trial check could NOT be run at all — an active trial whose food
   *  carries more than one protein but no designated main, so there is nothing to compare
   *  against. Distinct from "no breaches found", and the render must not let the two share
   *  a silence. */
  targetUnknown: boolean
  /** Any breach came from a bowl shared with another pet ⇒ availability, not intake. */
  fromSharedBowl: boolean
} {
  const empty = { inTrialFood: [], permittedExtras: [], freeFed: [], targetUnknown: false, fromSharedBowl: false }
  if (!snap.diet.trial) return empty
  if (snap.diet.trialTargetProtein == null) {
    // The THIRD meaning of page-1 silence, found by the adversarial re-check. The fix
    // commit enumerated two ("this diet is single-protein" and "nobody read the label")
    // and wrote a string for one. This is the case where the owner CLEARED the main
    // protein — a supported action — so the trial food may carry a fully-read,
    // multi-protein set and the check still cannot run, because nothing says which
    // protein the trial is built on. `complete` is true, so the unread escape hatch
    // never fires, and page 1 goes completely quiet on a self-contaminated trial diet.
    return { ...empty, targetUnknown: snap.diet.trial.proteinSet.proteins.length > 1 }
  }
  const freeFedBreaches = snap.diet.freeFed.filter((f) => f.proteinSet.offTrial.length > 0)
  // D-A, ADDED AT B-417 PR 7. `inTrialFood` only ever read the PRIMARY diet's own set,
  // so a permitted EXTRA carrying a second protein — the vet-approved dental chew that
  // lists chicken by-product meal — never reached the headline. The artifact: a dog got
  // chicken on 25 occasions through the allowed list on a hydrolysed-soy skin trial, and
  // page 1's two most prominent numbers (43/43 coverage, 4/154 exposures) both read clean
  // while the invalidating fact sat in grey prose three lines down. A 60-second read
  // concluded "continue to day 56, partial response" where the record says the trial is
  // void. §5.5 D-A: "the vet-approved rabbit jerky that also lists chicken fat is exactly
  // as trial-invalidating as a contaminated primary diet, and less likely to be noticed."
  //
  // IT IS A THIRD SET, NOT AN ADDITION TO THE FIRST — and the first draft of this fix
  // got that wrong, which the cold read ranked above every finding it replaced. Unioning
  // permitted extras into `inTrialFood` made them print in the TRIAL FOOD's voice: page 1
  // said "The trial food's own label also lists Chicken" about a clean hydrolysed diet,
  // while appendix B said "Soy · nothing else on the label" on the same document. That
  // does not under-report a problem, it MISDIRECTS a confident action — discard the
  // prescription diet and blame the manufacturer, where the record says drop the dental
  // chew and continue the diet. Confident wrong action beats timid wrong action for harm.
  // Each breach path owns its own sentence, exactly as `freeFed` already did.
  return {
    inTrialFood: snap.diet.trial.proteinSet.offTrial,
    permittedExtras: (snap.trial?.contamination ?? []).filter((c) => c.food.role !== 'primary_diet'),
    freeFed: [...new Set(freeFedBreaches.flatMap((f) => f.proteinSet.offTrial))],
    targetUnknown: false,
    fromSharedBowl: freeFedBreaches.some((f) => f.isShared),
  }
}

/** The one-clause epistemic qualifier for a protein claim made OUTSIDE appendix B, where
 *  the full provenance note lives. Promoting a claim to page 1 must not leave its
 *  provenance behind — a vet may change a prescription diet on the strength of it. */
const PROTEIN_READ_CAVEAT =
  '<span class="rnote">Read automatically from the owner&rsquo;s photo of the label &mdash; worth confirming against the bag.</span>'

/**
 * The compact table-cell form (appendices C and E): no bold, order carries prominence.
 *
 * The incompleteness qualifier is WORDS, not a glyph. It was a faint `…` and the cold
 * read called the hierarchy inverted: in a table where the marker is near-universal, the
 * `*` carries little information while "nobody read this product's ingredient list" is
 * the highest-information mark on the sheet — and it was getting the weakest possible
 * treatment. `Beef*…` is not a sentence a vet parses at speed.
 */
function proteinSetCell(v: ProteinSetView, markOffTrial: boolean): string {
  const off = new Set(markOffTrial ? v.offTrial : [])
  if (v.proteins.length === 0) return ''
  const list = v.proteins.map((p) => `${h(capProtein(p))}${off.has(p) ? '*' : ''}`).join(', ')
  return v.complete ? list : `${list} <span class="rnote">&middot; list not read</span>`
}

function proteinTimelineSection(snap: ReportSnapshot): string {
  const t = snap.proteinTimeline
  if (t.proteins.length === 0 && !t.hasUnknown) return '' // nothing off-diet to chart
  // A chart that counts DISCRETE feedings sat directly above a diet line saying a protein
  // was CONTINUOUSLY available, and said nothing about it — so the same page quantified
  // chicken as 7 sporadic events while asserting it was always in the bowl. A vet reads
  // the number, not the contradiction, and concludes the confounding is minor. The
  // appendix-C lead has carried this caveat all along; the chart needs it more, because
  // the chart is the thing that looks like a measurement.
  const freeFedStanding = [...new Set(snap.diet.freeFed.flatMap((f) => f.proteinSet.proteins))]
  const standingBit = freeFedStanding.length
    ? ` ${h(proteinList(freeFedStanding.map(capProtein)))} ${
        freeFedStanding.length === 1 ? 'is' : 'are'
      } also continuously available in a free-fed bowl and cannot be counted as feedings at all, so ${
        freeFedStanding.length === 1 ? 'it does' : 'they do'
      } not appear in these bars.`
    : ''
  const n = t.weekStartDates.length
  const legend =
    t.proteins
      .map((p, j) => `<span class="ptleg">${proteinSwatch(`pts-${j}`, PROTEIN_COLORS[j % PROTEIN_COLORS.length], j)}${h(capProtein(p))} ${num(t.totalByProtein[p] ?? 0)}</span>`)
      .join('') +
    (t.hasUnknown ? `<span class="ptleg">${proteinSwatch('pts-u', null, 0)}no recorded protein ${num(t.unknownByWeek.reduce((a, b) => a + b, 0))}</span>` : '')
  // Name the dashed no-data marker where it is drawn (B-497). A week is unlogged iff nothing at all
  // was logged AND no off-diet feeding fell in it — the same test the chart applies bar-by-bar.
  const anyUnloggedWeek = t.weekStartDates.some((_, i) => {
    const weekTotal = (t.bins[i]?.reduce((a, b) => a + b, 0) ?? 0) + (t.unknownByWeek[i] ?? 0)
    return weekTotal === 0 && (t.loggedDaysByBucket[i] ?? 0) === 0
  })
  const noDataNote = anyUnloggedWeek
    ? `<div class="subnote">&ndash; marks a week with no log of any kind — not a week without off-diet food.</div>`
    : ''
  return `
  <div class="sec">
    <h2>Off-diet protein exposure over time</h2>
    <div class="trend">
      ${proteinTimelineChart(t)}
      ${noDataNote}
      <div class="ptlegend">${legend}</div>
      <div class="subnote">${num(t.totalFeedings)} off-diet feeding${
        t.totalFeedings === 1 ? '' : 's'
      } ${
        // §12: every caption is checked against the computation beneath it. This chart
        // bins whatever `provenance.confounders` holds, and since PR 7 that is the
        // TRIAL-DERIVED set on a trial report — which includes a rival kibble fed as a
        // MEAL and excludes the vet-permitted treat, so "(treats + human food)" named
        // the wrong set in both directions.
        snap.trial && !snap.trial.allowedSetUnavailable
          ? '(feedings not matched to the trial diet or the allowed list)'
          : '(treats + human food)'
      } over ${num(n)} week${
        n === 1 ? '' : 's'
      }; each bar is one week, stacked by protein. A food containing several proteins counts once for each, so a week&rsquo;s stack can total more than its feedings.${
        t.incompleteFeedings > 0
          ? ` ${num(t.incompleteFeedings)} feeding${
              t.incompleteFeedings === 1 ? '' : 's'
            } involved a food whose ingredient panel was never captured, so these bands are a floor.`
          : ''
      }${standingBit} Colour is a convenience — every protein also carries a texture, so this reads in black &amp; white. Itemised in appendix&nbsp;C.</div>
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
    `<rect width="${dim}" height="${dim}" fill="var(--surface)"/><g fill="var(--ink)">${rects}</g></svg>`
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
        <span class="hqrcap">getculprit.app</span>
      </div>
    </div>
  </div>
  <div class="rule-brand"></div>
  <div class="orient">Clinical summary: this page. Appendices A&ndash;${lastAppendix} (+ a legend): the reference record behind every figure.</div>`
}

/**
 * How close to the window's opening day the first logged episode has to be before the
 * chronicity span is stated as a FLOOR rather than as an onset (B-532).
 *
 * A week, and the number is not doing clinical work: it is a statement about the report's
 * own edge. A sign whose first log lands inside the first week of a window that opens at a
 * vet visit is a sign the window is very likely truncating — the owner started logging
 * because of that visit — while one that appears in week four has a start date the record
 * genuinely observed. Erring long only ever ADDS the disclosure, which is the safe
 * direction: the cost of an unnecessary "this is a floor" is a clause, and the cost of a
 * missing one is a vet reading a four-month problem as a five-week one.
 */
const CHRONICITY_LEFT_CENSOR_DAYS = 7

/** Whole days from `fromKey` to `toKey` (both `YYYY-MM-DD`); negative if `toKey` is earlier. */
function daysBetweenDayKeys(fromKey: string, toKey: string): number {
  const a = Date.parse(`${fromKey}T00:00:00Z`)
  const b = Date.parse(`${toKey}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY
  return Math.round((b - a) / 86_400_000)
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
      // #8 — TELL THE TRUTH WHEN THE FLOOR MOVED IT. `MIN_TRIAL_SCOPE_DAYS` extends
      // the window backwards so a trial started today does not collapse the report to
      // one day (B-423), which means the label is false on every trial younger than
      // 28 days: the adversarial pass got "Scoped to since diet-trial start (Jun 5 –
      // Jul 2)" for a trial that started Jun 30. The floor was also undisclosed, so a
      // vet had no way to know why the window predated the intervention.
      return scope.trialStartDate && scope.startDate < scope.trialStartDate
        ? 'Diet trial, extended back for pre-trial baseline'
        : 'Since diet-trial start'
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

  // THE ACTIVE PROBLEM LIST BELONGS WITH THE SIGNALMENT (B-532, cold-read blocking).
  //
  // It lived in an Appendix B table row three pages back, and the cold read showed what that
  // costs on the one report shape nobody had rendered before: a completed, well-logged, clean-
  // looking venison trial with a falling itch curve, whose patient is a diagnosed atopic
  // Westie. "Atopic dermatitis (active)" reframes every number on page 1 — it is the competing
  // explanation for the falling curve — and page 1 never said it. Two careful readers took
  // opposite plans off that page, which is exactly the test the report has to pass.
  //
  // A pre-existing diagnosis is not a finding this report computed and is not rendered as one:
  // it is the patient's recorded history, stated where a clinician reads species, age and
  // weight, because that is the block that frames everything after it.
  const active = snap.provenance.conditions.filter((c) => c.status === 'active')
  const condBit =
    active.length > 0
      ? `<div class="cond"><b>Recorded conditions:</b> ${active
          // THE YEAR IS THE POINT. A condition diagnosed months or years before this window
          // is the reason the row belongs on page 1 at all, and a bare "Nov 14" reads as
          // in-window on a report that opens in May.
          .map((c) => `${h(c.name)}${c.diagnosedAt ? ` <span class="rnote">(since ${h(fmtDayYear(c.diagnosedAt))})</span>` : ''}`)
          .join(' &middot; ')} <span class="rnote">owner-recorded history, not a finding in this window</span></div>`
      : ''

  const scope = snap.scope
  return `
  <div class="ident">
    <div class="who">
      <div class="name">${h(s.name)}</div>
      <div class="sig">${sig}</div>
      <div class="wt">${ownerBit}${weightBit}</div>
      ${condBit}
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
  // WHICH SIDE, WHEN THE CROP HAS TWO (B-600, cold read round 11). A one-ended crop is
  // adequately served by a scalar — everything excluded is on the side the reader can
  // infer. A hand-picked window can crop both ends, and there the same sentence hides
  // the difference between five events the reader already knows predate the window and
  // five sitting in the days AFTER it: on a completed trial reported through a window
  // closing eleven days early, the excluded tail is the part the trial is read on, and
  // the page's visible trend ended on a zero week.
  //
  // This guard is advertised by name ("shown so nothing is cropped to a good week"), so
  // B-494's rule binds it — an advertised guard reads as a complete one.
  const split =
    sc.outOfWindowBefore > 0 && sc.outOfWindowAfter > 0
      ? ` &mdash; ${num(sc.outOfWindowBefore)} before it and <b>${num(
          sc.outOfWindowAfter,
        )} after it</b>`
      : ''
  return `
  <div class="cherry"><b>Custom range.</b> ${num(sc.outOfWindowSymptomCount)} symptom event${
    sc.outOfWindowSymptomCount === 1 ? '' : 's'
  } fall outside this window${split}${recent} — shown so nothing is cropped to a good week.</div>`
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
      const dates = f.incidents.map((i) => fmtLocalDay(i.occurredAt, tz)).join(', ')
      const anyFresh = f.incidents.some((i) => i.kind === 'fresh_red')
      const noun = f.source === 'stool' ? 'stool incident' : 'vomiting incident'
      // Blood-kind phrase — with anatomy correct per source. Vomit: fresh vs coffee-ground (digested).
      // Stool: fresh_red = haematochezia (lower-GI / large-bowel); dark_tarry = melena (digested,
      // often UPPER-GI — the anatomy the §3.7 line originally inverted; vet-report-cold-read PR 7).
      let kindPhrase: string
      if (f.source === 'stool') {
        const anyDark = f.incidents.some((i) => i.kind === 'dark_tarry')
        kindPhrase = anyFresh && anyDark
          ? 'possible blood — fresh red (haematochezia, lower-GI) and black/tarry (possible melena — digested blood, often upper-GI)'
          : anyFresh && f.incidents.every((i) => i.kind === 'fresh_red')
            ? 'possible fresh (red) blood — haematochezia, a lower-GI (large-bowel) sign'
            : anyDark && f.incidents.every((i) => i.kind === 'dark_tarry')
              ? 'possible black/tarry stool — melena (digested blood, often upper-GI)'
              : anyDark || anyFresh
                ? 'possible blood (fresh and/or black/tarry)'
                : 'possible blood (subtype unread)'
      } else {
        kindPhrase = anyFresh
          ? f.incidents.every((i) => i.kind === 'fresh_red')
            ? 'possible fresh (red) blood'
            : 'possible blood (fresh and/or digested)'
          : 'possible coffee-ground (digested) blood'
      }
      return flagRow(
        'Possible blood',
        // R2-6 — attribute to the mechanism ("automated photo analysis"), never the brand ("a photo
        // Culprit flagged"). This originally guarded an app-name/patient-name collision (both "Nyx");
        // with the brand now "Culprit" the collision is gone, but mechanism-not-brand is still the
        // correct clinical voice, so the attribution stands. R2-4 — the AI provenance sentence
        // collapses into the uniform badge; the present-only qualifier stays.
        // PR 7 — the flagged photo also leads the band (thumbnail), impossible to miss.
        `<b>${num(n)} ${noun}${n === 1 ? '' : 's'} (${h(dates)})</b> — ${h(kindPhrase)} on automated photo analysis. ${aiBadge()} Shown because it is present; a photo cannot exclude bleeding.${safetyBandThumbs(
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
    case 'trial_diet_refusal': {
      // B-494. The feline clock is the reason this flag exists at all: the canonical case is a
      // cat many multiples past the 48–72h hepatic-lipidosis window whose record produced no
      // flag of any kind, because the only intake detector on the page is a RELATIVE one.
      const feline =
        f.species === 'cat'
          ? ' In cats, ≥48–72&nbsp;h of markedly reduced intake is a hepatic-lipidosis risk window.'
          : ''
      const wide = f.refusal?.population === 'meal_record'
      const bits: string[] = []
      if (f.refusal) {
        // THE DENOMINATOR IS NOT OPTIONAL. "38 feedings refused" reads the same whether the
        // owner rated 38 or 380, and the vet's first question is how much of the record this is.
        const r = f.refusal
        const noun = wide ? 'rated meal' : 'rated feeding'
        const of = wide
          ? ''
          : f.trialDietLabels.length > 0
            ? ` of ${h(f.trialDietLabels.join(' / '))}`
            : ' of the trial diet'
        bits.push(
          `<b>${num(r.refusedFeedings)} of ${num(r.ratedFeedings)} ${noun}${
            r.ratedFeedings === 1 ? '' : 's'
          }${of} left unfinished</b> across ${num(r.days)} day${r.days === 1 ? '' : 's'}.`,
        )
      }
      // ⚠️ NO SENTENCE HERE ABOUT WHAT THE RECORD DOES NOT CONTAIN. A repair pass added
      // "The trial ran to this window with no intake ratings logged against it" to this
      // branch and `adversarial-reviewer` executed it: `refusal` is null whenever the
      // FLOORS are unmet, not only when ratings are absent, so a trial with 20 rated
      // feedings (5 refused — a 25% share, under `REFUSAL_SHARE`) whose owner marked it
      // `stopped_reason='refused'` printed that line on the safety band beside its own
      // page-1 "15 of 20 rated meals fully eaten". A flatly false claim, self-contradicted
      // one section away, in the zone that can least afford it. The flag payload cannot
      // tell the two causes apart, so the honest move is to say nothing: the
      // owner-declared sentence below already states what this flag rests on.
      //
      // ONE DATE ANCHOR, ON EVERY PATH, and it is labelled for what the value IS. The
      // range is the documented OVERLAP (`max(scope start, trial start, first log) …
      // min(today, ended_at, scope end)`), so calling it the "trial window" asserted
      // something the value does not support — executed on a trial started Apr 1 whose
      // logs begin Jun 15, where the band read "Trial window: Jun 15 – Jul 2" in the same
      // paragraph as "day 93 of 120".
      bits.push(`Dates covered: ${h(fmtRange(f.evidenceStartDate, f.evidenceEndDate))}.`)
      if (wide) {
        // THE ATTRIBUTION GAP IS DISCLOSED, NOT PAPERED OVER (B-530). Under this population the
        // app could not resolve which logged food was the prescribed diet, so naming the diet
        // here would assert exactly what it just failed to establish. The clinical fact — this
        // animal is not finishing what is put down — is unaffected by that failure, which is the
        // whole reason the lane falls back rather than going silent.
        bits.push(
          'These meals could not be matched to the foods on the trial&rsquo;s allowed list, so the food is not named &mdash; the finding is about the meal record.',
        )
      }
      if (f.stoppedForRefusal) {
        bits.push('The owner ended this trial because the pet would not eat the diet.')
      }
      // COMPOSE WITH THE WEIGHT, ON THE FLAG ITSELF. The cold read's finding was not that any
      // one fact was missing — refusal, weight delta, typical intake and the free-fed bowl were
      // all on the page — but that they were distributed across four sections and never put
      // together, so the 60-second scan never assembled the picture. The weight sentence is
      // trial-scoped and already guarded (`weightDuringTrial`); it leads here when it exists.
      const weight = weightDuringTrial(snap)
      if (weight) bits.push(weight)
      bits.push(
        // NEVER "the pet is picky" and never a preference frame: decline is frequently a DISEASE
        // signal, and a prescription diet is not a food the animal chose. Presence-only — this
        // says nothing about a record where intake was never rated.
        //
        // AND THE CLOSING NOUN FOLLOWS THE POPULATION TOO. The wide branch two lines up
        // disclaims the attribution, and this sentence then re-asserted it — "the food is not
        // named" followed by "refusal of a prescribed diet", two clauses apart on a vet's
        // artifact. `trialViabilityNote` was rewritten for exactly this on the card; the
        // report's closing sentence had not been.
        `<b>${
          wide ? 'Food going uneaten' : 'Refusal of a prescribed diet'
        } is a clinical finding in its own right</b>, not a preference.${feline} Shown because it is present in the log; it is not a measure of how much was eaten overall. Intake ratings in appendix&nbsp;E.`,
      )
      return flagRow('Diet not eaten', bits.join(' '))
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
      // "FIRST NOTED" IS A CLAIM ABOUT THE ANIMAL; THIS NUMBER IS A FACT ABOUT THE WINDOW
      // (B-532, cold-read secondary). The onset is whatever the earliest in-window episode
      // is, so on a report scoped to "since last vet visit" it lands within days of the
      // window opening almost by construction — and the cold read read "first noted ~May 21"
      // off a dog whose pruritus is a MONTHS-old active condition on this same report's own
      // conditions row. A vet who takes that at face value gets a five-week problem where
      // the record holds a four-month one, and chronicity is precisely the axis they are
      // reading this flag for.
      //
      // The span is therefore stated as a FLOOR when the first episode sits near the window
      // edge — the same vocabulary the exposure counts use, for the same reason. Not
      // suppressed and not softened: the flag still fires, still leads, and still says the
      // pattern is sustained. It simply stops asserting a start date it cannot know.
      const onsetDay = fmtLocalDay(f.firstOnsetIso, tz)
      const leftCensored = daysBetweenDayKeys(snap.scope.startDate, localDayKeyOf(f.firstOnsetIso, tz)) <= CHRONICITY_LEFT_CENSOR_DAYS
      const censorBit = leftCensored
        ? ` This window opens ${h(fmtDay(snap.scope.startDate))}, so ${num(f.spanDays)} days is a floor &mdash; the record cannot show how long the sign predates it.`
        : ''
      return flagRow(
        'Chronicity',
        `<b>${h(symptomLabel(f.symptomType))} has been ongoing ${num(f.spanDays)} day${
          f.spanDays === 1 ? '' : 's'
        }</b> (first logged ${h(onsetDay)}): ${num(f.episodeCount)} episode${
          f.episodeCount === 1 ? '' : 's'
        } on ${num(f.symptomDays)} day${f.symptomDays === 1 ? '' : 's'}; most recent ${num(
          f.daysSinceLastEpisode,
        )} day${f.daysSinceLastEpisode === 1 ? '' : 's'} ago. A sustained pattern over many samples, not a single incident.${censorBit}`,
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
  if (q.question === 'diet_trial_working' && snap.diet.trial) {
    const t = snap.diet.trial
    const food = t.foodLabel ? h(t.foodLabel) : 'a diet trial'
    const vet = t.vetName ? `, directed by ${h(t.vetName)}` : ''
    // "Day 46 of 56" asserts a trial that is RUNNING. When the record shows an off-trial
    // protein in the trial food or continuously available in a bowl, that assertion is
    // the wrong frame for everything below it — and a cold read proved the cost: scanning
    // top-down and stopping early yielded "40 days of diarrhoea on a well-adhered duck
    // trial → not food-responsive → scope her", when the honest reading was "this has
    // never been an elimination trial; the symptom figures are uninterpretable as a trial
    // result." Opposite plans, and the expensive one was the one the page invited.
    //
    // So the qualifier rides the headline itself, not a section six blocks down. It says
    // what the record shows and stops — no verdict on whether the trial "failed", which is
    // the clinician's call and not derivable from an exposure set.
    const breach = trialProteinBreaches(snap)
    // All three breach paths belong here, and that is safe where it was NOT safe in the
    // diet section: this sentence names the PROTEIN and the PET, never the food, so it
    // cannot mis-attribute the source. "The record shows Chicken in Cooper's diet during
    // the trial" is true of a contaminated trial diet, a contaminated permitted treat and
    // an ad-lib bowl alike, and points at the diet section for which.
    const breachNames = [
      ...new Set([
        ...breach.inTrialFood,
        ...breach.permittedExtras.flatMap((c) => c.extraProteins),
        ...breach.freeFed,
      ]),
    ]
    // "reaching {pet}" asserted CONSUMPTION, and a free-fed bowl is exactly the exposure
    // we cannot say that about — more so a bowl shared with another pet, whose
    // "intake not directly observed" caveat sits a block below, on the line a scanner
    // stops before. Promoting the fact has to promote its qualifier with it: "in the
    // diet" is true of a contaminated trial food AND an available bowl without claiming
    // either was eaten.
    const availabilityBit = breach.freeFed.length
      ? ` (some of it${breach.fromSharedBowl ? ' in a bowl shared with another pet' : ' free-fed'}; intake not directly observed)`
      : ''
    const breachBit = breachNames.length
      ? ` <b>The record shows ${h(proteinList(breachNames.map(capProtein)))} in ${h(
          snap.signalment.name,
        )}&rsquo;s diet during the trial${availabilityBit}</b> — see the diet section before reading the trial as a result.`
      : breach.targetUnknown
        ? ` <b>No main protein is recorded for the trial food, so its other proteins cannot be checked against the trial.</b> Its full set is in appendix&nbsp;B.`
        : ''
    // PRESENT TENSE IS A CLAIM. A trial the owner completed or stopped still
    // describes this report (§7's day-after-completion AC), and "Tracking X as a
    // diet trial — day 19 of 28" over a diet the cat came off three weeks ago is
    // B-455 rendered in words. `trialDayPhrase` also refuses to print "day 61 of 56":
    // Dr. Chen on the design lock — "an app that renders Day 61 of 56 tells me nobody
    // is reading it" — and with 70–80% of trials abandoned, overrun is the steady state.
    const tb = snap.trial
    const lead = tb && tb.status !== 'active'
      ? `${tb.status === 'completed' ? 'Completed' : 'Stopped early'}: <b>${food}</b> as a diet trial${vet}`
      : `Tracking <b>${food}</b> as a diet trial${vet}`
    // ── TWO SPANS IN ONE SENTENCE, AND THE COUNT HAD NO WINDOW (B-600) ─────────
    //
    // `trialDayPhrase` counts the TRIAL ("day 73 of 84"); `primPhrase` counts the
    // WINDOW ("vomiting (1 logged)"). Bolded, first line of the page, no denominator
    // on the count and no dates on either — so the cold read carried the 1 across the
    // 73 and left with "one vomit in seventy-three days on the diet, it's working,
    // finish it and rechallenge." The record supports "once in the eleven logged days
    // of a thirty-one day window", and the two readings end in opposite plans.
    //
    // The trial block's slice disclosure could not save it: that sentence lives four
    // paragraphs down and its own scoping word was "below", which excludes this line
    // by construction. A disclaimer that exempts the sentence needing it is not a
    // disclaimer. So the window rides the headline, at the count, where the collision
    // happens.
    //
    // It names only `outside` and `trialDaysElapsed` — both authoritative — and asserts
    // nothing about how many days it DOES show. The symptom count beside it is over the
    // report window while the trial block's figures are over the overlap, and those two
    // spans are not always equal; a single number here would have to be one or the
    // other and would be read as both.
    const outsideHere = tb ? tb.trialDaysOutsideRange.before + tb.trialDaysOutsideRange.after : 0
    const windowBit =
      outsideHere > 0 && tb
        ? ` <b>This report covers ${h(fmtRange(snap.scope.startDate, snap.scope.endDate))} &mdash; ${num(
            outsideHere,
          )} of the trial&rsquo;s ${num(tb.trialDaysElapsed)} days fall outside it</b>, so the count above is over that window, not over the trial.`
        : ''
    return `
  <div class="headline">${lead} &mdash; ${trialDayPhrase(tb, t.targetDurationDays)}. Primary sign logged: <b>${primPhrase}</b>.${windowBit}${breachBit}</div>`
  }
  const hasChronic = snap.safetyFlags.some((f) => f.kind === 'chronicity')
  const chronicBit = hasChronic ? ' Ongoing pattern — see the safety flags above.' : ''
  return `
  <div class="headline">Owner monitoring <b>${primPhrase}</b> over this window — no diet trial; symptom monitoring only.${chronicBit}</div>`
}

// ── The diet-trial block (B-417 §7) ──────────────────────────────────────────
//
// C4, CLOSED (PM, 2026-07-25, against the round-2 mock): TWO-ELEMENT. It ships the
// medication overlap and the interpretability statement; `diet_class` and the
// derived prior-diet line were cut (the latter survives as B-217).
//
// The block sits ABOVE the symptom trend because §7 rules the report's hierarchy
// the OPPOSITE way round from the card's, deliberately: "the card's job is keeping
// the owner in the trial; the report's job is letting the vet act", so the card
// leads with progress and the report leads with coverage and exposures.
//
// FOUR THINGS MAY NEVER APPEAR HERE, and each one is a rendered sentence someone
// tried to write:
//   • The NEGATIVE claim (§5.2 / G2). No "no off-diet foods logged", at any
//     coverage. The affirmative "all N matched" is a statement about the RECORD and
//     is gated on `mayClaimAllMatched`, which can only ever withhold it.
//   • A VERDICT on the trial (§6.1). Coverage, exposures and the symptom trend are
//     three separate facts; the owner supplies the outcome; the vet decides.
//   • A SCORE for the owner (§6.9). No percentage, grade, bar, streak or badge —
//     coverage is a data-quality statement about the record, never a performance
//     statement about the person.
//   • An ADHERENCE line over a diet that was not eaten. A trial the pet refused is
//     structurally incapable of reading as one that was followed (the round-1b
//     Jordan finding: "All 54 matched the trial diet" three lines above "wouldn't
//     eat it").
function dietTrialSection(snap: ReportSnapshot): string {
  const t = snap.trial
  if (!t) return ''
  const pet = h(snap.signalment.name)
  const rows: string[] = []

  // ── Identity ────────────────────────────────────────────────────────────────
  const labels = t.trialDietLabels.length
    ? t.trialDietLabels.map((l) => h(l)).join(' + ')
    : 'Trial diet (not named)'
  const identity: string[] = [
    // THE JOIN NEEDS ITS OWN PUNCTUATION (cold read round 10, all four artifacts). The
    // phrase was concatenated straight onto the next clause, and on an ended trial that
    // produces a FALSE COMPOUND: "of a 42-day window Jun 1 – Jun 19 · stopped early"
    // asserts a 42-day window spanning nineteen days. A later sentence corrects each
    // one, which is why no artifact was blocked by it — and why one delimiter fixes it
    // on all four.
    `${labels} &middot; ${trialDayPhrase(t, t.targetDurationDays)}.`,
  ]
  identity.push(
    t.status === 'active'
      ? `Started ${h(fmtDay(t.startedAt))}.`
      : `${h(fmtDay(t.startedAt))} &ndash; ${h(fmtDay(t.endedAt))} &middot; ${
          t.status === 'completed' ? 'completed' : 'stopped early'
        }.`,
  )
  if (t.indication) identity.push(`Indication: ${h(indicationLabel(t.indication))}.`)
  if (t.vetName) identity.push(`Directed by ${h(t.vetName)}.`)
  if (t.stoppedReason) identity.push(`<b>${h(stoppedReasonLine(snap.signalment.name, t.stoppedReason, t))}</b>`)
  rows.push(kv('Trial', identity.join(' ')))

  // ── §5.1's two facts, over ONE explicit range, never in one sentence ────────
  //
  // "Coverage is about DAYS WITH MEALS; exposure is about ALL FEEDINGS. They never
  // share a sentence." v0.97 welded them and the welded sentence is false in a
  // common case — a treat-only day is excluded from the day ratio and included in
  // the feeding count, and 15.7% of live covered days are treat-only.
  const recordBits: string[] = []
  // ── B-600 — SAY WHAT SLICE OF THE TRIAL THIS IS, BEFORE ANY OF ITS NUMBERS ──
  //
  // The identity row one line up counts the TRIAL ("day 73 of 84"); every figure
  // from here down is counted over the OVERLAP. On the first report of a trial
  // those are the same span and this says nothing. On the second — the one an
  // owner sends at or after a recheck, where `since_visit` opens the window at the
  // visit — they are not, and a reader who does not know that misreads every
  // count in the block by the same factor.
  //
  // IT LEADS THE RECORD ROW RATHER THAN JOINING §7.2's CAVEATS at the foot of the
  // block, for two reasons. It is not a caveat about the record's quality, it is a
  // statement about what this document is, so it has to arrive before the numbers
  // it re-scopes rather than after them. And round 4 fought to have the refusal
  // sentence LEAD that callout on the sickest patient; a truncated report of a
  // refusing pet must not push "not one rated feeding was finished" into second
  // place to make room for a scoping note.
  //
  // ⚠️ THE ARITHMETIC READS `trialDaysElapsed`, NEVER `dayCounter`. The first cut of
  // this sentence derived both numbers from `dayCounter`, which is already bounded at
  // the EVIDENCE end — so on a hand-picked window ending in the past it subtracted the
  // `after` days a second time and rendered *"This report shows 1 day of a trial that
  // has run 30 — 43 trial days fall after it"* one clause above *"Meals logged on 30 of
  // 30 days"*. Three wrong numbers, contradicting each other and the next sentence, on
  // the cherry-pick basis this disclosure exists for; the raw slice was −13 and only
  // `Math.max(1, …)` made it printable. `shown + before + after === trialDaysElapsed`
  // is an identity, and it is asserted as one.
  const outside = t.trialDaysOutsideRange
  const outsideDays = outside.before + outside.after
  const truncated = outsideDays > 0
  // ── AN EXISTENTIAL SURVIVES A SUBSET; A COUNT DOES NOT ─────────────────────
  //
  // The rule four review rounds converged on, written where it can be applied.
  // "The record shows chicken in Cooper's diet during the trial" stays true however
  // little of the trial the report sees — if it was fed in the window it was fed
  // during the trial, and the claim only ever escalates. "Chicken ×1 · proteins fed
  // during the trial" does not: the count is over the evidence range, and stating it
  // in trial scope is an understatement in the reassuring direction.
  //
  // So: EXISTENTIAL claims about the trial keep "during the trial"; every COUNT
  // named as a trial figure takes this phrase. Four separate sentences were found
  // one round at a time before the rule was named.
  const antigenScope = trialCountScope(t)
  // "Also during the trial" / "Also in the N trial days this report covers" — the label
  // for the row whose sentences disclose what the exposure counts CANNOT hold.
  const blindScope = antigenScope
  if (truncated) {
    const shownDays = t.trialDaysElapsed - outsideDays
    const where =
      outside.before > 0 && outside.after > 0
        ? 'before and after it'
        : outside.before > 0
          ? 'before it'
          : 'after it'
    recordBits.push(
      // NOT "every figure below is counted over the window" — that over-claims, and the
      // B-422 tail clip falsifies it in the very next sentence: on an overrun trial the
      // coverage denominator closes at the target end, inside the window. What is true
      // without exception is the negative, so the negative is what it says. Each figure
      // below carries its own dates.
      `<b>This report shows ${num(shownDays)} day${shownDays === 1 ? '' : 's'} of a trial that has run ${num(
        t.trialDaysElapsed,
      )}</b> &mdash; ${num(outsideDays)} trial day${outsideDays === 1 ? '' : 's'} ${
        outsideDays === 1 ? 'falls' : 'fall'
      } ${where}, outside this report&rsquo;s window. <b>No count below is measured over the trial as a whole.</b>`,
    )
  }
  if (t.coverage) {
    // The range is RENDERED, not assumed. A window-scoped numerator over a
    // trial-scoped denominator is what made a well-logged 8-week trial with a
    // week-4 recheck read "27 / 56".
    recordBits.push(
      `Meals logged on <b>${num(t.coverage.daysLogged)} of ${num(t.coverage.daysElapsed)} days</b> (${h(
        fmtRange(t.rangeStartDate, t.rangeEndDate),
      )}).`,
    )
  }
  if (t.untrackedDaysBeforeFirstLog > 0) {
    // §10 S3. The normal vet-directed setup, not an edge case: the owner is handed
    // the diet at the clinic, back-dates the trial to the day the vet started it,
    // and begins logging when they get home. Days they could not have logged are
    // not a gap in their record, so they are NAMED as untracked rather than
    // denominated as failure — which would otherwise read "1 of 15" to the vet.
    recordBits.push(
      `The first ${num(t.untrackedDaysBeforeFirstLog)} day${
        t.untrackedDaysBeforeFirstLog === 1 ? '' : 's'
      } of the trial predate any logging and are reported as untracked, not as missed.`,
    )
  }
  recordBits.push(...exposureSentences(t))
  // ── B-530: THE WEIGHT FACT IS NO LONGER A PASSENGER ON THE REFUSAL BRANCH ───
  //
  // It used to be pushed from INSIDE `exposureSentences`' refusal branch, so the
  // trial-scoped weight sentence — the single most decisive companion fact on the
  // canonical artifact — rendered if and only if the refusal fact fired. Every
  // identity miss that silenced the refusal lane therefore silenced the weight
  // line too, and the two failures compounded into the quietest possible page over
  // the sickest patient. A weight change measured over the trial is worth stating
  // on ANY trial branch, so it is stated on its own terms here.
  //
  // NOT TWICE, THOUGH. When B-494's flag fired, the same sentence already leads the
  // safety band above the fold, composed with the refusal it belongs to — repeating
  // it verbatim two inches down spends the reader's attention to say nothing new.
  const trialWeight = weightDuringTrial(snap)
  if (trialWeight && !snap.safetyFlags.some((f) => f.kind === 'trial_diet_refusal')) {
    recordBits.push(trialWeight)
  }
  // The blind-spot qualifier is INLINE and permanent on the claim itself, never a
  // page-level legend (§5.2). It names flavoured NON-chewables specifically because
  // C3 ruled the chewable lane INTO v1 — rung 4 detects those, and the pre-C3
  // wording told the clinician to discount a line in his own appendix C.
  recordBits.push(
    `<span class="qual">Culprit only sees what&rsquo;s logged &mdash; flavoured liquids and tablets, other households and foraging aren&rsquo;t visible here.</span>`,
  )
  rows.push(kv('Record', recordBits.join(' ')))

  // ── The allowed list, with provenance and effective dates ───────────────────
  if (t.permittedFoods.length > 0) {
    const items = t.permittedFoods.map((f) => {
      const dates = f.allowedUntil
        ? ` (${h(fmtDay(f.allowedFrom))}&ndash;${h(fmtDay(f.allowedUntil))})`
        : f.addedAfterStart
          ? ` (from ${h(fmtDay(f.allowedFrom))})`
          : ''
      // COUNTS, not membership (§7). "DentaStix — 168 feedings over 28 days" is the
      // D-B finding a vet cannot get from anywhere else: six dental chews a day
      // reads as a clean elimination to both owner and vet without it.
      // A BARE COUNT NEXT TO A REFUSED DIET READS AS INTAKE. On the refused-cat report
      // the allowed list rendered "Hill's z/d trial diet ×38" beside a page that says
      // every one of those 38 was refused (round 5). The count is a count of FEEDINGS
      // OFFERED, which is the right number for the allowed list — it just cannot stand
      // unqualified on a trial the report elsewhere documents as uneaten.
      const refusedTrial = (t.rangeRefusal ?? t.trialDietRefusal) !== null || t.stoppedReason === 'refused'
      const count =
        f.feedings > 0
          ? refusedTrial && f.role === 'primary_diet'
            ? ` &times;${num(f.feedings)} <span class="rnote">offered</span>`
            : ` &times;${num(f.feedings)}`
          : ''
      // THE SET, HERE, BECAUSE THERE IS NOWHERE ELSE. Appendix B's protein table holds
      // MEAL foods only, so the trailing "Full protein sets in appendix B" sent a vet
      // to a table the treats are not in, and round 4 found the second-most-fed item in
      // the record with no ingredient data anywhere in the document — on a page that
      // warns a vet-approved extra carrying a second protein is as trial-invalidating
      // as a contaminated primary diet, and less likely to be noticed. An unread label
      // says so; it never renders as an all-clear (D10).
      const set = f.panelRead
        ? ` <span class="rnote">${h(proteinList(f.proteins.map(capProtein)))}</span>`
        : ` <span class="rnote">label not read</span>`
      return `${h(f.label)} <span class="rnote">${h(roleLabel(f.role))}</span>${dates}${count}${set}`
    })
    const changed = t.allowedSetChangedAfterStart
      ? ` <b>The allowed list changed after the trial started</b> &mdash; the dates above are when each food was permitted, and feedings are scored against the list in force on the day.`
      : ''
    rows.push(kv('Allowed list', `${items.join(' &middot; ')}.${changed}`))
  }

  // ── D-B: the antigen tally, permitted feedings included ─────────────────────
  //
  // "Compliance is about the owner and stays clean; antigen exposure is about the
  // animal and stays complete." A vet-approved treat keeps its `permitted` verdict
  // — flagging it would score the owner for following instructions — and still
  // contributes its protein here, because "6 poultry exposures, all from an
  // approved treat" is a finding available from no other surface.
  if (t.antigenTally.length > 0) {
    const tally = t.antigenTally
      .map((a) => {
        const from =
          a.fromPermitted === 0
            ? ''
            : a.fromPermitted === a.feedings
              ? ' (all from an approved food)'
              : ` (${num(a.fromPermitted)} from an approved food)`
        return `${h(capProtein(a.protein))} &times;${num(a.feedings)}${from}`
      })
      .join(', ')

    rows.push(
      kv(
        'Antigen exposure',
        // "PROTEINS FED DURING THE TRIAL" IS A WHOLE-TRIAL CLAIM (B-600, cold read
        // round 10 — its blocking finding, and the sharpest of the set). This tally is
        // counted over the evidence range, and on a truncated report that is a fraction
        // of the trial: 31 of 73 days rendered "Chicken ×1 · proteins fed during the
        // trial". It was the ONLY figure on page 1 carrying no denominator of its own,
        // and it is the one a vet copies into the record — "one chicken exposure during
        // the trial" reads as a near-clean elimination, which points at imaging and
        // biopsy rather than at re-running an interpretable trial. The general
        // disclaimer four lines up cannot carry it, because the reader who lifts this
        // number has already stopped reading prose.
        `${tally}. Proteins fed ${antigenScope} that the trial diet does not contain, counted on approved and unapproved feedings alike. ${PROTEIN_READ_CAVEAT}`,
      ),
    )
  }

  // ── B-529/R7(c) — say why the antigen tally is short ────────────────────────
  // Placed immediately after the antigen row it qualifies, because that is where
  // a reader forms the impression this sentence has to correct. Without it the
  // page shows a short (or absent) antigen list on a trial whose protein arm was
  // switched off, and a reader who has just been taught to scan that zone reads
  // the shortfall as a negative result — reassurance on absence, on the artifact
  // a vet acts on. The affirmative "all matched" claim is withheld in the same
  // state (`mayClaimAllMatched`), so the two never compose.
  if (t.antigenArmDark) {
    // TWO VARIANTS, because the arm darkens two ways and only one of them has a
    // food to name. A `primary_diet` MEMBERSHIP GAP leaves nothing on the list at
    // all, so the named sentence would have had no subject — and gating this row
    // on the label list meant the gap rendered no row while appendix C still said
    // "not checked against it (see above)", promising a cross-reference to a row
    // that could not exist.
    const named = t.antigenAttributionPaused.length > 0
    const one = t.antigenAttributionPaused.length === 1
    rows.push(
      kv(
        'Antigen check paused',
        named
          ? `${t.antigenAttributionPaused.map((l) => `<b>${h(l)}</b>`).join(', ')} ${
              one ? 'is recorded' : 'are recorded'
            } as part of the trial diet but ${
              one ? 'has' : 'have'
            } no protein on file that names a source, so proteins fed during the trial could not be checked against the trial diet for part of this window. Feedings are still counted; the protein names are not. This is a gap in the record, not a finding about the animal.`
          : 'For part of this window no trial diet was recorded on the allowed list, so proteins fed then could not be checked against it. Feedings are still counted; the protein names are not. This is a gap in the record, not a finding about the animal.',
      ),
    )
  }

  // ── §5.5's standing fact (D-A) — computed once, never per feeding ───────────
  if (t.contamination.length > 0) {
    // NAME THE FOOD. The cold read could not act on this row: it said a food on the
    // allowed list also lists chicken, called that "as trial-invalidating as a
    // contaminated primary diet", and then withheld WHICH PRODUCT to tell the owner to
    // stop. Per food, with its label and its own extras — a vet reads this in a consult
    // and has to be able to say the product name out loud.
    const items = t.contamination
      .map(
        (c) =>
          `<b>${h(c.food.label)}</b>${
            c.food.role === 'primary_diet' ? ' (the trial diet)' : ''
          } also lists ${h(proteinList(c.extraProteins.map(capProtein)))}`,
      )
      .join('; ')
    const onlyPrimary = t.contamination.every((c) => c.food.role === 'primary_diet')
    rows.push(
      kv(
        'Label contamination',
        `${items}. ${
          onlyPrimary
            ? ''
            : 'A vet-approved extra that carries a second protein is as trial-invalidating as a contaminated primary diet, and less likely to be noticed. '
        }${PROTEIN_READ_CAVEAT}`,
      ),
    )
  }

  // ── The channels the feeding count cannot hold ──────────────────────────────
  const blind: string[] = []
  if (t.oralRoute.length > 0) {
    // C3, and §6.8 governs every word: this is NEVER a reason to skip a dose. A
    // missed critical dose is a worse outcome than a contaminated trial, so the
    // sentence names the fact and points at a substitution — never at the next dose.
    const drugs = [...new Set(t.oralRoute.map((o) => o.drugLabel ?? 'a medication'))]
    // SAY THAT THE FLAVOUR IS UNIDENTIFIED, AND THAT THE TALLY EXCLUDES IT. Round 6, on
    // a report whose whole subject is antigen exposure: *"2 doses by mouth … carried a
    // flavour into Cooper (NexGard)"* names no protein — a drug flavouring has no
    // ingredient panel in this data model — and the antigen tally two rows up silently
    // omits these exposures, so the line flags a hazard the page's own count then
    // contradicts. Neither gap is fixable here (there is no source for the flavour's
    // composition), so both are DISCLOSED rather than papered over. Naming the exclusion
    // is what stops the tally reading as complete.
    blind.push(
      // A COUNT, so it takes the scoped phrase (see the rule at `antigenScope`). This
      // sentence exists to disclose an antigen channel the tally CANNOT hold, so
      // halving it and labelling it "during the trial" halves the one disclosure that
      // has no other home.
      `<b>${num(t.oralRoute.length)} dose${t.oralRoute.length === 1 ? '' : 's'} by mouth</b> carried a flavour into ${pet} (${drugs
        .map((d) => h(d))
        .join(', ')}) &mdash; a chewable, or a dose given inside food. <b>The flavouring&rsquo;s protein is not recorded anywhere</b>, so these exposures are not in the antigen tally above and that tally does not describe them. Dosing should continue exactly as prescribed.`,
    )
  }
  if (t.arrangementExposures.length > 0) {
    // §5.6. A free-choice bowl of something off the list is a CONTINUOUS exposure
    // that emits no meal events at all, so it is invisible to every count above.
    const bowls = t.arrangementExposures.map((a) => h(a.label ?? 'a free-fed food')).join(', ')
    // SAY THAT "CONTINUOUSLY" IS THE APP'S ASSUMPTION WHEN IT IS (B-532, cold-read
    // secondary). `active_from` is null on the ordinary free-fed row — it records the day
    // the owner first LOGGED the food, not the day the bowl went down — and the trial
    // block then asserted an unbroken presence across the window as though it had been
    // observed, while "Reading the trend" described the same bowl as "start not recorded"
    // four sections below. Same document, two confidences, and the assertive one was the
    // one a scanner takes. The conservative default is kept (a bowl of unknown vintage is
    // treated as present throughout, which is what protects the elimination claim); what
    // changes is that the page says so.
    const anyUndated = t.arrangementExposures.some((a) => !a.startRecorded)
    const datesBit = anyUndated
      ? ` The dates this bowl was down are not recorded, so it is reported as present throughout &mdash; that is the report's assumption, not an observation.`
      : ''
    blind.push(
      `<b>A free-fed bowl</b> of ${bowls} was available alongside the trial &mdash; continuously, and not on the allowed list. Intake not directly observed.${datesBit}`,
    )
  }
  if (t.exposures.unclassifiable > 0) {
    blind.push(
      `${num(t.exposures.unclassifiable)} logged feeding${
        t.exposures.unclassifiable === 1 ? '' : 's'
      } named no food, so ${
        t.exposures.unclassifiable === 1 ? 'it is' : 'they are'
      } counted on neither side above.`,
    )
  }
  // THE LABEL CARRIES THE SCOPE FOR EVERY SENTENCE UNDER IT (cold read rounds 11 + 15).
  // Round 11 flagged the label/value contradiction while it was still unexercised — a
  // row headed "Also during the trial" whose values say "in the 31 trial days this
  // report covers". Round 15's fixture exercised it, and the in-sentence phrase also
  // split the noun from its verb ("2 logged feedings in the 31 trial days this report
  // covers named no food"). Scoping the label once fixes both, and the pointer at
  // `withheldClaimReason` names the same string.
  if (blind.length > 0) rows.push(kv(`Also ${blindScope}`, blind.join(' ')))

  // ── C5: the symptom trend against logging density ───────────────────────────
  const density = t.loggingDensity
  if (density) {
    const d = density
    // A-1 was REJECTED and the finding underneath it was NOT discharged: an
    // owner-logged stream decays with attention, so a falling symptom count is
    // biased toward apparent improvement and a vet cannot tell a real remission
    // from a tiring owner. The remedy is to DISCLOSE the bias, not to correct it
    // with an owner-scored severity instrument the app has refused on every event
    // type. Rendering the two series together makes it visible at a glance.
    // NO VERDICT, AND THE LABEL NAMES WHAT IT COUNTS. Cold-read round 4 broke both
    // adjudicating forms of this line, in opposite directions, on the two artifacts:
    // *"Logging held up across the trial, so a change in symptom counts is not
    // explained by a change in how often anything was logged"* on a cat logging 2-of-9
    // then 3-of-10 days (an affirmative data-quality all-clear, false on its own
    // numbers, contradicting the sparse-logging caveat directly under the chart); and
    // *"Logging fell over the trial, so a fall in symptom counts cannot be separated
    // from the fall in logging"* on a dog whose meals were logged 43 of 43 days — where
    // the "logging" series WAS the symptom series, so the sentence is a tautology that
    // revokes the one result the trial exists to produce. A vet acting on it tells the
    // owner six weeks were wasted.
    //
    // C5 says the trend is RENDERED AGAINST density, not adjudicated by it, and round 5
    // deleted the second series outright: its "any other event" label was false (treats
    // are meal-typed; doses and weigh-ins are not events), so it was exactly the symptom
    // count while 65 treat feedings, 3 weigh-ins and 2 doses went uncounted.
    const m = d.meals
    // NAME THE RANGE, NOT "THE TRIAL". Fourth attempt at this clause, and every earlier
    // one conflated the OVERLAP RANGE with the TRIAL. Round 6: it read "This covers the
    // trial's 43 days" three inches under a headline saying "day 46 of 56" — 43 is the
    // logged overlap, the trial has run 46 — and then "which extends before it", where
    // the window and the trial start on the SAME day and only the first log is later.
    // Both halves were false about the trial while being true about the range, which is
    // exactly the distinction the medication-overlap fix drew one section up.
    //
    // So the clause describes the range explicitly, by its dates, and asserts nothing
    // about which end or about the trial's own length. The trial's elapsed day count is
    // already on the page, in the headline, where it cannot disagree with itself.
    //
    // ⚠️ AND THE HALVES ARE THE RANGE'S, NOT THE TRIAL'S (B-600). Round 6 wrote the
    // rule above and left this sentence saying "in the trial's first half" — over
    // halves split at the RANGE midpoint. On a since-visit window that is not a
    // near-miss, it is a libel of the record: a dog whose meals were logged twice a
    // day for the first six weeks of a twelve-week trial read *"Days a meal was
    // logged: 0 of 15 in the trial's first half"*, because the range's first half
    // was three silent weeks in the middle of the trial. Same string, same defect,
    // one layer from where round 6 fixed it.
    const window = snap.atAGlance.windowDays
    // THE SPAN, NOT THE SUM OF THE HALVES. Since B-600 the halves are symmetric and
    // an odd span's middle day is in neither, so summing them under-counts by one and
    // the clause fired claiming the window was "wider" than a range identical to it.
    const rangeDays =
      daysBetweenDayKeys(snap.trial!.evidenceStartDate, snap.trial!.evidenceEndDate) + 1
    const scope =
      window > rangeDays
        // EVIDENCE — the halves above are computed over the evidence span (round
        // 4: density over the clipped coverage window hid a 145-day logging
        // blackout on a stale trial, the exact decay C5 exists to disclose), and
        // the evidence span IS §5.1's documented overlap range, so the label and
        // the dates now agree.
        // The dates are already named in the sentence itself (B-600), so this adds
        // only the fact the reader cannot see: the charts below are drawn over a
        // WIDER span than these halves, and the two must not be read as one scale.
        ? ` Those dates are the logged overlap range; the charts below span the report&rsquo;s ${num(
            window,
          )}-day window, which is wider.`
        : ''
    rows.push(
      kv(
        'Symptoms vs logging',
        `Days a meal was logged: ${num(m.firstHalf.daysLogged)} of ${num(
          m.firstHalf.days,
        )} in the first half of ${h(
          fmtRange(snap.trial!.evidenceStartDate, snap.trial!.evidenceEndDate),
        )}, ${num(m.lastHalf.daysLogged)} of ${num(m.lastHalf.days)} in the second.${scope} <span class="qual">Meal logging is prompted and habitual, so this tracks whether the owner kept logging at all &mdash; read the symptom counts below with it in view. Culprit does not judge whether a change in one explains a change in the other.</span>`,
      ),
    )
  }

  // ── Element 1: the medication overlap ───────────────────────────────────────
  rows.push(kv('Medication during the trial', medicationOverlapLine(t)))

  // ── The owner's read, AS the owner's ────────────────────────────────────────
  if (t.outcome) {
    const notes = t.outcomeNotes ? ` &ldquo;${h(t.outcomeNotes)}&rdquo;` : ''
    // Attribution is the whole point (§7): the words "confirmed", "diagnosis" and
    // "food allergy" may not appear near this, and it is never rendered as a
    // finding Culprit computed.
    rows.push(
      kv(
        'Owner&rsquo;s read',
        `The owner reported ${pet} was <b>${h(outcomeLabel(t.outcome))}</b> at the end of the trial.${notes} Owner-reported, not a finding.`,
      ),
    )
  } else if (t.outcomeNotes) {
    // A NOTE WITHOUT A VERDICT STILL REACHES THE VET. R4 made the outcome
    // question explicitly optional, and the adversarial pass executed what that
    // made likely: an owner skips the radio, types "she still scratches at
    // night" into the field labelled "Anything you want your vet to know", and
    // the sentence — saved by `endActiveTrial` regardless of outcome — was
    // silently absent from the artifact, because this row's only render site
    // was gated on `t.outcome`. R4's "the report omits the owner line when
    // unanswered" governs the VERDICT, not the owner's own words addressed to
    // the clinician. Same attribution rule as above, no verdict implied.
    rows.push(
      kv(
        'Owner&rsquo;s note',
        `The owner added: &ldquo;${h(t.outcomeNotes)}&rdquo; Owner-reported, not a finding.`,
      ),
    )
  }

  // ── Element 2: the interpretability statement (§7.2) ────────────────────────
  //
  // "Uninterpretable, not negative" is the distinction a specialist draws first,
  // and v0.9 had the inputs for it with nowhere to say it. Strictly about the
  // RECORD: never about the pet (§6.1) and never about the owner (§6.9).
  // §7.2: the statement is derived from coverage + exposures + ANY UNCONTROLLED-ACCESS
  // FLAG. Coverage alone is not enough, and the cold-read artifact proved why: a cat
  // who refused every bowl for nineteen days scores 19-of-19 coverage, so the
  // coverage-only sentence read "supports interpreting it" over a trial in which no
  // elimination ever happened. A vet skimming that concludes the diet was adequately
  // documented and the result can be read. It cannot.
  //
  // These clauses do not soften the statement — each one names a specific reason the
  // RECORD cannot carry a trial result, which is the "uninterpretable, not negative"
  // distinction §7.2 exists to draw. `interpretabilityStatement` stays PR 5's
  // (coverage is its input and it says so); the caveats are the report's.
  const statement = t.interpretabilityStatement
  // ── THE REFUSAL SENTENCE LEADS THIS CALLOUT, ON EVERY RUNG (B-600) ──────────
  //
  // It is held out of `caveats` rather than pushed into it, because round 4's ruling
  // is about ORDER and the old mechanism enforced it only by accident: the statement
  // was suppressed on `supports`, and the canonical refusing cat happened to score
  // `supports`. B-600 moves a truncated record DOWN a rung, so the same cat on a
  // since-visit window kept its statement — and the adversarial pass rendered the
  // result: *"This record covers 29 of 44 days of this report's window — enough to
  // read alongside the rest of the history"* leading the callout, with *"Not one rated
  // feeding of the trial diet was finished (58 of 58)"* pushed into second place.
  // A record-quality sentence outranking a starving cat, on the one line the render's
  // own comment calls what a vet reads for the bottom line.
  //
  // Ordering it explicitly makes it independent of which rung fires, and of whatever
  // moves the rungs next. It still counts toward suppressing the affirmative.
  const caveats: string[] = []
  let refusalCaveat: string | null = null
  if (t.belowCoverageFloor) {
    caveats.push(
      'A record this sparse cannot distinguish a clean elimination from an untracked one, in either direction.',
    )
  }
  const refusalFact = t.rangeRefusal ?? t.trialDietRefusal
  if (refusalFact || t.stoppedReason === 'refused') {
    // SAY WHAT THE RECORD SAYS, NOT "LARGELY". This is the one line a vet reads for the
    // bottom line, and round 4 caught it hedging the hardest fact on the page: "largely
    // not eaten" over a record of 38 of 38 rated feedings refused. "Largely" reads as
    // partial intake, which is a different consult — push on versus change the diet
    // today. When every rated feeding was refused, the sentence says so.
    const total =
      refusalFact && refusalFact.ratedFeedings > 0 && refusalFact.refusedFeedings >= refusalFact.ratedFeedings
    // "NOT ONE WAS EATEN" IS A STRONGER CLAIM THAN THE RECORD MAKES (B-532, cold-read round 7).
    // The predicate is `feedingWasFinished`, so this population is "not finished" — and on the
    // canonical artifact appendix E lists `Ate some ×4` against a page-1 sentence saying not one
    // was eaten. In plain English those contradict, and a skeptical reader checks the appendix.
    // The error runs in the alarming direction so it costs no patient anything; it costs the
    // page credibility at the exact point it is being verified, and "took some on four days"
    // does modestly change the lipidosis urgency.
    const eaten = total
      ? `Not one rated feeding of the trial diet was finished (${num(refusalFact!.refusedFeedings)} of ${num(
          refusalFact!.ratedFeedings,
        )})`
      : 'The trial diet was largely not eaten'
    refusalCaveat =
      `${eaten}, so this record documents a refusal rather than an elimination &mdash; the coverage figure describes how completely it was tracked, not whether the diet was fed exclusively.`
  }
  if (t.arrangementExposures.length > 0) {
    caveats.push(
      'Food outside the allowed list was continuously available during the trial, so exclusive feeding cannot be established from this record at any coverage.',
    )
  }
  if (t.allowedSetUnavailable) {
    caveats.push('No allowed-food list is recorded, so nothing here has been checked against the trial.')
  }
  if (t.contamination.length > 0) {
    // The cold read's blocking finding on the well-logged artifact. §5.5 D-A: a food on
    // the allowed list carrying a second protein is as trial-invalidating as a
    // contaminated primary diet. A record with one is not a record that supports reading
    // an elimination result, whatever its coverage.
    caveats.push(
      'A food fed during the trial lists a protein the trial diet does not (above), so this record cannot establish that the elimination was clean.',
    )
  }
  // §7, verbatim: "without it a derm trial is unreadable — a steroid course and a
  // successful elimination produce the identical improving curve." The overlap is
  // rendered above and explicitly not judged, which is right — but §7.2 is the sentence
  // about whether the RECORD can be read, and a drug that suppresses the trial's only
  // endpoint belongs in it. The cold read's residual: §7.2 named the exposure caveat and
  // left the continuous oclacitinib out of the one line a reader lifts.
  const drugs = t.medicationOverlap.filter((m) => !m.isSupplement)
  if (drugs.length > 0) {
    const names = drugs.map((m) => h(m.drugName)).join(', ')
    caveats.push(
      `${names} overlapped the trial, so a change in the signs the trial is measuring cannot be attributed to the diet alone.`,
    )
  }
  // DO NOT OPEN WITH A SENTENCE THE PARAGRAPH THEN DISMANTLES. The affirmative variant
  // ("…and supports interpreting it") is the clause a busy reader lifts, and the cold
  // read lifted it — off a trial the cat refused, and off a trial invalidated through
  // its own allowed list. When any caveat applies, the coverage figure is already
  // rendered in the Record row above, so the statement adds nothing and costs a wrong
  // conclusion. The non-affirmative variants (partially / does-not-support) are kept:
  // they agree with the caveats rather than contradicting them.
  // B-529/R7(c). A DARK ANTIGEN ARM IS A CAVEAT ON THE BOTTOM LINE, and the first
  // repair wired only `mayClaimAllMatched`. The second adversarial pass executed
  // what that leaves: an identical record with a KNOWN contamination reads "cannot
  // establish that the elimination was clean", while the record with an UNKNOWN one
  // — strictly less known — still read "supports interpreting it". The more
  // ignorant state got the more affirmative sentence, on the one line the render's
  // own comment calls what a vet reads for the bottom line. That is B9's inversion
  // ("the most unknown state must not get the least disclosure") landing on §7.2.
  //
  // Placed LAST, deliberately. An earlier cut put it first "because a caveat here
  // suppresses the affirmative variant" — but `suppressStatement` is
  // POSITION-INDEPENDENT (it tests `caveats.length > 0`), so leading with it
  // bought nothing mechanically and cost the lead: on the canonical B-494 record
  // it pushed "Not one rated feeding of the trial diet was eaten (38 of 38)" into
  // second place, which is precisely the sentence round 4 fought to have lead.
  // A gap in the record ranks below what the record positively shows.
  if (t.antigenArmDark) {
    caveats.push(
      t.antigenAttributionPaused.length > 0
        ? `${
            t.antigenAttributionPaused.length === 1 ? 'A food' : 'Foods'
          } recorded as part of the trial diet ${
            t.antigenAttributionPaused.length === 1 ? 'has' : 'have'
          } no protein on file that names a source, so proteins fed during the trial could not be checked against it for part of this window — the elimination cannot be confirmed clean from this record.`
        : 'For part of this window no trial diet was recorded on the allowed list, so proteins fed then could not be checked against it — the elimination cannot be confirmed clean from this record.',
    )
  }
  const suppressStatement =
    (caveats.length > 0 || refusalCaveat !== null) && t.interpretability === 'supports'
  const shown = suppressStatement ? null : statement
  // Refusal first, then the record-quality statement, then the remaining caveats.
  const body = [refusalCaveat, shown ? h(shown) : null, ...caveats].filter(
    (p): p is string => p !== null,
  )
  const callout =
    body.length > 0
      ? `
    <div class="callout"><span class="k">Interpreting this record</span> ${body.join(' ')}</div>`
      : ''

  return `
  <div class="sec">
    <h2>Diet trial <span class="aside">the record, not a result</span></h2>
    <div class="kvcol">${rows.join('')}</div>${callout}
  </div>`
}

/**
 * "day 46 of 56" · "day 61 — 5 days past the 56-day window" · "19 days, of a
 * 28-day window".
 *
 * THE ONE DAY-MATH PATH ON THE REPORT. `DietSummary.trial` used to carry its own
 * unclamped `daysElapsed`, which is how "Day 104 of 28" reached a card and how
 * "day N of M where N > M" got its own acceptance criterion here.
 */
/**
 * The trial-scoped weight change, as a sentence.
 *
 * PERCENT OF BODY WEIGHT, not only the absolute — which is the point. `-0.3 kg` renders
 * identically for a 32 kg Labrador and a 4.4 kg cat, where it is ~7% of body mass; on a
 * refusing animal that is the most action-forcing number on the page and it was sitting
 * greyed in the fourth tile labelled "descriptive" (B-475's finding).
 *
 * IT IS NO LONGER THE REFUSAL LINE'S PASSENGER (B-530). It was originally cleared "for the
 * refusal case only, because that is the case where nothing else composes it", and pushed
 * from inside that branch — so every food-identity miss that silenced the refusal lane
 * silenced this too, and the two failures compounded into the quietest possible page over
 * the sickest patient. There are now two callers, and between them they render it exactly
 * once: the B-494 safety-band row composes it with the refusal above the fold, and
 * `dietTrialSection` states it on every other trial branch.
 *
 * Descriptive, never a verdict, and never rounded finer than an owner's home scale can
 * support: the reading's provenance is stated on the tile it comes from, and a percentage
 * printed more precisely than the instrument justifies is its own defect.
 */
function weightDuringTrial(snap: ReportSnapshot): string | null {
  const t = snap.trial
  const tr = snap.weight.trend
  if (!t || !tr || tr.deltaKg === null || tr.readingCount < 2) return null
  // #10a — THE SERIES IS WINDOW-SCOPED AND THIS SENTENCE IS TRIAL-SCOPED. The
  // adversarial pass rendered "Weight fell 4.6 → 4.1 kg over May 21 – Jun 19 — 10.9%
  // of body weight" as the refusal's companion fact on a trial that ran 10–19 Jun,
  // with 20 of the 29 days of loss predating it entirely. A number offered as evidence
  // about the trial has to be measured over the trial. If the span is not inside the
  // trial's range, say nothing here — the weight tile and its trend still render the
  // window-scoped figure, correctly labelled.
  if (
    !tr.earliestDate ||
    !tr.latestDate ||
    tr.earliestDate < t.evidenceStartDate ||
    tr.latestDate > t.evidenceEndDate
  ) {
    return null
  }
  const first = tr.seriesKg[0]
  if (!first || first <= 0) return null
  const dir = tr.deltaKg < 0 ? 'fell' : tr.deltaKg > 0 ? 'rose' : 'flat'
  if (dir === 'flat') return null
  // #10b — PRECISION THE INSTRUMENT SUPPORTS. One 0.1 kg tick on a 2.0 kg cat is a
  // single scale increment, and rendering it bolded as "5.0% of body weight" claims a
  // resolution the reading does not have — against this function's own docstring. A
  // delta of one tick is dropped; the rest round to a whole percent.
  if (Math.abs(tr.deltaKg) < 0.15) return null
  const pct = Math.round(Math.abs(tr.deltaKg / first) * 100)
  if (pct < 1) return null
  return `Weight ${dir} ${num(first.toFixed(1))}&nbsp;&rarr;&nbsp;${num(
    (first + tr.deltaKg).toFixed(1),
  )}&nbsp;kg over ${h(fmtRange(tr.earliestDate, tr.latestDate))} &mdash; <b>about ${num(
    pct,
  )}% of body weight</b> (owner home-scale readings; ${num(tr.readingCount)} weigh-ins).`
}

/** "a 56-day" but "an 84-day" — English takes the article from how the number is
 *  SAID, and `num()` wraps the digits in markup so no template can see them. Eight,
 *  eleven and eighteen (and anything starting with them) take "an". */
function articleFor(n: number): string {
  // Eleven and eighteen take "an" only as THEMSELVES — 112 is "a hundred and twelve",
  // so a `startsWith` test rendered "an 112-day window", and 112 is one tap away (84 +
  // §4.3's "Keep going — 4 more weeks"). Any number spoken starting with "eight" does.
  return String(n)[0] === '8' || n === 11 || n === 18 ? 'an' : 'a'
}

function trialDayPhrase(t: ReportSnapshot['trial'], targetDays: number): string {
  if (!t) return `${num(targetDays)}-day window`
  // ── IT IS A POSITION AS OF THE WINDOW'S END, AND SAYS SO WHEN THAT IS THE PAST ──
  //
  // `dayCounter` is bounded at the EVIDENCE end, so on a report whose scope closes
  // before today it is the trial day as of the window end, short of the trial's
  // elapsed length by exactly `trialDaysOutsideRange.after`. That is the right number
  // for a report describing a past window — but unlabelled it collided with the slice
  // sentence four lines down: "day 30 of 84" beside "a trial that has run 73", with
  // nothing on the page reconciling them, on 1,680 of 2,500 swept truncated configs
  // (worst gap 45 days). `daysPastTarget` rides the same counter and inherits the same
  // as-of semantics, which is why the suffix is appended to every branch rather than
  // to the position branch alone.
  //
  // The first cut of this fix instead added a sentence NOMINATING this counter as
  // "the only figure here that counts the trial" — endorsing the stale number by
  // reference having just removed it by arithmetic. The pointer is gone; the label is
  // what was actually needed.
  const asOf =
    t.trialDaysOutsideRange.after > 0 ? ` as of ${h(fmtDay(t.evidenceEndDate))}` : ''
  // ── AND THE OVERRUN IS A FACT ABOUT NOW, WHICH THE AS-OF POSITION CANNOT CARRY ──
  //
  // `daysPastTarget` is derived from `dayCounter`, so on a window that closed in the
  // past it is 0 whenever the trial had not yet passed its target BY THEN. Executed:
  // an active 56-day trial on day 93 rendered "day 93 — 37 days past the 56-day
  // window" through a window running to today, and "day 50 of 56 as of May 20" through
  // one ending May 20 — the same trial, and narrowing the window DELETED the report's
  // only staleness disclosure and replaced it with an on-track framing (six days to
  // go) on a trial 37 days over. A floor may only ever move toward disclosing more,
  // and that moved it the other way.
  //
  // Re-basing `daysPastTarget` itself onto `trialDaysElapsed` is the wrong repair: it
  // would print "day 50 — 37 days past the 56-day window" and 50 < 56 on its face. The
  // position is as-of and correct; the overrun is a fact about today. So they are
  // stated as two things, each with its own time.
  const overrunNow = t.targetDurationDays > 0 ? t.trialDaysElapsed - t.targetDurationDays : 0
  //
  // ⚠️ ACTIVE ONLY. "Now" is a present-tense position, and a finished trial has none —
  // this branch's own opening comment says a finished trial is a SPAN, not a position.
  // Executed on 9 of 351 fuzzed configs: a completed trial that overran, reported
  // through a window closing before it hit target, rendered "46 days as of Mar 10 (now
  // 12 days past that window), of a 56-day window. Jan 24 – Apr 1 · completed. … Ran
  // its course — the full window was completed." Three mutually contradictory claims in
  // one row. The overrun disclosure exists for the stale-ACTIVE trial (B-422's steady
  // state); an ended trial's afterlife is already governed by its end date.
  const nowPast =
    t.status === 'active' && asOf && overrunNow > 0 && t.daysPastTarget === 0
      ? ` (now ${num(overrunNow)} day${overrunNow === 1 ? '' : 's'} past that window)`
      : ''
  if (t.status !== 'active') {
    // A finished trial is a SPAN, not a position. "Day 19 of 28" on a trial stopped
    // at day 19 reads as one still nine days from its target.
    return `${num(t.dayCounter)} day${
      t.dayCounter === 1 ? '' : 's'
    }${asOf}${nowPast}, of ${articleFor(targetDays)} ${num(targetDays)}-day window`
  }
  if (t.daysPastTarget > 0) {
    return `day ${num(t.dayCounter)}${asOf}${nowPast} &mdash; ${num(t.daysPastTarget)} day${
      t.daysPastTarget === 1 ? '' : 's'
    } past the ${num(targetDays)}-day window`
  }
  return `day ${num(t.dayCounter)} of ${num(targetDays)}${asOf}${nowPast}`
}

/**
 * The §5.2 LOCKED exposure sentences. Positive form, describing the RECORD, with
 * their own feeding denominator — never welded to the coverage day ratio.
 *
 * Returns NOTHING rather than a hedge in the two states where an adherence
 * sentence would be a lie by construction:
 *   • the allowed set never arrived, so no feeding was checked against anything;
 *   • the trial diet was logged as refused (or the trial was stopped BECAUSE it
 *     was refused) — a diet that was not eaten cannot be read as one that was
 *     followed, and this is a RULE, not a copy preference.
 */
function exposureSentences(t: NonNullable<ReportSnapshot['trial']>): string[] {
  // THE REFUSAL SENTENCE IS COMPUTED FIRST AND BELONGS TO BOTH BRANCHES BELOW (B-530).
  //
  // It used to live inside branch 2 only, and branch 1 returned EARLY — so the state
  // where food identity fails silenced it there too. That is the compounding failure
  // B-530 is about: the very record that cannot resolve its own diet is the one whose
  // trial block then said only "no allowed-food list is recorded", with the fact that
  // the animal was not eating appearing nowhere in the block at all.
  //
  // `rangeRefusal` is the whole-range fact; `trialDietRefusal` is PR 5's now-fact. The
  // report wants the former — see the field's own note. The latter is still read,
  // because when both are set the recent one is the sharper clinical statement.
  const refused = t.rangeRefusal ?? t.trialDietRefusal
  const refusalBits: string[] = []
  if (refused) {
    // THE NOUN FOLLOWS THE POPULATION (B-530), exactly as it does on the card. Over
    // `meal_record` the app could not identify the trial diet, so "feedings of the trial
    // diet" would assert the identity the fallback exists because it could not establish —
    // and on a vet's artifact that is a fabricated attribution, not a rounding of the copy.
    const wide = refused.population === 'meal_record'
    refusalBits.push(
      `<b>${num(refused.refusedFeedings)} of ${num(refused.ratedFeedings)} rated ${
        wide ? 'meals' : 'feedings of the trial diet'
      } were left unfinished</b>, across ${num(refused.days)} day${refused.days === 1 ? '' : 's'}.${
        wide
          ? ' These feedings could not be matched to the trial&rsquo;s allowed list, so the food is not named here.'
          : ''
      }`,
    )
  }

  // 1. Nothing was checked against anything — but the animal's own record still speaks.
  if (t.allowedSetUnavailable) {
    return [
      ...refusalBits,
      `<b>No allowed-food list is recorded for this trial</b>, so no feeding on this report has been checked against it. The feedings themselves are in appendix&nbsp;C.`,
    ]
  }

  // 2. THE DIET WAS NOT EATEN. This precedes the exposure split, not just the
  //    affirmative: an adherence figure of ANY shape — "81 matched, 3 did not"
  //    included — reads a diet that went uneaten as one that was followed. §4.3
  //    routes a refusal to the intake-decline HEALTH lane and forbids rendering it
  //    as a compliance outcome. The exposures themselves are not suppressed; they
  //    are still itemised in appendix C, where they are a record rather than a score.
  if (refused || t.stoppedReason === 'refused') {
    const bits: string[] = [...refusalBits]
    // THE WEIGHT COMPANION MOVED OUT OF THIS BRANCH (B-530). It is now pushed by the
    // caller on every branch — coupling the single most decisive companion fact to
    // whether the refusal lane happened to fire meant an identity miss silenced both.
    bits.push(
      // NO POINTER TO APPENDIX C HERE. It is the OFF-DIET table, so a trial-diet
      // feeding can never appear in it by construction — the cross-reference could not
      // resolve on any report ever generated, and on this one it lands a vet on "No
      // feeding in this window is listed here." Round 5 counted four dangling pointers
      // on this page; this was the one that was unresolvable in principle rather than
      // by accident. Appendix E is named for what it actually holds — grouped intake
      // ratings, not one row per feeding (itemising it is B-486).
      `A diet that was not eaten cannot be read as one that was followed, so no adherence figure is reported for this trial. <b>Refusal of food is a clinical finding in its own right</b> &mdash; the intake ratings behind it are summarised in appendix&nbsp;E.`,
    )
    return bits
  }

  // 3. The §5.2 LOCKED split sentence, with the rung breakdown that makes each flag
  //    interrogable (§6.3) rather than an unfalsifiable accusation.
  const { totalFeedings, offDiet, byRung } = t.exposures
  // “IN TOTAL” IS A CLAIM ABOUT THE TRIAL, and this count is over the range
  // (B-600). On a report scoped to a recheck the two differ by most of the trial:
  // twenty-three feedings read as the whole record of a twelve-week elimination
  // when they are eleven days of it. The count itself is right either way — only
  // the noun that says what it is a total OF has to move.
  // …AND THE RANGE IT NAMES IS THE EVIDENCE RANGE, NOT THE REPORT WINDOW. The count is
  // over `exposureRange`, which equals the window only when the trial neither started
  // after it opened nor ended before it closed — and the second of those is the shape
  // `selectReportTrial` exists for (the report an owner sends the day after completing
  // a trial). Executed: a trial that ended Jun 12 inside a window running to Jul 2
  // rendered "42 feedings in this report's window — all 42 matched" while §4 of the
  // same page listed 82 meals across two foods, 40 of them chicken after the trial
  // closed. An affirmative all-clear whose stated scope the document itself falsifies.
  // Naming the dates costs a repetition and cannot be read wrong.
  //
  // Untruncated, "in total" is TRUE and stays: `trialDaysOutsideRange === {0,0}` means
  // the evidence range spans the whole elapsed trial, so the total is the trial's.
  // ── AND ON ALL FOUR RETURN PATHS, NOT THE ONE I HAPPENED TO EDIT ────────────
  //
  // Cold read round 10 found the first cut applied to `feedingScope` alone, so the
  // WITHHELD-CLAIM path — the one a free-fed completed trial takes — still rendered
  // *"98 feedings are logged in this window"* over feedings spanning May 8 – Jun 25
  // of a window running to Jul 2. "This window" is the document's reserved idiom for
  // the REPORT window ("None logged in this window"), so borrowing it for a narrower
  // span reads as the record being more complete and more current than it is.
  //
  // This is the failure the B-529 wrap named and the B-532 session hit again: fixing
  // a composition in one place and leaving an equivalent one live in another. Both
  // phrasings now derive from one pair of values.
  const feedingRange = h(fmtRange(t.evidenceStartDate, t.evidenceEndDate))
  const feedingsAreLogged = `feedings are counted over ${feedingRange}.`
  // "COUNTED OVER", NOT "LOGGED": round 10 found "23 feedings logged Jun 2 – Jul 2"
  // reads as the span the feedings OCCURRED over, which was narrower — a misread
  // toward the record being more evenly spread than it is. The phrase names a scope
  // and has to sound like one.
  //
  // AND UNCONDITIONALLY, NOT BEHIND `trialDaysOutsideRange`. That gate measures how
  // much of the TRIAL the scope cuts, and this sentence is read in the frame of the
  // WINDOW — which the gate says nothing about. Executed: a trial ending Jun 12 inside
  // a window running to Jul 2 scores {0,0} and printed the bolded, undated "53
  // feedings in total — all 53 matched the trial diet or a permitted food" over a page
  // whose own appendix E listed 40 chicken feedings fed Jun 13 – Jul 2. "In total" was
  // TRUE of the trial and false in the frame it was read in. An affirmative that always
  // states its own dates cannot be carried past them and needs no predicate.
  const feedingScope = `feedings counted over ${feedingRange}`
  if (offDiet > 0) {
    const parts: string[] = []
    if (byRung.derived_protein > 0) {
      parts.push(`${num(byRung.derived_protein)} carried a protein the trial diet does not`)
    }
    if (byRung.unrecognised > 0) {
      // Rung 3 is the MODAL case on a real library, not the edge case, and must
      // never render as a contaminant assertion.
      parts.push(
        `${num(byRung.unrecognised)} ${
          byRung.unrecognised === 1 ? 'was' : 'were'
        } not recognised as trial food (no ingredient list captured, so nothing more can be said about ${
          byRung.unrecognised === 1 ? 'it' : 'them'
        })`,
      )
    }
    // THE THIRD REASON, which neither rung counts. Appendix C's Why column can now say
    // "Fed before it was permitted", and round 5 caught page 1 still attributing every
    // exposure to the two rungs — "Of those 4: 4 carried a protein the trial diet does
    // not" over an appendix showing three protein rows and one dated-membership row. A
    // vet cross-checking got 4 against 3, and the timing violation never reached page 1.
    // Additive, not exclusive: a feeding can be both, so this reads "also".
    const alsoEarly =
      t.exposures.fedBeforePermitted > 0
        ? ` ${num(t.exposures.fedBeforePermitted)} ${
            t.exposures.fedBeforePermitted === 1 ? 'was' : 'were'
          } also fed before that food was permitted.`
        : ''
    return [
      `<b>${num(totalFeedings)} ${feedingScope} &mdash; ${num(totalFeedings - offDiet)} matched, ${num(
        offDiet,
      )} did not.</b> Of those ${num(offDiet)}: ${parts.join('; ')}.${alsoEarly} Dates in appendix&nbsp;C. <b>This is a floor, not a total.</b>`,
    ]
  }

  // 4. Zero exposures, and the question is whether that may be SAID.
  if (t.mayStateRecordClean) {
    return [
      `<b>${num(totalFeedings)} ${feedingScope} &mdash; all ${num(
        totalFeedings,
      )} matched the trial diet or a permitted food.</b> This describes the record, and is a floor rather than a total.`,
    ]
  }
  if (t.belowCoverageFloor) {
    // §5.2 is TWO-SIDED, and this is the side that is easy to forget. Below the
    // floor Culprit may neither claim a clean trial NOR raise an absence-based
    // alarm: more days are missing than present, so the modal day in the window has
    // no data at all.
    return [
      `${num(totalFeedings)} ${feedingsAreLogged.replace(/\.$/, '')}, and none of them was matched to a food outside the trial diet or the allowed list. <b>The record is too sparse to read that as a clean elimination</b> &mdash; see below.`,
    ]
  }
  // The module computed a reason the affirmative sentence is false. The card stays
  // quiet here; the REPORT names the blocker, because a vet reading a missing line
  // needs to know it was withheld rather than assume it was clean.
  //
  // AND IT NAMES THE BLOCKER RATHER THAN POINTING AT A ROW THAT MAY NOT EXIST (B-599).
  // This sentence used to end "see 'Also during the trial' below" unconditionally, and
  // that row renders only for an OFF-LIST bowl, an oral-route dose or an unnamed
  // feeding. Two of the reasons the claim is withheld emit no row at all — a free-fed
  // bowl holding the TRIAL DIET (`intakeNotDirectlyObserved` withholds; there is no
  // off-list exposure to list) and a below-`MIN_INTERPRETABLE_DAYS` record — so the
  // phrase occurred exactly once in the document, pointing at nothing. Round 5 treated
  // a page-1 pointer to a missing section as blocking, and it is the right call: a
  // reader who cannot find the referenced row concludes they misread the withholding,
  // not that the report is wrong.
  return [`${num(totalFeedings)} ${feedingsAreLogged} ${withheldClaimReason(t)}`]
}

/**
 * WHY no clean-elimination statement is made — one sentence, always resolvable.
 *
 * Ordered by what the reader can act on, and every branch either names the fact itself
 * or points at a row this same page is guaranteed to render:
 *   1. the "Also during the trial" row exists → point at it (its contents ARE the reason);
 *   2. an unobserved bowl of an on-list food → say so; nothing else on the page will;
 *   3. a dark antigen arm → the "Antigen check paused" row above is guaranteed by the
 *      same flag, so the pointer cannot dangle;
 *   4. anything else (today: a record below the interpretable-days floor) → state the
 *      shape of the gap without inventing a cause.
 */
function withheldClaimReason(t: NonNullable<ReportSnapshot['trial']>): string {
  const alsoRowRenders =
    t.oralRoute.length > 0 || t.arrangementExposures.length > 0 || t.exposures.unclassifiable > 0
  if (alsoRowRenders) {
    return `No clean-elimination statement is made for them &mdash; see &ldquo;Also ${trialCountScope(
      t,
    )}&rdquo; below for what the feeding count cannot cover.`
  }
  if (t.intakeNotDirectlyObserved) {
    // The tightly-controlled feline trial the free-fed state exists for: the bowl holds
    // the trial diet, so nothing is off-list — and BOTH intake lanes are structurally
    // blind, because a topped-up bowl produces no rated feedings at all. Unobservable is
    // not clean, and this is the only line on the page that says why.
    return 'Food was continuously available in a bowl during the trial, so what was eaten from it is not directly observed and the feeding count cannot describe it. <b>No clean-elimination statement is made for this record.</b>'
  }
  if (t.antigenArmDark) {
    return 'No clean-elimination statement is made for them &mdash; see &ldquo;Antigen check paused&rdquo; above.'
  }
  return 'No clean-elimination statement is made for them: the record does not yet cover enough of the trial to read one either way.'
}

/** §7's first element. Descriptive throughout; the ONE additive judgement is the
 *  GI-trial antibacterial note, and it is presence-only. */
function medicationOverlapLine(t: NonNullable<ReportSnapshot['trial']>): string {
  if (t.medicationOverlap.length === 0) {
    // NOT "no medications were given" — the report knows only what was logged, and
    // an absence claim here would be the same reassurance-on-absence G2 deletes one
    // line up. This states the record.
    // AN ABSENCE IS ONLY EVER ASSERTED OVER WHAT WAS EXAMINED (adversarial pass 5, and
    // a hole in the rule as first written — see `trialCountScope`). `medicationOverlap`
    // is bounded at the evidence end, so on a report whose window closed before the
    // trial did this sentence claimed the whole trial over a fraction of it: executed
    // with a prednisolone course in the excluded tail, the document was byte-identical
    // to one with no medication, and §7.2 kept its affirmative because the drug caveat
    // never fired.
    const scope = trialCountScope(t)
    return `No medication or supplement is recorded as overlapping ${
      scope === 'during the trial' ? 'the trial window' : scope.replace(/^in /, '')
    }.`
  }
  const rows = t.medicationOverlap.map((m) => {
    // SAY WHEN THE DRUG STARTED, NOT ONLY WHEN THE OVERLAP DID. `fromDate` is
    // `max(drug start, range start)` — a correct OVERLAP, rendered as if it were the
    // course. Cold-read round 4: page 1 read "Apoquel · May 21–Jul 2 · 43 d" while
    // appendix D and the concurrent-changes line both said "since Apr 30", and May 21
    // is merely the first logged day. That difference is clinically decisive — an
    // antipruritic that predates the trial by three weeks cannot explain a change at
    // trial start, and one beginning three days in can explain all of it. Rendering
    // the clipped date silently picked the confounded reading.
    const startedBefore =
      m.startedAt !== null && m.startedAt.slice(0, 10) < m.fromDate ? m.startedAt.slice(0, 10) : null
    const span = startedBefore
      ? `since ${h(fmtDay(startedBefore))}, overlapping ${h(fmtDay(m.fromDate))}&ndash;${h(fmtDay(m.toDate))}`
      : `${h(fmtDay(m.fromDate))}&ndash;${h(fmtDay(m.toDate))}`
    const still = m.activeAtWindowEnd
      ? ' <b>still running at the end of this window</b>'
      : m.overlapsLast7Days
        ? ' (ran into the last 7 days)'
        : ''
    const abx = m.antibacterialInGiTrial
      ? ' <b>An antibacterial course overlaps a GI trial:</b> a steroid&rsquo;s effect withdraws when it stops, a course&rsquo;s effect on the microbiome does not.'
      : ''
    return `${h(m.drugName)}${m.isSupplement ? ' (supplement)' : ''} &middot; ${span} &middot; ${num(
      m.daysOverlapping,
    )}&nbsp;d${still}.${abx}`
  })
  // EXPLICITLY NOT JUDGED, and the sentence saying so is not optional: antipruritics
  // are permitted throughout a trial and a 2–3 week prednisolone course is a
  // documented protocol, so an app that framed these as compliance violations would
  // be scolding an owner for following their vet. What they ARE is the reason a derm
  // trial is unreadable without them — a steroid course and a successful elimination
  // produce the identical improving curve.
  // SAY WHICH KIND OF PROBLEM IT IS NOT. "Not a problem with the trial" was doing two
  // jobs and only one of them was true: these are not a COMPLIANCE problem — routinely
  // prescribed alongside a trial, and flagging them would scold an owner for following
  // their vet — but they are very much a problem for READING the result, which is what
  // §7.2 says two lines below. The cold read caught the downplaying clause sitting as
  // the weaker of two adjacent statements, and the assertive one should be the caveat.
  // NAME THE SOURCE OF THE SPAN. These dates come from the regimen the owner recorded,
  // not from logged doses — a course can read "still running" with zero doses logged
  // against it, in a document whose own appendix D closes with "Nothing is counted that
  // the owner did not log." Round 4 read that as duration inferred from two ad-hoc
  // doses. It is not inferred, but nothing on the page said so, and the fix is to cite
  // where it comes from and where the per-regimen adherence lives.
  return `${rows.join(' ')} <span class="qual">Spans are the courses as recorded, not evidence of administration &mdash; per-regimen adherence is in appendix&nbsp;D. Routinely prescribed alongside a trial, so this is not a compliance problem &mdash; but it does bear on reading the symptom trend; see &ldquo;Interpreting this record&rdquo; below.</span>`
}

function indicationLabel(indication: 'skin' | 'gi' | 'other'): string {
  switch (indication) {
    case 'skin':
      return 'skin signs'
    case 'gi':
      return 'gastrointestinal signs'
    default:
      return 'other'
  }
}

function roleLabel(role: string): string {
  switch (role) {
    case 'primary_diet':
      return 'trial diet'
    case 'permitted_treat':
      return 'permitted treat'
    case 'supplement':
      return 'permitted supplement'
    default:
      return 'permitted'
  }
}

/** The stored tokens. An unrecognised value renders verbatim rather than
 *  vanishing — a future reason must never become a silent blank on a clinical page.
 *
 *  ALL SIX of §4.3's reasons are mapped. The three PR 6 added (`cost`, `too_hard`,
 *  `symptoms_resolved`) initially reached this page through the fallback, so a vet
 *  read "Stopped: too_hard." — the fallback doing its job on tokens that were not
 *  unknown at all. This map and the owner-facing one in `lib/dietTrialCard.ts` are
 *  siblings: a new reason means touching both.
 *
 *  Each line is written for a clinician deciding what to prescribe next, which is
 *  the entire justification for capturing the reason — "stopped at day 19, would
 *  not eat it" and "stopped, cost" lead to different prescriptions. */
function stoppedReasonLine(
  petName: string,
  reason: string,
  t: NonNullable<ReportSnapshot['trial']>,
): string {
  switch (reason) {
    case 'refused':
      return `Stopped because ${petName} would not eat it.`
    case 'vet_advised':
      return 'Stopped on veterinary advice to change diets.'
    case 'cost':
      return 'Stopped on cost grounds.'
    case 'too_hard':
      // AGENTLESS, deliberately. "the owner could not maintain exclusive feeding"
      // names the owner as the cause and states it as an inability — and this page
      // is shown to the OWNER in-app under the HTML-first ruling, so §6.9 (Culprit
      // never scores the owner) binds here exactly as it does on the card. The vet
      // needs the fact; the agent is optional. The card's sibling line already got
      // this right, which is how the divergence was spotted.
      return 'Stopped — exclusive feeding could not be maintained in the household.'
    // Clinically load-bearing, and the one reason a vet may want to act on
    // directly: an owner who stopped BECAUSE things improved has stopped a diet
    // that may be working, and on a GI indication that is short of the ACVIM
    // continuation window. Stated as the owner's reason, never as a finding.
    case 'symptoms_resolved':
      return 'Stopped because the owner reported the symptoms had resolved.'
    case 'completed': {
      // "RAN ITS COURSE" IS A CLAIM ABOUT LENGTH, AND NOTHING CHECKED IT (B-532).
      // `completed` is a stored token meaning the owner tapped the completion
      // milestone — §4.3's milestone needs that tap and nothing auto-completes a
      // trial — so it says WHEN the owner ended it, never that the target was
      // reached. The cold read caught this sentence in bold over 49 of 56 days,
      // two inches under a `trialDayPhrase` that had already printed "49 days, of a
      // 56-day window": one line said short, the emphasised one said finished, and
      // the emphasised one is what a 60-second scan takes.
      //
      // A short trial is not a footnote on either indication. On skin, 56 days IS
      // the >90% band and stopping at 49 lands under it; on GI, ACVIM says continue
      // ≥12 weeks, so "ran its course" over a truncated trial reads as permission to
      // stop a diet the guideline says to keep. Stated as arithmetic about the
      // record, never as a judgement of the owner (§6.9).
      //
      // ⚠️ AND IT MEASURES THE TRIAL, NOT THE VIEW (B-600, round 10). This compared
      // `dayCounter` — evidence-bounded — against the target, so a report windowed to
      // the past accused an owner of stopping early on a trial they completed exactly
      // on target: a 56-day trial run to the day, viewed through a window that closed
      // eleven days before it did, printed *"Marked complete at day 45 — 11 days short
      // of the 56-day window"* in bold. The stale-counter class again, this time
      // inverting a B-532 sentence into a false accusation, and §6.9 forbids scoring
      // the owner even when the arithmetic is right.
      const short = t.targetDurationDays - t.trialDaysElapsed
      if (short > 0) {
        return `Marked complete at day ${t.trialDaysElapsed} — ${short} day${
          short === 1 ? '' : 's'
        } short of the ${t.targetDurationDays}-day window.`
      }
      return 'Ran its course — the full window was completed.'
    }
    case 'other':
      return 'Stopped early.'
    default:
      return `Stopped: ${reason}.`
  }
}

function outcomeLabel(outcome: 'improved' | 'no_change' | 'worse' | 'unsure'): string {
  switch (outcome) {
    case 'improved':
      return 'better'
    case 'no_change':
      return 'about the same'
    case 'worse':
      return 'worse'
    default:
      return 'hard to say'
  }
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
    // "BEFORE" IS AN ASSUMPTION, NOT A FACT (B-600, cold read round 11 — blocking).
    // The string was hardcoded on the reasoning that a reading outside the window must
    // predate it, which holds for every window ending today and fails for the one basis
    // that can close in the past. On a completed trial reported through a hand-picked
    // window, the patient's ONLY weight — taken ten days after the window closed, at the
    // end of the diet — rendered as "(before this window)" and read as a pre-trial
    // baseline. Going in versus where she landed is a different clinical question, and
    // nothing else on the page corrected it.
    const latestSide =
      latest.date > snap.scope.endDate
        ? 'after this window'
        : 'before this window'
    return `
  <div class="weight">
    <div class="wt-read"><span class="v num">${h(latest.kg.toFixed(1))}&nbsp;kg</span> <span class="l">&middot; latest weigh-in ${h(
      fmtDay(latest.date),
    )} (${latestSide})</span><br/>
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
  // THE SPARKLINE IS MAGNITUDE-BLIND, SO THE SCALE IS STATED (B-532, cold-read secondary).
  // `weightSpark` normalises to the series' own min/max, which is right for showing SHAPE and
  // wrong for everything else: a 0.2 kg wobble on a Labrador and a 0.6 kg fall on a cat draw
  // the identical cliff, and the cliff is what a 60-second scan takes from the tile. The
  // numbers were adjacent but the drawn RANGE was not, so nothing told the reader how much
  // vertical the line was spending. Named as a scale, never as a finding — the clinical
  // reading of that fall is `weightDuringTrial`'s percent-of-body-weight sentence.
  const lo = Math.min(...t.seriesKg)
  const hi = Math.max(...t.seriesKg)
  const scaleBit =
    t.readingCount >= 2 && hi > lo
      ? ` <span class="l">&middot; chart spans ${num(lo.toFixed(1))}&ndash;${num(hi.toFixed(1))}&nbsp;kg</span>`
      : ''
  return `
  <div class="weight">
    ${weightSpark(t.seriesKg)}
    <div class="wt-read">
      <span class="v num">${trajectory}</span> <span class="l">&middot; ${num(t.readingCount)} owner weigh-in${
        t.readingCount === 1 ? '' : 's'
      }, ${dateSpan}</span>${scaleBit}<br/>
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
  const tiles = snap.diet.trial ? trialTiles(snap) : monitoringTiles(snap)
  const aside = snap.diet.trial
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

  // Tile 2 — COVERAGE (§5.1). "How completely was this tracked?" — distinct days in
  // the trial's overlap range carrying a logged meal, over days elapsed in the SAME
  // range. Treats are excluded from the numerator: 82% of live feedings are treats
  // and 15.7% of covered days are treat-only, so a "days with food logged" count is
  // clearable entirely by treat data.
  const intake = snap.safetyFlags.find((f) => f.kind === 'intake_decline')
  if (snap.trial?.coverage) {
    // TWO WORDS THE COLD READ CAUGHT. "Days with a meal logged" is one word from "days
    // the cat ate", and on the refused-trial artifact the tile read 19/19 over an animal
    // that ate almost nothing — coverage deliberately does not read intake (§5.1: a bowl
    // put down and refused is a day the owner kept the record), so the label has to say
    // so. And the denominator is the trial's LOGGED SPAN, not its target length, so the
    // range is named rather than left to collide with "of a 56-day window" elsewhere.
    const span = h(fmtRange(snap.trial.rangeStartDate, snap.trial.rangeEndDate))
    tiles.push(
      tile(
        `${snap.trial.coverage.daysLogged}`,
        `<small>&nbsp;/&nbsp;${snap.trial.coverage.daysElapsed}</small>`,
        `Days a meal was logged &middot; ${span}<br/>record coverage &mdash; not intake, not a clean-elimination count`,
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

  // Tile 3 — EXPOSURES, the OTHER §5.1 fact, on its own denominator. Coverage and
  // adherence are two questions ("how completely was this tracked?" vs "was the
  // elimination clean?") and D2 deleted the blended number that answered neither.
  // They are adjacent here so a vet can tell them apart in the 60-second scan, and
  // they never share a denominator: coverage counts DAYS WITH MEALS, exposure counts
  // ALL FEEDINGS, and a treat-only day is in one and not the other.
  tiles.push(snap.trial ? trialExposureTile(snap.trial) : coverageTile(ag))
  tiles.push(weightTile(snap))
  return tiles
}

/**
 * The exposure tile. Three states, and the second is the one G2 exists for.
 *
 * A count of zero may NOT be rendered as a number: "0 off-diet" is the negative
 * claim about the world that §5.2 deletes from the product at every coverage, on
 * every surface. What can be said is the POSITIVE form about the RECORD — "all 84
 * matched" — and only when `mayClaimAllMatched` allows it, i.e. when the module has
 * NOT computed a reason the sentence is false (a refused trial diet, an off-list
 * free-choice bowl, an oral-route exposure, a feeding naming no food).
 */
function trialExposureTile(t: NonNullable<ReportSnapshot['trial']>): string {
  if (t.allowedSetUnavailable) {
    return tile('—', '', `Off-diet exposures<br/>no allowed list recorded for this trial`)
  }
  if (t.exposures.offDiet > 0) {
    return tile(
      `${t.exposures.offDiet}`,
      `<small>&nbsp;/&nbsp;${t.exposures.totalFeedings}</small>`,
      `Feedings not matched to the trial diet<br/>a floor, not a total &mdash; dates in appendix&nbsp;C`,
    )
  }
  if (t.mayStateRecordClean) {
    // THE TILE CARRIES THE SAME COUNT AT THREE TIMES THE TYPE SIZE (B-600, pass 3 ⑤).
    // The prose sentence below it names its range; this one sat in the scan grid with
    // no dates at all, under a header reading "counts over the N-day window" — and the
    // count is over the trial's evidence range, not the window. The most affirmative
    // cell on the page was the one a reader could carry furthest.
    return tile(
      `${t.exposures.totalFeedings}`,
      `<small>&nbsp;feedings</small>`,
      `All matched the trial diet or a permitted food<br/>${h(
        fmtRange(t.evidenceStartDate, t.evidenceEndDate),
      )} &middot; a floor: Culprit only sees what&rsquo;s logged`,
    )
  }
  // AN EM-DASH IN A COUNT GRID SCANS AS ZERO. This branch is reached exactly when the
  // report has a reason it may not state a count — a refusal, an uncontrolled free-fed
  // bowl, a below-floor record — i.e. the cases where "0" is the most dangerous thing
  // the tile could imply. Round 6 on the refused cat: the tile read "—" for a patient
  // with a competing antigen continuously available, and appendix C got the same fact
  // right in words. So the tile says the WORD, not a dash: a reader who takes nothing
  // else from this cell must not take "none" from it.
  // AND "NOT STATED" IS A FACT ABOUT THE DOCUMENT, NOT ABOUT THE ANIMAL (B-532, cold-read
  // blocking). Round 6 fixed the dash on the off-list-bowl branch and left the fallback saying
  // "Not stated · see the diet-trial block below" — which, in a four-tile row where every other
  // tile is a number, scans as *nothing to report*. The cold read lifted exactly that off the
  // completed-trial artifact, on the report where a clean-looking page is the whole hazard.
  // Every branch now names the WORLD: what could not be established, and why.
  if (t.arrangementExposures.length > 0) {
    return tile('Not countable', '', `Off-diet exposures<br/>off-list food was continuously available &mdash; see below`)
  }
  if (t.intakeNotDirectlyObserved) {
    return tile('Not countable', '', `Off-diet exposures<br/>food was free-fed &mdash; intake not directly observed`)
  }
  return tile('Not established', '', `Off-diet exposures<br/>no clean-elimination statement is made &mdash; see below`)
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
  //
  // THIS TILE AND THE SYMPTOM PANEL READ THE SAME `trendHalves` (B-532). They did not, and the
  // adversarial pass executed what that cost: the first cut migrated the panel and left this tile
  // on the old `mid * 7` bucket split, so on a fully-logged 36-day `since_visit` window — the
  // DEFAULT basis for the monitoring wedge this tile exists for — page 1 printed "3 → 3" while
  // the panel two inches below printed "first 18 d 1 → last 18 d 5". Same symptom, same window,
  // one page, and the prominent number was the reassuring one. A swept comparison put the two
  // partitions in disagreement on 337 of 393 window lengths. The bias had not been removed, it
  // had been relocated — so the fix is one shared derivation, not two corrected copies.
  const halves = ps?.trendHalves ?? null
  if (ps && halves) {
    const { days, firstCount, lastCount } = halves
    // The same predicate the panel uses, from the same helper — including its denominator, which
    // is where the second break was: this site compared a NEW-partition numerator against an
    // OLD-partition floor, which both lost a caveat at 90 days and printed a false "6 of 21 d".
    const sparse = trendSparseCaveat(halves, ag)
    const sub =
      sparse?.side === 'early'
        ? `early window sparsely logged (${num(ag.firstHalfLoggedDays)} of ${num(days)} d)`
        : `first ${num(days)}&nbsp;d &rarr; last ${num(days)}&nbsp;d`
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
 * R2-2 treats & table-food tile — leads with the total treat COUNT (the exposure magnitude a vet
 * weighs), not the distinct-item count. On the first artifact the tile led with "2 distinct", which
 * undersold a 343-feeding load until the sub-label was read (cold-read NIT).
 *
 * MONITORING TILE SET ONLY (`monitoringTiles` is the no-trial branch), and R2 is why the label no
 * longer says "off-diet load": on a report with no trial there is no diet to be off, so the phrase
 * imports a verdict from a comparison that was never made. The tile names what it counts. Under a
 * trial the corresponding tile is `trialTiles`' exposure tile, which is a different measurement
 * against a real allowed list.
 */
function offDietTile(snap: ReportSnapshot): string {
  const treats = snap.diet.treats
  const hf = snap.diet.humanFood
  if (treats.count > 0) {
    const hfBit = hf.count > 0 ? ` &middot; table food ${num(hf.days)} d` : ''
    return tile(`${treats.count}`, `<small>&nbsp;treats</small>`, `Treats &amp; table food<br/>${num(treats.distinctItems)} distinct${hfBit}`)
  }
  if (hf.count > 0) {
    return tile(`${hf.count}`, `<small>&nbsp;feedings</small>`, `Table food<br/>on ${num(hf.days)} day${hf.days === 1 ? '' : 's'}`)
  }
  // Record-scoped (R2): a statement about what is in the log, not a claim that nothing was fed.
  return tile('—', '', `Treats &amp; table food<br/>none recorded in this window`)
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
      ? `<div class="chartlegend">A dashed vertical marks the <b>week</b> a diet, medication, or supplement started — each is named with its exact date in &ldquo;Reading the trend&rdquo; below.</div>`
      : ''
  return `
  <div class="sec">
    <h2>Symptom frequency &amp; trend</h2>
    ${panels}
    ${markerLegend}
    ${readingTheTrend(snap)}
  </div>`
}

/**
 * IS THIS DELTA AN ARTEFACT OF WHEN THE OWNER WAS LOGGING? — one derivation, two call sites.
 *
 * Both the page-1 trajectory tile (`monitoringTiles`) and the symptom panel print this
 * comparison, and B-532's first cut migrated only the panel: the tile kept the old bucket split
 * AND compared a new-partition numerator against an old-partition floor. The result was a page
 * that disagreed with itself about direction, with the reassuring number in the prominent slot.
 * Keeping the predicate here is what stops the next change from correcting one copy again.
 *
 * Direction matters. A RISE over an unlogged EARLY window is an artefactual worsening (R2-6). A
 * FALL over an unlogged LATE window is an artefactual *improvement*, which is the direction that
 * ends a diet trial early and sends a sick animal home — the cold read produced exactly that: a
 * cat's vomiting read "first 14 d 4 → last 18 d 1" over a late window holding 5 logged days,
 * because the owner stopped logging the day the trial stopped.
 *
 * THE FLOOR IS `logged * 3 <= days`, i.e. "a third or less of the half was logged" — stated as
 * integer arithmetic rather than as `< ceil(days/3)`, because the ceiling form lost the caveat at
 * a boundary. Executed: a 90-day record with 15 of 45 late logged days and a 3× apparent
 * improvement caveated on `main` (old floor `ceil(48/3) = 16`) and stopped caveating under the
 * new equal halves (`15 < ceil(45/3) = 15` is false). A guard whose whole purpose is the
 * reassuring direction may not get quieter as a side effect of fixing the arithmetic beside it.
 */
function trendSparseCaveat(
  halves: NonNullable<SymptomAggregate['trendHalves']>,
  ag: AtAGlance,
): { side: 'early' | 'late' } | null {
  const sparse = (loggedDays: number): boolean => loggedDays * 3 <= halves.days
  if (halves.lastCount > halves.firstCount && sparse(ag.firstHalfLoggedDays)) return { side: 'early' }
  if (halves.lastCount < halves.firstCount && sparse(ag.secondHalfLoggedDays)) return { side: 'late' }
  return null
}

function symptomPanel(s: SymptomAggregate, snap: ReportSnapshot): string {
  // The first-vs-last delta, over EQUAL-LENGTH halves computed in report.ts (B-532).
  //
  // It used to be derived here, from the weekly buckets, and weekly buckets do not halve a
  // window: `mid = floor(nBuckets/2)` gave a first half of `mid × 7` days and a last half of
  // everything else, so the LATE window was systematically the longer one — by up to 6 days
  // normally, and 7-vs-1 on a nine-day report. Two raw counts over unequal exposures are not
  // a comparison, and the bias has a direction: a longer late window inflates the late count
  // and understates a real fall. The cold read found it flattening a 44% improvement in
  // episode rate, and on a diet trial "no improvement" is the reading that ends the diet.
  //
  // The halves and `atAGlance.firstHalfLoggedDays` / `secondHalfLoggedDays` now come from ONE
  // partition, so the sparse-logging caveat can never qualify a split other than the one it
  // is printed under.
  const halves = s.trendHalves
  let deltaHtml = ''
  if (halves) {
    const { days, firstCount, lastCount } = halves
    const sparse = trendSparseCaveat(halves, snap.atAGlance)
    const caveat =
      sparse?.side === 'early'
        ? `<div class="delta-caveat">early window sparsely logged (${num(snap.atAGlance.firstHalfLoggedDays)} of ${num(
            days,
          )}&nbsp;d)</div>`
        : sparse?.side === 'late'
          ? `<div class="delta-caveat">later window sparsely logged (${num(
              snap.atAGlance.secondHalfLoggedDays,
            )} of ${num(days)}&nbsp;d) &mdash; a fall here may be less logging, not fewer episodes</div>`
          : ''
    // THE EXPOSURE RIDES THE DELTA ITSELF (B-532, cold-read round 7). The per-half logged-day
    // counts were in the subnote under the chart, and round 7 found the gap that leaves: on the
    // completed-trial artifact "last 28 d 3" counted seven days nobody observed, three
    // centimetres above a chart that had just refused to draw a bar for that same week. The
    // sparse caveat does not fire at 21-of-28 and should not — that is not a sparse record —
    // but the headline number still absorbed an unobserved week into an improvement, on the one
    // report where improvement is the whole story. A threshold cannot carry this; the
    // denominator has to travel with the count.
    const obs = (n: number): string => (n < days ? ` <span class="conf">${num(n)} logged</span>` : '')
    // ── THE EXCLUDED MIDDLE DAY, WHEN IT CARRIES EVIDENCE (B-600, cold read r13) ──
    //
    // On an odd window the middle day is in neither half, which is right: handing the
    // spare day to one side reintroduces the bias equal halves exist to remove. It is
    // only right while the comparison cannot contradict the total. Rendered: a 31-day
    // window whose ONE symptom event fell on the median day printed "first 15 d 0 →
    // last 15 d 0" three centimetres under "1 / 31 d" — the delta had swallowed 100%
    // of the evidence, and two zeroes read as no episodes.
    //
    // The day is neither given to a half nor hidden: it is named beside the
    // comparison, which is C5's disclose-don't-adjudicate applied to a denominator.
    // Silent when it carries nothing, so it never fires on the majority of reports.
    const mid =
      halves.middleCount > 0 && halves.middleDate
        ? `<div class="delta-caveat">${num(halves.middleCount)} on ${h(
            fmtDay(halves.middleDate),
          )} &mdash; the middle day of an odd window, counted in the total above and in neither half</div>`
        : ''
    deltaHtml = `<div class="delta">first ${num(days)}&nbsp;d${obs(
      snap.atAGlance.firstHalfLoggedDays,
    )} <b class="num">${firstCount}</b> &rarr; last ${num(days)}&nbsp;d${obs(
      snap.atAGlance.secondHalfLoggedDays,
    )} <b class="num">${lastCount}</b></div>${mid}${caveat}`
  }
  // NAME THIS ELEMENT'S OWN PARTITION, AND ITS EXPOSURE. The cold read counted four different
  // day-groupings on one page (the window, the weekly bars, these halves, and the trial's own
  // halves) with only the bars dated — so a reader comparing "first 21 d 11" against the chart
  // had no way to know which days it covered. The dates are stated where the numbers are.
  //
  // THE LOGGED-DAY COUNTS RIDE WITH THEM, and that is the part doing clinical work. Equal
  // calendar days are not equal EXPOSURE: 11 episodes over 23 well-logged days against 5 over
  // 23 days the owner logged half as often is not an improvement, and the `days/3` sparse
  // caveat is a coarse threshold that stays silent across most of that range. C5's remedy
  // applies here exactly as it does to the trial's symptom trend — DISCLOSE the density beside
  // the count rather than adjudicate it, so a reader can see whether the two halves are
  // comparable instead of trusting that a threshold would have told them.
  const halvesBit = halves
    ? ` · trend halves: ${h(fmtRange(halves.firstStartDate, halves.firstEndDate))} (${num(
        snap.atAGlance.firstHalfLoggedDays,
      )} of ${num(halves.days)} d logged) vs ${h(fmtRange(halves.lastStartDate, halves.lastEndDate))} (${num(
        snap.atAGlance.secondHalfLoggedDays,
      )} of ${num(halves.days)} d logged)`
    : ''
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
  )} of ${num(s.windowDays)} days logged${halvesBit}.</div>
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
  // Started before the window (or unrecorded start). SAME ASSUMPTION AS THE WEIGHT
  // STRIP'S (B-600 round 11), and the same fix in waiting: `ongoing` here means the
  // course had no in-window start, which on a past-closing window does not prove it
  // began before the window either. `start` is rendered when known, so the ambiguity is
  // confined to the unrecorded-start branch — named rather than left as a silent
  // assumption, and left for the pass that has an artifact exercising it (no fixture
  // pairs a hand-picked past window with a medication course).
  if (end) return start ? `from ${start}, before this window, until ${end}` : `until ${end}`
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
  const consistBit = predominantBit(p.consistencyDistribution, 'Consistency, where legible,', (k) => k.replace(/_/g, ' '))

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

  // NO PHOTO ANYWHERE ⇒ NO CHART FURNITURE (B-532, cold-read secondary). With zero
  // photographed incidents the section still drew a full-width grey bar reading "no legible
  // read yet" under a heading promising "Automated photo analysis" — a chart-shaped element
  // standing in for data that does not exist, and the phrase "yet" implying a read is coming
  // for incidents that were never photographed. It costs a quarter of a page and gives a
  // scanner something to mistake for a finding.
  //
  // The blood/foreign limitation block is NOT dropped with it. That block is the one carrying
  // "this is not a clearance", and on the artifact where nothing was read it is the only thing
  // stopping the section's silence from reading as a negative result (the B-494 rule).
  const noPhotoAtAll = p.withAnalysis === 0
  const body = noPhotoAtAll
    ? `<div class="mixkey">No incident in this window has a photo, so there is no automated read of colour, contents or consistency. ${denom}</div>`
    : `<div>
        <div class="barmix">${mixHtml}</div>
        <div class="mixkey">${keyHtml}<br/>${denom}</div>
      </div>`
  return `
  <div class="sec">
    <h2>Vomit characteristics <span class="aitag">Automated photo analysis &middot; owner-reviewable</span></h2>
    <p class="note lead">Colour, contents, and consistency are read automatically from the photo the owner took of each incident, then aggregated below. Each read is shown for the owner to confirm; none carries a diagnosis or a verdict on a single incident.</p>
    <div class="pheno">
      ${body}
      ${sideHtml}
    </div>
  </div>`
}

/**
 * Predominant-category line with a tie-safe majority (mirrors vomitCharacteristics). Names the
 * single most-common entry, or says "no single predominant" on a tie — never asserts a false
 * majority. `label` maps the enum key to display text. Empty distribution ⇒ ''.
 */
function predominantBit(
  dist: Record<string, number>,
  lead: string,
  label: (k: string) => string,
): string {
  const entries = Object.entries(dist).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  if (entries.length === 0) return ''
  const maxN = entries[0][1]
  const tied = entries.filter(([, n]) => n === maxN).map(([k]) => label(k))
  return tied.length === 1
    ? ` ${lead} was most often ${h(tied[0])}.`
    : ` ${lead} had no single predominant reading (${h(tied.slice(0, 3).join(', '))}).`
}

/**
 * Stool characteristics (§3.7). Owner-described normal/loose bar (always) + the automated photo
 * read (§3.4, PR 7) when any stool incident had a legible AI read: Bristol consistency + colour
 * descriptively over the assessed set, and blood/mucus PRESENT-only (§5.9 — never "0 of N"), with
 * the four-state denominator disclosure (§5.10). Mucus is surfaced but framed as monitor-tier, not
 * an escalation (D5). When no stool photo was read, the pre-AI-source limitation note stands.
 */
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

  const ai = st.ai
  const aiTag = ai
    ? '<span class="aitag">Automated photo analysis &middot; owner-reviewable</span>'
    : `<span class="aside">${num(st.total)} stool event${st.total === 1 ? '' : 's'} · owner-described</span>`

  // The right-hand column: present-only blood/mucus when a photo was read; else the pre-AI limitation.
  let sideHtml: string
  if (!ai) {
    sideHtml = `
      <div class="limit">
        <span class="h">Blood &amp; mucus</span>
        <b>No photos were read</b> for a blood or mucus finding. This is <b>not</b> an exam finding — large-bowel signs like fresh blood or mucus are not reliably owner-detected without a photo or a fecal check. Absence here is not evidence of their absence.
      </div>`
  } else if (ai.bloodPresent.length === 0 && ai.mucusPresent.length === 0) {
    const openLine =
      ai.assessedCount > 0
        ? '<b>Not seen</b> in the legible photos.'
        : '<b>No photos were legible</b> for a blood or mucus read.'
    sideHtml = `
      <div class="limit">
        <span class="h">Blood &amp; mucus</span>
        ${openLine} This is <b>not</b> a clearance — a photo cannot exclude bleeding, digested (melena) blood darkens the whole stool rather than showing as red, and these are AI reads. Fresh blood or dark tarry stool warrants a vet conversation regardless of a photo.
      </div>`
  } else {
    const lines: string[] = []
    if (ai.bloodPresent.length > 0) {
      // Anatomy correct PER KIND (vet-report-cold-read PR 7): fresh_red = haematochezia (lower-GI);
      // dark_tarry = melena, digested blood (often UPPER-GI). Never a blanket "large-bowel" claim —
      // that inverts the anatomy for melena. Trailing sentence stays anatomy-neutral.
      const dates = ai.bloodPresent
        .map((b) => {
          const kind = b.kind === 'fresh_red'
            ? 'fresh red — haematochezia, a lower-GI sign'
            : b.kind === 'dark_tarry'
            ? 'black / tarry — possible melena, digested blood (often upper-GI)'
            : 'subtype unread'
          return `${fmtLocalDay(b.occurredAt, snap.timezone)} (${kind})`
        })
        .join(', ')
      lines.push(
        `<b>Possible blood — ${num(ai.bloodPresent.length)} incident${
          ai.bloodPresent.length === 1 ? '' : 's'
        }:</b> ${h(dates)}. A stool red flag — worth a vet conversation, and it leads the safety flags at the top of this report.`,
      )
    }
    if (ai.mucusPresent.length > 0) {
      const dates = ai.mucusPresent.map((m) => fmtLocalDay(m.occurredAt, snap.timezone)).join(', ')
      // D5: mucus alone is monitor-tier — surfaced, never dropped, never framed as an escalation.
      lines.push(
        `<b>Mucus — ${num(ai.mucusPresent.length)} incident${
          ai.mucusPresent.length === 1 ? '' : 's'
        }:</b> ${h(dates)}. Common and often benign on its own; shown because present.`,
      )
    }
    sideHtml = `
      <div class="present">
        <span class="h">Present findings</span>
        ${lines.join('<br/>')}<br/>${aiBadge()}
      </div>`
  }

  // The automated descriptive line (Bristol + colour + four-state denominator), when a photo was read.
  let aiLine = ''
  if (ai) {
    const bristolBit = predominantBit(ai.consistencyDistribution, 'Consistency, where legible,', (k) => BRISTOL_LABEL[k] ?? k.replace(/_/g, ' '))
    const colourBit = predominantBit(ai.colourDistribution, 'Colour, where legible,', (k) => STOOL_COLOUR_LABEL[k] ?? k.replace(/_/g, ' '))
    const noPhoto = ai.totalIncidents - ai.withAnalysis
    const stateBits: string[] = []
    if (ai.states.uncertain) stateBits.push(`${ai.states.uncertain} uncertain`)
    if (ai.states.failed) stateBits.push(`${ai.states.failed} not legible`)
    if (ai.states.pending) stateBits.push(`${ai.states.pending} still processing`)
    if (noPhoto > 0) stateBits.push(`${noPhoto} without a photo`)
    const stateDisclosure = stateBits.length ? ` (${stateBits.join(', ')})` : ''
    aiLine = `<br/>Across all ${num(ai.totalIncidents)} stool event${
      ai.totalIncidents === 1 ? '' : 's'
    }; ${num(ai.assessedCount)} ${ai.assessedCount === 1 ? 'has' : 'have'} a legible AI read${stateDisclosure}.${bristolBit}${colourBit} Bristol type is the AI's read of the photo, for the owner to confirm; it is not a diagnosis.`
  }

  return `
  <div class="sec">
    <h2>Stool characteristics ${aiTag}</h2>
    <div class="pheno">
      <div>
        <div class="barmix">${segs.join('')}</div>
        <div class="mixkey">${key.join('&nbsp;&middot;&nbsp; ')}<br/>Owner-described over ${num(st.loggedDays)} of ${num(
    st.windowDays,
  )} days logged. Loose-stool events are itemised in the symptom log (appendix&nbsp;A); normal stools are counted from the owner's logs, not itemised.${aiLine}</div>
      </div>
      ${sideHtml}
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

  if (d.trial) {
    const t = d.trial
    // Shape ① (§8) — the trial diet is itself carrying an off-trial protein. This is
    // the single finding B-351 exists for: a "duck" elimination food that also lists
    // chicken invalidates the trial, and until the set was captured the vet could only
    // learn it by reading the physical bag in-room. It leads page 1 rather than sitting
    // in an appendix because a 60-second scan that misses it draws a wrong conclusion
    // from every symptom figure below.
    //
    // Present-only and non-causal: it states what the label lists. No asterisk here —
    // the marker is only defined on the appendix sheet, and an unexplained one on page 1
    // is worse than none. Nothing renders when the set is clean OR unread: there is no
    // honest "no contaminants" string, because the commonest reason a set looks clean is
    // that the panel was never captured (D10).
    const breach = trialProteinBreaches(snap)
    const selfContam = breach.inTrialFood
    const contamBits: string[] = []
    if (selfContam.length) {
      contamBits.push(`The trial food&rsquo;s own label also lists ${h(proteinList(selfContam.map(capProtein)))}.`)
    }
    // Shape ② at its worst — a CONTINUOUSLY AVAILABLE off-trial protein (§8). A cold read of
    // an earlier draft concluded "contaminated trial food, fix the treats and re-run" from
    // page 1, when the real answer was that an ad-lib chicken bowl meant the elimination diet
    // was never run at all. That fact was on page 3. An ad-lib competing antigen outranks the
    // discrete exposures below it, so it belongs on the line the trial is described on.
    // The permitted extra, in its own voice and naming its own product. It reads as a
    // fact about the OWNER'S ALLOWED LIST — which is a fact about the vet's own
    // prescribing, and the more actionable of the two findings.
    for (const c of breach.permittedExtras) {
      // ITS OWN POINTER. The shared trailing "Full protein sets in appendix B" was
      // written for a MEAL-FED food, and appendix B's protein table holds only those —
      // so a vet following it to see what else the chew carries lands on a table the
      // chew is not in. An allowed-list treat's set is in appendix C, with its rung.
      contamBits.push(
        `${h(c.food.label)}, on the allowed list, also lists ${h(
          proteinList(c.extraProteins.map(capProtein)),
        )} (its full set is in appendix&nbsp;C).`,
      )
    }
    const freeFedOff = breach.freeFed
    if (freeFedOff.length) {
      contamBits.push(
        `${h(proteinList(freeFedOff.map(capProtein)))} ${
          freeFedOff.length === 1 ? 'is' : 'are'
        } also continuously available in a free-fed bowl &mdash; intake not directly observed.`,
      )
    }
    // There is no honest "no contaminants" string — but there IS an honest string for
    // the unread case, and refusing both made page-1 silence mean two opposite things
    // on the report's most-scanned line: "this trial diet is single-protein" and
    // "nobody has read this trial diet's label". A cold read cannot tell them apart,
    // and today the second is the common state (nothing has been re-extracted yet), so
    // silence defaults to the reassuring reading. State the gap instead.
    if (!t.proteinSet.complete) {
      contamBits.push(
        `The trial food&rsquo;s ingredient panel has not been captured, so any protein in it beyond ${
          t.primaryProtein ? h(capProtein(t.primaryProtein)) : 'the one on the front of the pack'
        } is unknown here.`,
      )
    }
    // The claim was promoted to page 1; its provenance must come with it. A vet may change
    // a prescription diet on the strength of "the duck food also lists chicken", and that
    // sentence is an automated read of an owner's photo, not a transcription by a person.
    // NAME WHICH SETS APPENDIX B ACTUALLY HOLDS. It carries the MEAL foods, so the bare
    // pointer was false for exactly the foods the sentence above it is about — an
    // allowed-list treat. Under a trial the allowed list on this page now carries each
    // permitted food's own set, so point there instead of at a table it is not in.
    const setPointer = snap.trial
      ? 'Meal-food protein sets in appendix&nbsp;B; each allowed food&rsquo;s set is on the allowed list above.'
      : 'Full protein sets in appendix&nbsp;B.'
    const contamBit = contamBits.length
      ? ` <b>${contamBits.join(' ')}</b> ${PROTEIN_READ_CAVEAT} ${setPointer}`
      : ''
    left.push(
      kv(
        'Trial diet',
        `${t.foodLabel ? h(t.foodLabel) : 'Trial diet'}${
          // "(duck)" is the skimmable token, and it reads as a statement of composition —
          // which the very next clause contradicts when the label also lists chicken. Say
          // what the parenthetical actually means in that case: how the food is SOLD.
          t.primaryProtein ? ` (${selfContam.length ? 'labelled ' : ''}${h(t.primaryProtein)})` : ''
        } &middot; ${trialDayPhrase(snap.trial, t.targetDurationDays)} &mdash; coverage, exposures and overlapping medication are in the diet-trial block above.${contamBit}`,
      ),
    )
  } else {
    left.push(kv('Diet', 'No active diet trial in this window — symptom monitoring.'))
  }

  // Feeding: meal completion (meals-only) + free-fed verbatim string (B-040).
  const isFreeFed = d.freeFed.length > 0
  // BOTH INTAKE-FAMILY FLAGS, not only the relative detector (B-494). This guard exists so a
  // grazing cat with NO intake concern is described rather than scored — but the new refusal
  // lane fires on precisely the animal the scored figure is right for, and it was not in the
  // test, so a flagged refusal still got the describe-don't-score framing.
  const hasIntakeFlag = snap.safetyFlags.some(
    (f) => f.kind === 'intake_decline' || f.kind === 'trial_diet_refusal',
  )
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
    // THE ADVERB KEEPS ITS DENOMINATOR (B-532, cold-read finding) — and this is a genuine
    // collision between two cold reads, resolved by keeping BOTH rather than trading one
    // finding for the other.
    //
    // R2-3 won this branch its descriptive framing: "0 of 25 meals fully eaten" reads as
    // anorexia — feline lipidosis territory — for a cat that grazes across the day and whose
    // discrete meals routinely go unfinished, on a record where the intake engine fired no
    // flag at all. That reasoning still holds and the mode word stays.
    //
    // But round 7 found the cost of the adverb ALONE: it was the one page-1 intake statement
    // in the whole document set with no numbers behind it, and it appears only on the report
    // that reads well — the refusing cat got "0 of 38", the well-logged dog "86 of 87", and
    // the clean-looking completed trial got `typically "ate it all"` with the real figure
    // (96 of 98) a page later in appendix E. Vagueness that runs only in the reassuring
    // direction is the exact shape this pass exists to remove.
    //
    // Both, then. The count is stated, and what protects the grazer from it is the sentence
    // it sits inside — "Primarily free-fed … Intake not directly observed" leads, and these
    // meals are explicitly "also". Composition is the guard, as it is on the B-494 band; a
    // number a clinician can check beats an adverb they cannot.
    //
    // A NULL MODE STAYS NULL. `strictPluralityIntake` returns null on a tie precisely so the
    // report never picks a side, and defaulting it to "ate it all" here would invent the
    // reassuring reading — the same defect one line up, committed by the fix for it.
    const modeBit = mc && mc.intakeMode ? `, typically &ldquo;${h(intakeLabel(mc.intakeMode).toLowerCase())}&rdquo;` : ''
    const typically = mc ? `${modeBit} &mdash; ${num(mc.finishedMeals)} of ${num(mc.ratedMeals)} fully eaten` : ''
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

  // Off-diet. UNDER A TRIAL the definition belongs to `classifyFeeding` and lives in
  // the block above, so this line must not restate a treat count as if it were the
  // off-diet set — that is the disagreement §7's "one definition of off-diet across
  // page 1, the tile and the appendix" exists to close. On live data the treat count
  // IS the disagreement: 82% of feedings are treats, so the heuristic reports ~530
  // exposures across 645 feedings while the trial's allowed list reports a handful.
  // Human food stays named either way — it is the #1 diet-trial confounder (B-102)
  // and a composition fact about the same feedings, not a rival total.
  const offBits: string[] = []
  if (snap.trial && !snap.trial.allowedSetUnavailable) {
    offBits.push(
      `Defined by this trial&rsquo;s allowed list &mdash; see the diet-trial block above; dates in appendix&nbsp;C.`,
    )
  }
  // NOT UNDER A TRIAL-DERIVED HEADING. This count is WINDOW-scoped, and on a
  // trial-derived report the line two above it has just declared the trial's allowed
  // list to be the definition of off-diet. The adversarial pass produced the
  // contradiction: a 91-day window whose four table-chicken feedings all predate the
  // trial rendered "Human food on 4 days (4 feedings) — the #1 diet-trial confounder"
  // beside a tile reading "All matched the trial diet or a permitted food", pointing
  // at an Appendix C that was empty. It fabricates four contaminations, blames the
  // owner for them (§6.9), and dangles its own cross-reference. Human food inside the
  // trial is already in the trial's exposure count and in Appendix C; human food
  // outside it is not this heading's business.
  if (d.humanFood.count > 0 && !(snap.trial && !snap.trial.allowedSetUnavailable)) {
    const items = distinctLabels(d.humanFood.items, 6)
    // Trial-aware framing (adversarial finding A4): "the #1 diet-trial confounder" is the
    // B-102 wedge phrasing, but it asserts a trial. On a no-trial monitoring report it reads
    // as a self-contradiction ("no diet trial" then "the diet-trial confounder").
    const confounderTag = d.trial ? ' — the #1 diet-trial confounder.' : ' — a common dietary confounder.'
    offBits.push(
      `Human food on ${num(d.humanFood.days)} day${d.humanFood.days === 1 ? '' : 's'} (${num(
        d.humanFood.count,
      )} feeding${d.humanFood.count === 1 ? '' : 's'}: ${items})${confounderTag}`,
    )
  }
  if (d.treats.count > 0) {
    // Under a trial this is COMPOSITION, not the off-diet total — a permitted treat
    // is a treat, and counting it here as an exposure is exactly what the re-base
    // deleted. The wording says which it is.
    // Same scope mismatch as the human-food line: the count is window-wide while the
    // heading's definition is the trial's. Dropped under a trial-derived report — the
    // trial block carries the feeding total that the exposure count denominates on.
    if (!(snap.trial && !snap.trial.allowedSetUnavailable)) {
      offBits.push(
        `${num(d.treats.count)} treat${d.treats.count === 1 ? '' : 's'} (${num(d.treats.distinctItems)} distinct). Dates in appendix&nbsp;C.`,
      )
    }
  }
  // ── B-531: THE EMPTY LINE, AND THE HEADING IT SITS UNDER ───────────────────
  //
  // The predecessor of this branch pushed 'None logged in this window.' with a
  // comment asserting it could never be reached under a trial, "because the branch
  // above always pushes a line". The branch above pushes a line when the trial has
  // a USABLE allowed list — and the sub-state where it does not (`allowedSetUnavailable`:
  // a cold cache, a half-hydrated set, a re-photographed bag) is exactly where both
  // of the count lines above are also suppressed. So on a real trial report with a
  // dark permit set, all three branches fell through to the one sentence G2 deletes
  // from the product at every coverage, on every surface. Executed by the pre-ship
  // adversarial chair; the comment was the defect, not the guard.
  //
  // R2 (PM, 2026-07-27): G2's jurisdiction is TRIAL reports — and a no-trial report
  // should not be using "off-diet" vocabulary at all, because there is no diet to be
  // off. So the heading names what the section actually lists, and its empty line is
  // record-scoped under that heading rather than a claim about exposure.
  if (offBits.length === 0) {
    offBits.push(
      snap.trial
        ? 'No allowed-food list is recorded for this trial, so no feeding in this window has been checked against one. The feedings themselves are in appendix&nbsp;C.'
        : 'No treats or table food are recorded in this window.',
    )
  }
  // THE LABEL FOLLOWS THE SAME TEST THE APPENDIX DOES. Branching on `snap.trial` alone
  // left a dark-permit-set report heading this row "Off-diet" while it pointed at an
  // appendix B-531 had just renamed "Treats & table food during the trial" — page 1
  // disagreeing with its own cross-reference, in the direction this PR set out to fix.
  const offDietDerived = !!snap.trial && !snap.trial.allowedSetUnavailable
  left.push(kv(offDietDerived ? 'Off-diet' : 'Treats &amp; table food', offBits.join(' ')))

  // Medications (B-117) + supplements as concurrent interventions.
  // §7 calls the medication overlap "re-siting, not addition", and it is re-sited —
  // but SPLIT rather than moved wholesale, which is a deliberate deviation worth
  // stating. What moves into the trial block is the OVERLAP FRAMING: which drug, over
  // which span, still running at the window end, and the GI-trial antibacterial note.
  // That is the fact "a derm trial is unreadable" without, and a vet reads it beside
  // the trial's own numbers or not at all. What stays here is per-regimen ADHERENCE —
  // doses given, missed, refused, unconfirmed — which answers a different question
  // (was the drug actually taken?) and would be a regression to drop from page 1 of
  // every trial report. Neither line restates the other.
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
  // "NONE RECORDED AS REFUSED", NOT "NONE REFUSED" (cold read round 13). Appendix D
  // already says the honest form; page 1 did not. On a regimen where three of seven
  // doses were never logged at all, "none refused" is a claim over the four that were,
  // rendered as though it covered the seven — the exact absence-as-fact this report is
  // otherwise scrupulous about (an unlogged drug reads "adherence not tracked", never
  // "given"). Same rule, one surface behind.
  extras.push(m.refusedDoses ? `${m.refusedDoses} refused` : 'none recorded as refused')
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
  const meta = [u.strength ? h(u.strength) : null, u.route ? h(u.route) : null]
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
    // A JOINT candidate (B-351 slice 6) must declare itself HERE, on the most-scanned
    // line of the report.
    //
    // CURRENTLY UNREACHABLE BY CONSTRUCTION, and kept anyway. After the adversarial pass,
    // a joint candidate caps at Early (§7 #4) and §8.5 admits only Established, so no joint
    // finding reaches this line today. That cap is a spec-vs-build call the PM may rule
    // either way; if it is ever relaxed, the report must not silently render a joint
    // candidate bare. Defence in depth costs one branch here and would cost a vet a wrong
    // diet decision there. Without the clause a vet reads "chicken and duck reached the
    // established association threshold" as two independently-implicated antigens and
    // may drop both from the diet — when the actual finding is that the record cannot
    // yet distinguish them, and the informative next step is to separate them. The
    // engine already refuses to credit one; the report must not un-refuse it by
    // omission.
    const joint =
      e.proteins && e.proteins.length > 1
        ? ` These proteins co-occur in every exposure on record, so the association <b>cannot be attributed to either one individually</b> — separating them would be informative.`
        : ''
    return `${h(e.protein)} reached the established association threshold for ${h(
      symptomLabel(e.symptomType).toLowerCase(),
    )} over this window (${num(e.caseExposed)}/${num(e.matchedPairs)} exposed cases vs ${num(
      e.controlExposed,
    )} controls; p&nbsp;=&nbsp;${e.pValue.toFixed(3)}). An association, <b>not a proven cause</b>.${joint} Detail in appendix&nbsp;C.`
  }
  const staple = c.stapleProtein
    // "IS OFFERED", NOT "EATS" (cold read round 10). The staple-washout reason is about
    // what is PRESENT across the record, and it rendered on the refusing cat — whose
    // page-1 lead finding is 38 of 38 rated feedings left unfinished, with the only
    // other source a free-fed bowl nobody observes. "Eats" asserts intake on the one
    // document whose headline is that there wasn't any. Same invariant as the refusal
    // lane: what the app sees is what was put down, never what went in.
    ? ` — ${h(c.stapleProtein)} is in most of what ${h(snap.signalment.name)} is offered, so it can't be isolated`
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
  <p class="appx-sub">Every symptom event in the window, in order. &ldquo;Occurred&rdquo; is the owner's best account of when it happened; for events found later it is a time range, not the time it was noticed.${estBit} For photographed incidents the automated photo-analysis fields are shown beneath the note (owner-reviewable).</p>
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
  <p class="note" style="margin-top:9px"><b>Why a range and not a time:</b> an event found at 07:44 but occurring around 04:00 changes the interval from the prior meal from minutes to hours — a clinically different picture. Where the owner did not witness the event, the window it occurred in is shown, not the time it was noticed. Photo findings are Culprit's read of the owner's photo, owner-reviewable; they never carry a diagnosis or a single-incident verdict (that stays in the app, off this report).</p>
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
    // PRESENT-only (§5.9): render blood/foreign/mucus ONLY when present; silence otherwise.
    const bits =
      ph.kind === 'stool'
        ? [
            ph.bristol ? `consistency ${h(BRISTOL_LABEL[ph.bristol] ?? ph.bristol.replace(/_/g, ' '))}` : null,
            ph.stoolColour ? `colour ${h(STOOL_COLOUR_LABEL[ph.stoolColour] ?? ph.stoolColour.replace(/_/g, ' '))}` : null,
            ph.stoolBlood
              ? `<b>blood ${
                  ph.stoolBlood === 'fresh_red'
                    ? 'possible fresh red (haematochezia)'
                    : ph.stoolBlood === 'dark_tarry'
                    ? 'possible black/tarry (melena)'
                    : 'possible (subtype unread)'
                } (AI, unconfirmed)</b>`
              : null,
            // Mucus is monitor-tier (D5) — surfaced, present-only, but NOT bolded like a red flag.
            ph.mucusPresent ? `mucus present (AI, unconfirmed)` : null,
          ].filter(Boolean)
        : [
            ph.colour ? `colour ${h(ph.colour)}` : null,
            ph.contentsCategory ? `contents ${h(contentsLabel(ph.contentsCategory).toLowerCase())}` : null,
            ph.consistency ? `consistency ${h(ph.consistency.replace(/_/g, ' '))}` : null,
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
  ${
    // The `*` is only legible where the sheet defines it — a marker whose legend sits two
    // pages back is a marker a reader ignores. Emitted only when this table actually
    // rendered one.
    items.length > 0 && items.some((i) => i.proteinSet.offTrial.length > 0)
      ? offTrialFootnote(snap.diet.trialTargetProtein)
      : ''
  }
  ${log.length > 0 ? intakeDetailTable(snap, log) : ''}
  ${footer(snap, 'Appendix E — meals & intake')}
</section>`
}

/** The grouped meal-item summary — one row per food (label · protein · feedings · span · typical intake). */
function mealItemsTable(snap: ReportSnapshot, items: DietSummary['mealItems']): string {
  const total = items.reduce((a, i) => a + i.count, 0)
  const markOffTrial = snap.diet.trialTargetProtein != null
  const rows = items
    .map((i) => {
      const span =
        i.firstDate && i.lastDate && i.firstDate !== i.lastDate
          ? `${h(fmtDay(i.firstDate))} &ndash; ${h(fmtDay(i.lastDate))}`
          : h(fmtDay(i.firstDate ?? i.lastDate))
      const feedings = i.count > 1 ? `&times;${num(i.count)}` : num(1)
      // EVERY RATING, NOT THE MODE (B-532). `intakeMode` is a strict plurality, so a
      // single word here stood for as little as 51% of the feedings and DELETED the
      // rest — on the canonical refusal artifact it printed "Refused" over 38 feedings
      // and silently dropped the four "ate some" meals that were the only intake the
      // cat took in nineteen days. Three strings on this report send the reader here
      // for the ratings; the cell they land on has to hold all of them.
      //
      // Below-baseline ratings carry weight, matching `intakeLogRow` one table down, so
      // the concerning share reads at a glance without becoming a score or a verdict.
      const typical =
        i.intakeBreakdown.length > 0
          ? i.intakeBreakdown
              .map((b) => {
                const cell = `${h(intakeLabel(b.rating))} &times;${num(b.count)}`
                return b.rating === 'all' || b.rating === 'most' ? cell : `<b>${cell}</b>`
              })
              .join(' &middot; ')
          : '&mdash;'
      // The FULL captured set, not the primary (cold-read blocker, B-351 slice 5). This is the
      // table a vet checks to answer "what did she actually eat" — it itemises the bulk of the
      // intake — so rendering a bare `duck` here for a food whose label also lists chicken was
      // the one place in the report that showed the contaminated trial diet as clean. Marked
      // off-trial like every other set, because this sheet defines the marker below.
      return `<tr><td>${i.foodLabel ? h(i.foodLabel) : '&mdash;'}</td><td>${proteinSetCell(
        i.proteinSet,
        markOffTrial,
      )}</td><td class="c num">${feedings}</td><td class="num">${span}</td><td>${typical}</td></tr>`
    })
    .join('')
  return `
  <table>
    <caption>${num(total)} logged meal${total === 1 ? '' : 's'} across ${num(items.length)} food${
    items.length === 1 ? '' : 's'
  } &middot; ${h(fmtRange(snap.scope.startDate, snap.scope.endDate))}</caption>
    <thead><tr><th>Food</th><th style="width:104px">Protein</th><th class="c" style="width:64px">Meals</th><th style="width:118px">Dates</th><th style="width:150px">Intake recorded</th></tr></thead>
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
  // B-532 — the two populations, named. `unfinished` means no reduced-intake flag fired,
  // so there is no page-1 figure for these rows to trace to: they are here because the
  // report keeps pointing at "the intake ratings", and a mode cell is not those.
  const unfinishedOnly = snap.provenance.intakeLogScope === 'unfinished'
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
  const noun = unfinishedOnly ? 'unfinished meal' : 'rated meal'
  // `unfinished` is the app's one predicate (`feedingWasFinished`: `most`/`all` are eaten), so
  // the rows listed here are exactly the rows this table bolds. Never a second definition.
  const hiddenBit =
    hidden > 0
      ? ` ${num(hidden)} earlier ${noun}${hidden === 1 ? '' : 's'} in this window ${
          hidden === 1 ? 'is' : 'are'
        } not shown (the most recent are listed${hasFull && log.some((e) => e.pinned) ? ', plus the last full meal' : ''}).`
      : ''
  // Only claim a tagged anchor row when one exists — a window with no fully-eaten meal has none.
  //
  // THE `unfinished` POPULATION MAKES NEITHER CLAIM (B-532). It has no anchor row by
  // construction, and the no-anchor sentence — "no fully-eaten meal was recorded in this
  // window" — would be flatly FALSE here, because the fully-eaten meals are precisely what
  // this table filters out. Printing an absence claim over a record that contradicts it is
  // the failure class this pass exists to remove, so the branch is explicit rather than
  // falling through to the anchor wording.
  const readingBit = unfinishedOnly
    ? // NAME THE DETECTOR, NOT "A FLAG" (B-532, cold-read round 7). The first cut said "No
      // reduced-intake flag fired on this record" — on a document whose page 1 LEADS with a
      // diet-not-eaten flag over 38 of 38 refusals. Technically true (they are different
      // detectors) and read as a contradiction: a vet skimming takes it as *the intake
      // detector looked and found nothing*, and resolving it means learning the app's
      // vocabulary from a legend three pages on, which the 60-second bar forbids.
      '<b>Reading this:</b> these are the meals rated below &ldquo;ate it all&rdquo;. Fully-eaten meals are counted in the table above and are not repeated here. The <i>relative</i> reduced-intake detector &mdash; which compares recent meals against this pet&rsquo;s own baseline &mdash; did not fire here; that is not a reading of whether intake was adequate, and any safety flag on page&nbsp;1 stands on its own.'
    : `<b>Reading this:</b> ${
        hasFull
          ? 'the &ldquo;last fully-eaten meal&rdquo; on page&nbsp;1 is the row tagged &ldquo;last full meal&rdquo; here; the time since it is how long the pet has gone without a full meal, which sets the urgency of a reduced-intake flag (especially the feline 48&ndash;72&nbsp;h window)'
          : 'no fully-eaten meal was recorded in this window, so page&nbsp;1 shows no &ldquo;last full meal&rdquo; and none is tagged here'
      }. Absence of a full meal is not evidence the pet ate nothing — only that no fully-eaten meal was recorded.`
  const lead = unfinishedOnly
    ? '<b>Meals not finished</b> — every rated meal in this window the owner did not record as fully eaten, most recent first.'
    : '<b>Recent rated meals</b> — the meals behind the reduced-intake flag on page&nbsp;1, most recent first.'
  return `
  <p class="note lead" style="margin-top:16px">${lead}${hiddenBit}</p>
  <table>
    <caption>${num(log.length)} ${noun}${log.length === 1 ? '' : 's'} shown &middot; ${h(
    fmtRange(snap.scope.startDate, snap.scope.endDate),
  )}</caption>
    <thead><tr><th style="width:64px">Date</th><th style="width:58px">Time</th><th>Food</th><th style="width:150px">Intake</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="note" style="margin-top:9px">${readingBit}</p>`
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
  <p class="appx-sub">${lead} — the owner's own photos, attached when the event was logged. For analyzed incidents the automated photo-analysis fields are shown beneath (owner-reviewable, unconfirmed); a photo flagged for possible blood or foreign material also leads the safety flags on page&nbsp;1. Photo metadata (location, device, capture time) is removed before embedding. A clear photo is never an all-clear and these never carry a diagnosis.${missingNote}${removedNote}</p>
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
  // The `*` marker is defined ONCE for the sheet, between its two users (appendix B's
  // protein rows and appendix C's protein column), and only when a marker was actually
  // rendered — a legend for a symbol that never appears is noise on a 60-second scan.
  // …AND BESIDE THE TABLE THAT USED IT (cold read round 13). The condition was one
  // union over BOTH appendices while the legend rendered in one place — under B — so a
  // report whose only marked rows are in C printed the legend beneath a protein list
  // containing no asterisk. A dangling legend on a clinical page sends the reader
  // hunting for a marker that is not there.
  const hasTrial = snap.diet.trial != null
  const markedB =
    hasTrial &&
    (snap.diet.trial!.proteinSet.offTrial.length > 0 ||
      snap.diet.freeFed.some((f) => f.proteinSet.offTrial.length > 0) ||
      snap.diet.mealItems.some((m) => m.proteinSet.offTrial.length > 0))
  const markedC = hasTrial && snap.provenance.confounders.some((c) => c.proteinSet.offTrial.length > 0)
  return `
<section class="page">
  ${dietHistoryAppendix(snap)}
  ${markedB ? offTrialFootnote(snap.diet.trialTargetProtein) : ''}
  ${offDietAppendix(snap)}
  ${!markedB && markedC ? offTrialFootnote(snap.diet.trialTargetProtein) : ''}
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
  /** The full captured set for this row's food (B-351 slice 5) — what the Protein column renders. */
  proteinSet: ProteinSetView
  note: string | null
  count: number
  firstDay: string | null
  lastDay: string | null
  /** Which §5.3 rung classified this row off-diet, on a trial-derived set. Null on a
   *  heuristic report. Grouped rows only carry it when every member agrees, so the
   *  Why column never generalises one feeding's reason onto another's. */
  rung: 'derived_protein' | 'unrecognised' | null
  /** Any member of this row was followed by a symptom inside the species' forward
   *  challenge window. TIMING ONLY — see the footnote it renders. */
  symptomInChallengeWindow: boolean
  /** The food's ingredient panel WAS captured. Rung 3 then means "read, and nothing
   *  in it is outside the trial diet" — not "we never looked" (#6). */
  panelWasRead: boolean
  /** B-529/R7(c) — the antigen arm was consulted for EVERY member of this row.
   *  False disqualifies the affirmative rung-3 reason: `panelWasRead` says a
   *  label existed, this says something actually compared it. Folded with AND
   *  rather than joining the group key, so one unchecked member cannot inherit
   *  the all-clear from its neighbours — the same rule the `rung` comment states
   *  and the opposite of `symptomInChallengeWindow`'s ANY. */
  attributionChecked: boolean
  /** This same food became permitted LATER — so the row is here because it predates
   *  permission, which outranks whichever rung also fired. */
  permittedLaterFrom: string | null
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
      itemised.push({
        category: cat,
        label: c.foodLabel,
        protein: c.primaryProtein,
        proteinSet: c.proteinSet,
        note: c.note,
        count: 1,
        firstDay: day,
        lastDay: day,
        rung: c.rung ?? null,
        symptomInChallengeWindow: c.symptomInChallengeWindow ?? false,
        panelWasRead: c.panelWasRead ?? false,
        attributionChecked: c.attributionChecked ?? true,
        permittedLaterFrom: c.permittedLaterFrom ?? null,
      })
      continue
    }
    // The captured SET joins the group key (B-351 slice 5). Grouping is by label, and
    // two library rows can share a label while differing in what was actually read off
    // their panels (one re-photographed with the ingredient list, one not) — merging
    // those would silently attribute one row's secondaries to the other's feedings.
    const key = `${cat}||${c.foodLabel ?? ''}||${c.primaryProtein ?? ''}||${c.proteinSet.proteins.join(',')}|${
      c.proteinSet.complete ? 'c' : 'i'
    }|${c.rung ?? ''}`
    let g = groups.get(key)
    if (!g) {
      g = {
        category: cat,
        label: c.foodLabel,
        protein: c.primaryProtein,
        proteinSet: c.proteinSet,
        note: null,
        count: 0,
        firstDay: day,
        lastDay: day,
        rung: c.rung ?? null,
        panelWasRead: c.panelWasRead ?? false,
        attributionChecked: true,
        permittedLaterFrom: c.permittedLaterFrom ?? null,
        // ANY member is enough to mark the row: the marker means "at least one of
        // these feedings was followed by a symptom in the window", and a grouped row
        // that hid that would drop the only reason a vet reads a grouped row twice.
        symptomInChallengeWindow: false,
      }
      groups.set(key, g)
    }
    g.count++
    if (c.symptomInChallengeWindow) g.symptomInChallengeWindow = true
    // AND, not ANY: a row may claim "nothing in its label is outside the trial
    // diet" only if every feeding under it was actually compared.
    if (c.attributionChecked === false) g.attributionChecked = false
    // AND-fold `panelWasRead` for the same reason, and because it is the
    // co-conjunct of the all-clear branch: it was first-member-wins, so two
    // feedings of one food — one panel captured, one not — rendered "its label
    // carries nothing the trial diet does not" or "ingredients not read" purely
    // on which was logged first. Same data, different sentence, decided by log
    // order. A row may claim a label was read only if every member's was.
    if (c.panelWasRead !== true) g.panelWasRead = false
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

function confounderRowHtml(r: ConfounderRow, markOffTrial: boolean, trialDerived: boolean): string {
  const span =
    r.firstDay && r.lastDay && r.firstDay !== r.lastDay
      ? `${h(fmtDay(r.firstDay))} &ndash; ${h(fmtDay(r.lastDay))}`
      : h(fmtDay(r.firstDay))
  // The timing dagger. Marks ONLY that a symptom was logged inside the species'
  // forward challenge window after this feeding — never that one caused the other.
  const dagger = trialDerived && r.symptomInChallengeWindow ? ' <span class="rnote">&dagger;</span>' : ''
  const item = `${r.label ? h(r.label) : '&mdash;'}${dagger}${r.note ? ` <span class="rnote">${h(r.note)}</span>` : ''}`
  const feedings = r.count > 1 ? `&times;${num(r.count)}` : num(1)
  // §6.3: "a flag the owner cannot interrogate is an unfalsifiable accusation." On the
  // report the reader is the vet, and the same rule applies — a row listed as off-diet
  // has to say WHICH rung put it there, because rung 3 (the modal case on a real
  // library) means only "not on the list, and nobody has read its ingredients" and must
  // never be read as a contaminant assertion.
  // DATED MEMBERSHIP OUTRANKS THE RUNG, because when both are true the date is the
  // reason the row is here and the rung is the misleading half. Round 4: a Jun 2
  // DentaStix read "Protein not in the trial diet" while page 1 listed the same food as
  // a "permitted treat (from Jun 8) ×25" — and those 25 feedings of the identical
  // protein set are correctly absent from this table. The two lines cannot be
  // reconciled on protein grounds, and a vet reading the protein reason concludes a
  // vet-permitted treat is a contaminant.
  const why = trialDerived
    ? `<td>${
        r.permittedLaterFrom
          ? `Fed before it was permitted (allowed from ${h(fmtDay(r.permittedLaterFrom))})`
          : r.rung === 'derived_protein'
            ? 'Protein not in the trial diet'
            : // B-529/R7(c). THREE ROUTES REACH RUNG 3, NOT TWO. This branch read
              // "read, and nothing in it is outside the trial diet" whenever a
              // panel existed — an affirmative all-clear. The silence rule added a
              // third route ("we did not check"), and the third adversarial pass
              // executed the cost on byte-identical input: a correct
              // `Chicken ×5 / "Protein not in the trial diet"` became
              // `[] / "carries nothing the trial diet does not"`, i.e. the column
              // whose whole job is naming which check placed the row here started
              // asserting a check that never ran. Worse, both strings appeared in
              // ONE report for the same chew on different dates.
              !r.attributionChecked
              ? 'Not on the trial&rsquo;s list; not checked against it (see above)'
              : r.panelWasRead
                ? 'Not on the trial&rsquo;s list; its label carries nothing the trial diet does not'
                : 'Not on the trial&rsquo;s list; ingredients not read'
      }</td>`
    : ''
  // The Protein column carries the whole captured set, not the primary alone (§9) — the
  // hidden secondary in a treat is exactly the exposure a vet is scanning this table for.
  return `<tr><td>${item}</td><td>${h(confCategoryLabel(r.category))}</td>${why}<td>${proteinSetCell(
    r.proteinSet,
    markOffTrial,
  )}</td><td class="c num">${feedings}</td><td class="num">${span}</td></tr>`
}

function offDietAppendix(snap: ReportSnapshot): string {
  const conf: ConfounderExposure[] = snap.provenance.confounders
  const hasTrial = !!snap.diet.trial
  // TRIAL-DERIVED means every row here came from `classifyFeeding` against this
  // trial's allowed list, rather than from the treat-or-human-food heuristic. It is
  // what every caption below branches on, because the two sets are not the same set
  // and a caption that describes the wrong one is the defect §7 sent this PR to fix
  // ("`render.ts` claims 'Everything fed outside the trial diet' over a computation
  // that does no such thing"). NOT the same test as `hasTrial`: a trial whose allowed
  // list never hydrated still has a trial and still falls back to the heuristic.
  const trialDerived = !!snap.trial && !snap.trial.allowedSetUnavailable

  // Aggregate-first (R2-1): LEAD with the protein/product tally — the useful antigen picture the
  // first artifact buried at the very end — then the grouped exposure rows below it.
  const tally = Object.entries(snap.provenance.proteinExposureTally)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    // Title-cased like the chart legend and the protein column — mixed casing for the
    // same antigen on one sheet reads as two different things at a 60-second scan.
    .map(([p, n]) => `${h(capProtein(p))} &times;${n}`)
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
  // Free-fed carries its whole set now, not just the primary: an ad-lib bowl is the
  // biggest breach of an elimination trial, and its hidden secondary is the worst
  // version of that (B-351 slice 5).
  // THE TRIAL DIET IS NOT A COMPETING ANTIGEN (B-532, cold-read round 7). The set was the
  // free-fed bowls' whole protein list, and the tightly-controlled setup the free-fed state
  // exists for is a bowl holding the TRIAL DIET — so the artifact printed *"Free-fed alongside
  // the trial: Venison … a competing antigen no per-feeding count can capture"* on a venison
  // trial. Wrong on its face, reads as a template leak, and it costs trust in the sections
  // around it. The sentence is about proteins the trial does NOT sanction; the bowl's own
  // unobserved-intake problem is stated where it belongs, on the trial block and the tile.
  const trialSanctioned = new Set(
    (snap.trial?.permittedFoods ?? [])
      .filter((f) => f.role === 'primary_diet' && f.panelRead)
      .flatMap((f) => f.proteins),
  )
  const freeFedProteins = [
    ...new Set(snap.diet.freeFed.flatMap((f) => f.proteinSet.proteins)),
  ].filter((p) => !trialSanctioned.has(p))
  // The trial-scope phrase, shared with page 1's row (B-600 round 10): on a truncated
  // report "during the trial" is a whole-trial claim over a fraction of it.
  const antigenScope = snap.trial ? trialCountScope(snap.trial) : 'during the trial'
  const tallyParts: string[] = []
  // D-B, under a trial: the antigen tally counts the protein on PERMITTED feedings
  // too, and says how many came from an approved food. Rung 1's `stop` is what makes
  // a vet-approved treat permitted, counted, and never protein-checked; without this
  // line six dental chews a day reads as a clean elimination to both owner and vet —
  // a STRONGER false negative than the mislabel this feature replaced, because it
  // arrives with the authority of a two-fact presentation. It replaces the off-diet-
  // only tally rather than sitting beside it: two protein totals on one sheet, one of
  // them a subset of the other, is a sheet a vet cannot reconcile in 60 seconds.
  if (trialDerived && snap.trial!.antigenTally.length > 0) {
    const antigens = snap.trial!.antigenTally
      .map((a) => {
        const from =
          a.fromPermitted === 0
            ? ''
            : a.fromPermitted === a.feedings
              ? ' (all from an approved food)'
              : ` (${num(a.fromPermitted)} from an approved food)`
        return `${h(capProtein(a.protein))} &times;${num(a.feedings)}${from}`
      })
      .join(', ')
    tallyParts.push(
      // SAME SCOPE FIX AS PAGE 1's ROW (B-600 round 10). The cold read named this
      // sibling explicitly, and leaving it would have put the un-scoped phrasing in
      // the appendix a reader is sent to in order to CHECK the page-1 figure.
      // THE LABEL SCOPES IT; THE GLOSS DOES NOT REPEAT IT (cold read round 13). Rendered,
      // the eight-word qualifier appeared twice in this one sentence and outweighed the
      // finding it qualifies — "Antigen exposures in the 31 trial days this report
      // covers: Beef ×1 — proteins fed in the 31 trial days this report covers that…",
      // pushing the number to the middle. The scoping is right; the density was not.
      `<b>Antigen exposures ${antigenScope}:</b> ${antigens}${unknownBit} — proteins fed in that range that the trial diet does not contain, counted on approved and unapproved feedings alike. A food containing several counts once for each.`,
    )
  } else if (tally) {
    tallyParts.push(
      `<b>Protein exposures (off-diet):</b> ${tally}${unknownBit}${
        hasTrial
          ? ' — the antigens most likely to break an elimination trial.'
          : ' — off-diet protein exposures to weigh against the symptom pattern.'
      } A food containing several proteins counts once for each, so these can total more than the ${num(
        snap.proteinTimeline.totalFeedings,
      )} feeding${snap.proteinTimeline.totalFeedings === 1 ? '' : 's'} below.`,
    )
  }
  // §7: permitted foods rendered WITH COUNTS, not just membership. "DentaStix — 168
  // feedings over 28 days" is what turns an allowed list from a rule into evidence.
  if (trialDerived) {
    // The EXTRAS, not the trial diet — "what else did the animal get that the vet
    // said was OK" is the question this appendix answers, and the prescribed diet's
    // own feeding count is coverage, one section up. Listing it here alongside
    // "permitted" reads as though the diet were an indulgence.
    const permitted = snap.trial!.permittedFoods.filter((f) => f.feedings > 0 && f.role !== 'primary_diet')
    if (permitted.length > 0) {
      tallyParts.push(
        // A COUNT, and the one this file's own comment calls "what turns an allowed
        // list from a rule into evidence" — it sat one line under the already-scoped
        // antigen sentence, disagreeing with it about the same feedings.
        `<b>Permitted extras fed ${antigenScope}:</b> ${permitted
          .map((f) => `${h(f.label)} &times;${num(f.feedings)}`)
          .join(', ')} — on the allowed list, and counted here because the exposure is the animal&rsquo;s even when the compliance is not in question.`,
      )
    }
  }
  // D10 applied to the aggregate. A food whose ingredient list was never captured
  // contributes only the protein on the front of the pack, so the tally above is a
  // FLOOR, never a total — and a floor presented as a total is the same
  // reassurance-on-absence the per-food gate exists to stop, just harder to see. Same
  // framing the diet-trial spec's G2 ruling settled on: disclose the floor, never let
  // a low count read as a clean record.
  const incomplete = snap.proteinTimeline.incompleteFeedings
  if (tally && incomplete > 0) {
    tallyParts.push(
      `<b>A floor, not a total:</b> ${num(incomplete)} of ${num(
        snap.proteinTimeline.totalFeedings,
      )} off-diet feeding${snap.proteinTimeline.totalFeedings === 1 ? '' : 's'} involved a food whose ingredient panel was never captured (marked &ldquo;list not read&rdquo; below), so proteins beyond the one on the front of the pack would not appear in this tally.`,
    )
  }
  if (hasTrial && freeFedProteins.length) {
    // DON'T POINT AT A PARAGRAPH THAT ISN'T THERE. `tally` is empty when no exposure
    // was itemised, and this block is gated only on the free-fed set — so on the
    // refused-cat report the one sentence describing the trial's dominant confounder
    // referred to "the discrete tally above" with nothing above it (round 4).
    tallyParts.push(
      `<b>Free-fed alongside the trial:</b> ${freeFedProteins
        .map((p) => h(capProtein(p)))
        .join(', ')} (continuously available; intake not directly observed) — a competing antigen ${
        tally ? 'the discrete tally above' : 'no per-feeding count'
      } can capture.`,
    )
  }
  const tallyBit = tallyParts.length ? `<p class="note lead">${tallyParts.join(' ')}</p>` : ''

  // The `*` is only legible where the sheet defines it, which requires an active trial
  // with a resolvable target protein — see appendixBCD.
  const markOffTrial = snap.diet.trialTargetProtein != null
  const grouped = groupConfounders(conf)
  const rows = grouped.map((r) => confounderRowHtml(r, markOffTrial, trialDerived)).join('')
  // THE MARKER'S OWN BASE RATE, stated. The cold read's objection was not that the
  // caveat text was wrong — it is that a dagger firing on 3 of 4 rows, in a dog itching
  // on 16 of 46 days, carries no information while LOOKING like an implication with a
  // literature citation behind it. A marker whose density is disclosed can be discounted;
  // one whose density is hidden cannot.
  const daggerRows = grouped.filter((r) => r.symptomInChallengeWindow).length
  // THE MARKER'S OWN FIRE RATE, not the symptom-day rate. Round 5 fixed this from the
  // per-type maximum to the union of symptom days; round 6 showed the union is still
  // the wrong QUANTITY. The dagger fires when a symptom falls in the days AFTER a
  // feeding, so what discloses its discriminating power is the share of days on which
  // any feeding would have earned it — 83% on the dog artifact, against the 37%
  // symptom-day rate the footnote was printing. Understating it by half makes "it marks
  // 3 of 4 rows" read as a selective finding rather than a near-certainty, inside the
  // footnote that exists to say the opposite.
  const markerBaseRate = snap.trial?.challengeMarkerBaseRatePct ?? 0
  const daggerFootnote =
    trialDerived && daggerRows > 0
      ? `<p class="note"><b>&dagger;</b> a symptom was logged in the ${num(
          snap.trial!.challengeWindowDays,
        )} days after this feeding — the published time-to-flare window in ${h(
          speciesPlural(snap.signalment.species),
        )} (Olivry &amp; Mueller). <b>Timing only.</b> It is not an attribution: an unlogged exposure is always possible, so no pairing here can be exclusive, and same-day pairs are deliberately excluded. It marks ${num(
          daggerRows,
        )} of ${num(grouped.length)} row${grouped.length === 1 ? '' : 's'} here &mdash; but on this record <b>${num(
          markerBaseRate,
        )}% of days would have earned it</b>, so it distinguishes very little. The denser the symptom record, the less this marker means.</p>`
      : ''

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
  // EVERY CAPTION IS CHECKED AGAINST THE CODE BENEATH IT (§7's generalisable AC).
  // The pre-PR-7 trial caption claimed "Everything fed outside the trial diet" over a
  // computation that never consulted the trial — it listed the vet-permitted treat and
  // could not see a rival kibble at all. These three branches each describe exactly
  // what `confounderFeedings` did.
  const subtitle = trialDerived
    ? `Feedings ${
        antigenScope === 'during the trial' ? 'in the trial window' : antigenScope
      } that Culprit could not match to the trial diet or to a food on the allowed list. Each row names which check placed it here.`
    : hasTrial
      ? 'Everything fed outside the main diet in this window. <b>No allowed-food list is recorded for this trial</b>, so these feedings were not checked against it — they are treats and human food, not a contamination finding.'
      : 'Everything fed outside the main diet — the exposures most worth weighing against the symptom pattern.'
  const colspan = trialDerived ? 6 : 5
  // NOT "no off-diet exposures logged" under a trial: that is the negative claim §5.2
  // deletes from the product at every coverage, on every surface. The positive form is
  // about the RECORD, and it is gated — `mayClaimAllMatched` withholds it whenever the
  // module has computed a reason it is false.
  // B-531 — THE THIRD BRANCH IS A TRIAL REPORT TOO. `trialDerived` is false whenever
  // the allowed list is dark, but the trial is still on the page and G2 still binds:
  // "No off-diet exposures logged in this window" over a trial whose permit set never
  // hydrated is the banned negative claim, asserted about a check that never ran. Only
  // the genuinely trial-less report may speak about this window's treats at all — and
  // per R2 it does so under a heading that names them, not as an exposure verdict.
  const emptyRow = trialDerived
    ? snap.trial!.mayStateRecordClean
      // NAMES ITS RANGE UNCONDITIONALLY (B-600, adversarial pass 3). "In this window"
      // is the document's reserved idiom for the REPORT window, and this count is over
      // the trial's evidence range — which is narrower whenever the trial started after
      // the window opened or ended before it closed. Executed: 21 feedings May 23 –
      // Jun 12 read "every one of the 21 feedings logged in this window matched" on a
      // page whose §4 listed 40 chicken feedings Jun 13 – Jul 2, inside that same
      // window. The exact affirmative pass 2 ruled false on page 1, still standing in
      // the appendix a vet cross-checks page 1 against.
      //
      // NOT gated on `trialDaysOutsideRange`: pass 3's finding ③ is that the gate
      // measures how much of the TRIAL the scope cuts, not how much of the SCOPE the
      // trial fails to fill — and this sentence is false on the second, which the gate
      // reads as {0,0}. An affirmative that always states its own dates cannot be
      // carried past them, so it does not need a predicate.
      ? `Every one of the ${num(
          snap.trial!.exposures.totalFeedings,
        )} feedings logged ${h(
          fmtRange(snap.trial!.evidenceStartDate, snap.trial!.evidenceEndDate),
        )} matched the trial diet or a permitted food. This describes the record and is a floor, not a total.`
      : 'No feeding in this window is listed here. See the diet-trial block on page 1 before reading that as a clean elimination.'
    : hasTrial
      ? 'Nothing is listed here. This report has no allowed-food list for the trial, so no feeding has been checked against one &mdash; see the diet-trial block on page 1.'
      : 'No treats or table food are recorded in this window.'
  return `
  <p class="appx-title serif">Appendix C — ${
    trialDerived
      ? `Off-diet exposures ${antigenScope}`
      : hasTrial
        ? `Treats &amp; table food ${antigenScope}`
        : 'Treats &amp; table food'
  }</p>
  <p class="appx-sub">${subtitle} Repeated items are grouped (with a feeding count and date span); human food is listed feeding-by-feeding. Protein shows the full set read from the label, most prominent first; &ldquo;list not read&rdquo; marks a food whose ingredient panel was never captured, so its set may be incomplete.</p>
  ${tallyBit}
  <table>
    <caption>${
      // A BARE ZERO IS THE ONE EXPOSURE FIGURE THAT MUST NEVER STAND ALONE. Page 1
      // renders this exact case as "—" on purpose, and cold-read round 4 found the
      // appendix printing "0 off-diet exposures" three pages later — on the report
      // whose own trial block says food outside the allowed list was CONTINUOUSLY
      // AVAILABLE. Every other exposure figure in the document carries "a floor, not a
      // total"; the reassuring one had lost it. Under a trial the count is never
      // rendered bare, and a zero does not get to be a number at all.
      //
      // B-531 — "under a trial" means `hasTrial`, not `trialDerived`. A dark permit set
      // does not stop the report being a trial report, and "0 off-diet exposures" is the
      // more reassuring reading precisely BECAUSE nothing was checked. The noun also
      // follows the table: outside `trialDerived` these rows are the treat/human-food
      // heuristic, and calling them exposures is the caption-describes-the-wrong-set
      // defect §7 sent PR 7 to fix.
      trialDerived && conf.length === 0
        ? 'No exposure is listed here'
        : hasTrial && conf.length === 0
          ? 'No feeding is listed here'
          : `${num(conf.length)} ${trialDerived ? 'off-diet exposure' : 'treat or table-food feeding'}${
              conf.length === 1 ? '' : 's'
            }${breakdownBit}`
    } &middot; ${h(
    // EVIDENCE — this captions the exposure TABLE, whose rows come from the
    // evidence window. Off the coverage range the caption excluded rows in its
    // own table ("Jan 1 – Apr 22" over a row dated Apr 27), which is exactly the
    // cross-check a vet uses the appendix for.
    fmtRange(trialDerived ? snap.trial!.evidenceStartDate : snap.scope.startDate, trialDerived ? snap.trial!.evidenceEndDate : snap.scope.endDate),
  )}${trialDerived ? ' &middot; a floor, not a total' : ''}</caption>
    <thead><tr><th>Item</th><th style="width:92px">Category</th>${
      trialDerived ? '<th style="width:150px">Why it&rsquo;s here</th>' : ''
    }<th style="width:104px">Protein</th><th class="c" style="width:72px">Feedings</th><th style="width:118px">Dates</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="${colspan}">${emptyRow}</td></tr>`}</tbody>
  </table>
  ${daggerFootnote}`
}

function dietHistoryAppendix(snap: ReportSnapshot): string {
  const d = snap.diet
  // Window-scoped like every other medication view (page-1 dietMeds + appendix D both
  // filter on overlapsWindow) — the meds pull is deliberately unbounded for the
  // concurrent-change logic, so without this guard a supplement stopped years ago would
  // render here as a live entry while page 1 correctly omits it (code-review find).
  const supps = snap.medications.filter((m) => m.isSupplement && m.overlapsWindow)
  // "NONE RECORDED" IS ABOUT THE LOG, AND ON A TRIAL REPORT IT IS LOAD-BEARING (B-532,
  // cold-read finding). Appendix D goes to real trouble to say a medication's absence is not
  // evidence it was not given; these three rows carried no such caveat at the point of claim —
  // on the one report where the entire validity of the elimination rests on them. Worse, this
  // appendix's own sub-head says fields the app does not capture are marked "not recorded", so
  // the bare phrase could not be told apart from "treats aren't captured" (they are — the
  // well-logged artifact renders "65 this window"). The caveat is attached where the claim is,
  // not left to the page-1 blind-spot line four sheets away.
  const NOT_LOGGED = 'None recorded &mdash; nothing of this kind was logged in this window, which is not evidence none was fed.'
  const suppBit = supps.length
    ? supps.map((m) => `${h(m.drugName)} (started ${h(fmtDay(m.startedAt))})`).join('; ')
    : NOT_LOGGED
  const treatBit = d.treats.count
    ? `${num(d.treats.count)} this window (${num(d.treats.distinctItems)} distinct). Dates in appendix&nbsp;C.`
    : NOT_LOGGED
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
    : NOT_LOGGED
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
  const primaryDiet = d.trial
    ? `${d.trial.foodLabel ? h(d.trial.foodLabel) : 'Trial diet'}. Started ${h(fmtDayYear(d.trial.startedAt))}.${freeFedClause}`
    : d.freeFed.length
      ? `${freeFedNames} (free-choice &mdash; intake not directly observed).`
      : // No structured trial/arrangement to name here; the fed food still appears per-meal in the log
        // (and any refused-food note on page 1). Worded so it does not read as "diet unknown".
        'No diet trial or free-feeding arrangement recorded for this window; the fed diet appears per meal in the log.'
  // ── Proteins in the diet (B-351 slice 5, §9) ───────────────────────────────
  // THE reason this section exists. The first thing a vet does with a diet history in
  // a food-responsive workup is scan for protein OVERLAP — the marketing name on the
  // bag is clinically meaningless, and a "duck" diet that also lists chicken
  // invalidates the elimination trial. Before this, that scan required the owner to
  // bring the physical bags and the vet to read the panels in-room.
  //
  // One row per food the pet actually LIVES on (trial diet · free-fed bowls · foods
  // logged as meals), deduped by label, in that order — off-diet treats carry their
  // own set in appendix C's protein column, one row down the same sheet. Primary
  // bold, secondaries subordinate, D10 qualifier inline.
  const dietFoods: Array<{ label: string; role: string; set: ProteinSetView }> = []
  const seenFood = new Set<string>()
  const pushFood = (label: string | null, role: string, set: ProteinSetView): void => {
    const name = label?.trim() || null
    // No label means no row a vet could act on — the set still counts everywhere it is
    // aggregated, it just cannot be attributed to a named bag here.
    if (!name) return
    // The dedupe key includes the SET, not just the label. Duplicate library rows under
    // one label are a known live condition (B-009/B-018), and they can carry different
    // captured sets — one photo-extracted and complete, one manual and unread. A
    // label-only first-wins dedupe rendered the complete row's claim over both, so a
    // label a vet scans for protein overlap could carry an implied-complete set while
    // some of its feedings came from a row nobody read. Same rule appendix C already uses.
    const key = `${name.toLowerCase()}||${set.proteins.join(',')}|${set.complete ? 'c' : 'i'}`
    if (seenFood.has(key)) return
    seenFood.add(key)
    dietFoods.push({ label: name, role, set })
  }
  if (d.trial) pushFood(d.trial.foodLabel, 'trial diet', d.trial.proteinSet)
  for (const f of d.freeFed) pushFood(f.foodLabel, 'free-fed', f.proteinSet)
  for (const m of d.mealItems) pushFood(m.foodLabel, 'fed as meals', m.proteinSet)
  const proteinRows = dietFoods
    .map(
      (f) =>
        `<div class="ptrow"><span class="ptfood">${h(f.label)} <span class="rnote">(${h(
          f.role,
        )})</span></span><span class="ptset">${proteinSetPhrase(f.set, true)}</span></div>`,
    )
    .join('')
  const anyIncomplete = dietFoods.some((f) => !f.set.complete)
  const proteinsBit = proteinRows
    ? `${proteinRows}<p class="note">${PROTEIN_PROVENANCE_NOTE}${
        anyIncomplete
          ? ' Where the ingredient list was never captured, only the protein on the front of the pack is known &mdash; those foods may contain proteins not listed here.'
          : ''
      }</p>`
    : // Never "no proteins" — that is a claim about foods nobody read. Say what is true:
      // there is no named food to attribute a set to. The provenance note still rides
      // along, because appendix C on this same sheet renders label-derived sets whether
      // or not a named DIET food exists, and §9 condition 1 is "stated once", not
      // "stated only when the diet block happens to be populated".
      `No named diet food in this window to read a protein set from. <span class="rnote">${PROTEIN_PROVENANCE_NOTE}</span>`

  const condBit = snap.provenance.conditions.length
    ? snap.provenance.conditions.map((c) => `${h(c.name)} (${h(c.status)})`).join('; ')
    : 'None recorded.'
  const weightBit = snap.weight.isEmpty
    ? 'No home weigh-ins recorded. Body-condition score and caloric adequacy not assessed in this record.'
    : `${
        snap.weight.trend
          ? 'Weight trend on page&nbsp;1'
          : 'No weigh-in falls inside this window, so page&nbsp;1 shows no weight trend'
      }. Body-condition score and caloric adequacy not assessed in this record.`
  return `
  <p class="appx-title serif" style="margin-top:22px">Appendix B — Diet history</p>
  <p class="appx-sub">A picture of what ${h(snap.signalment.name)} is fed, in the spirit of the WSAVA Short Diet History Form. Fields the app does not yet capture are marked &ldquo;not recorded&rdquo; rather than guessed.</p>
  <table>
    <tbody>
      <tr><th style="width:180px">Primary diet</th><td>${primaryDiet}</td></tr>
      <tr><th>Proteins in the diet</th><td>${proteinsBit}</td></tr>
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
      } &middot; ${regimenDates(m)}</td><td class="c num">${logged}</td><td class="num">${doseDatesCell(
        m.doseDays,
      )}</td><td>${adherence}</td></tr>`
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
      )}</td><td class="num">${doseDatesCell(u.doseDays)}</td><td>${adherence}</td></tr>`
    })
    .join('')
  const rows = regimenRows + unlinkedRows
  const hasAny = meds.length > 0 || unlinked.length > 0
  // R2-6 — the preamble referenced a page-1 adherence line that does not exist on a no-meds report;
  // make it conditional so an empty Appendix D never points at a section that isn't there.
  //
  // AND THE ABSENCE IS NAMED, ON BOTH BRANCHES (B-532). "No prescription medications overlap
  // this window" is a statement about the LOG, and the cold read read it as a statement about
  // the animal — on a derm trial, where a course of an antipruritic the owner never entered in
  // Culprit is both the commonest confound and completely invisible to this page. The closing
  // legend does carry "Nothing is counted that the owner did not log", but that is three pages
  // away from the table that reads as a negative result, and the B-494 rule is that a report
  // teaching a reader to scan a zone may not let that zone's silence stand as a finding.
  const unloggedCaveat =
    ' <b>This lists only what the owner entered in Culprit.</b> A medication prescribed elsewhere and never logged does not appear here, and its absence is not evidence it was not given — worth confirming against the clinic record, particularly for anti-inflammatories and antipruritics, which suppress the signs a diet trial is measuring.'
  const sub = !hasAny
    ? `No prescription medication is recorded in this window. Over-the-counter supplements, if any, are listed in the diet history (appendix&nbsp;B).${unloggedCaveat}`
    : `Doses are owner-logged. The page-1 adherence line is computed from these entries; with no doses logged a drug reads &ldquo;adherence not tracked,&rdquo; never &ldquo;given.&rdquo; Doses logged without a configured regimen (including over-the-counter medications) appear as ad-hoc entries below; supplements taken as food are listed in the diet history (appendix&nbsp;B).${unloggedCaveat}`
  return `
  <p class="appx-title serif" style="margin-top:22px">Appendix D — Medication log</p>
  <p class="appx-sub">${sub}</p>
  <table>
    <thead><tr><th>Medication</th><th style="width:150px">Regimen</th><th class="c" style="width:74px">Doses logged</th><th style="width:132px">Dose dates</th><th>Adherence</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5">No prescription medication is recorded in this window.</td></tr>`}</tbody>
  </table>`
}

/**
 * The DATES an administered dose was logged — Appendix D's answer to "when?" (B-532).
 *
 * The table carried a dose COUNT and no dates at all, and on a derm trial that is the
 * difference between an answerable question and an unanswerable one: two doses of an
 * antipruritic in week 1 and two in week 6 produce the same "4" against symptom curves they
 * explain completely differently. The cold read asked for this column by name.
 *
 * Up to six distinct days are listed outright, because that is the shape a clinician can
 * actually line up against the chart. Past that the list stops being readable, so it degrades
 * to the span plus the day count — and says how many days it is covering, so the range is
 * never mistaken for continuous dosing. Never a bare "—" next to a non-zero count: an
 * administered dose always has a day.
 */
const DOSE_DATE_LIST_MAX = 6
function doseDatesCell(doseDays: readonly string[]): string {
  if (doseDays.length === 0) return '&mdash;'
  if (doseDays.length <= DOSE_DATE_LIST_MAX) return h(doseDays.map((d) => fmtDay(d)).join(', '))
  return `${h(fmtRange(doseDays[0], doseDays[doseDays.length - 1]))}<br/><span class="rnote">${num(
    doseDays.length,
  )} days with a dose</span>`
}

function appendixF(snap: ReportSnapshot): string {
  const hasSafety = snap.safetyFlags.length > 0
  const safetyDt = hasSafety
    ? // "a prescribed diet going uneaten" is named explicitly (B-494). The list here is what
      // teaches the reader what the zone covers, so a lane missing from it is a lane whose
      // silence the reader will misread as a negative result on exactly the patient it watches.
      `<dt>Safety flags</dt><dd>Shown only when present, above the fold. They escalate on the presence of a concern (chronicity, reduced intake, a prescribed diet going uneaten, possible blood/foreign, worsening) and are owner-reported, not a diagnosis. Absence of a flag is never shown as an &ldquo;all clear.&rdquo;</dd>`
    : // NOT "none were present in this window". The cold read lifted exactly that clause
      // off a report for an 8-year-old cat with 34 of 38 feedings refused and ~7% of body
      // weight lost in 18 days: one sentence that makes the all-clear claim and then
      // denies making it, and a skimmer reads the first half. Detector silence is not a
      // finding, so the legend states the RULE and stops.
      `<dt>Safety flags</dt><dd>Shown only when present, above the fold. Nothing is printed here when no flag fired &mdash; and that is <b>not</b> an &ldquo;all clear&rdquo;: it means no detector fired, which is not the same as nothing being wrong.</dd>`
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
      // ON THE SCOPE, NOT ON THE LIST'S LENGTH (B-532). The itemisation is no longer gated
      // on the reduced-intake flag, so a non-empty `intakeLog` no longer implies the page-1
      // "time since the last fully-eaten meal" line exists — and describing that line on a
      // report that does not carry it is the same dangling-reference defect B-599 is about,
      // re-entered through the legend.
      snap.provenance.intakeLogScope === 'intake_flag'
        ? ' When intake drops, page&nbsp;1 shows the time since the last <b>fully-eaten</b> meal (how long the pet has gone without a full meal), and the meals behind it are in appendix&nbsp;E (meals &amp; intake).'
        : snap.provenance.intakeLogScope === 'unfinished'
          ? ' Appendix&nbsp;E carries the intake recorded against every food, and lists each meal the owner did not record as fully eaten. A page-1 &ldquo;time since the last <b>fully-eaten</b> meal&rdquo; line appears only when a reduced-intake flag fired; its absence means no flag fired, not that intake was normal.'
          : snap.diet.mealItems.length > 0
          ? // The same defect as the safety-flag entry, on the one axis where it is
            // worst: "none was raised in this window" told a cold reader the app had
            // examined intake and found nothing, on a cat refusing nearly every bowl.
            // Intake is not preference — refusal is frequently a disease signal — so the
            // legend may state what the line DEPENDS ON and must not certify its absence.
            ' The meals the owner logged are itemised in appendix&nbsp;E (meals &amp; intake). A page-1 &ldquo;time since the last <b>fully-eaten</b> meal&rdquo; line appears only when a reduced-intake flag fired; its absence means no flag fired, not that intake was normal &mdash; read the logged ratings in appendix&nbsp;E.'
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
  ${dietTrialSection(snap)}
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
  /* The active problem list, beside the signalment (B-532). Same weight as the rest of the
     identity block — it is history a clinician reads before the numbers, not an alert. */
  .ident .cond{font-size:12px;color:var(--muted);margin-top:3px;}
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
  /* An unobserved week (B-532): HOLLOW, so it reads as "no data" and can never be mistaken for
     the solid nub that means a measured zero. Shape + fill, never colour — §5.8 requires this
     page to survive a black-and-white print, which is how most vets will read it. */
  svg .nolog{fill:none;stroke:var(--nub);stroke-width:1;stroke-dasharray:2 2;}
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
  /* Appendix B "Proteins in the diet" — one row per food, food name left, set right.
     Two columns so a vet scanning for protein overlap reads down a single aligned
     edge instead of hunting the set inside prose (§9 condition 2). */
  .ptrow{display:flex;gap:10px;align-items:baseline;padding:1px 0;}
  .ptrow .ptfood{flex:0 0 46%;}
  .ptrow .ptset{flex:1 1 auto;}
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
