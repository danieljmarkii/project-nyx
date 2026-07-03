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
//   §5.5  Frequency over severity — the symptom read is frequency; severity is shown
//         per-event in appendix A, BLANK when unrated, and NEVER averaged (there is
//         no average-severity number anywhere in this file, by design).
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
  CorrelationSummary,
  ConcurrentChange,
  SymptomLogEntry,
  IntakeLogEntry,
  ConfounderExposure,
  ScopeInfo,
  Signalment,
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
const GRAY_RAMP = ['#1a1c22', '#3d4048', '#5f636c', '#82868e', '#a7abb2', '#c7c9ce']

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

  // Intervention markers (dashed verticals + a short date at the top of each).
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
    parts.push(`<text class="ann" x="${lx.toFixed(1)}" y="11" text-anchor="${anchor}">▲ ${h(fmtDay(m.startDate))}</text>`)
  }

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

  // X-axis date anchors: first bucket start, window end.
  const firstDate = sym.bucketStartDates[0] ?? null
  parts.push(`<text class="xl" x="${L + 4}" y="136">${h(fmtDay(firstDate))}</text>`)
  parts.push(`<text class="xl" x="${R - 8}" y="136" text-anchor="end">${h(fmtDay(windowEndDate))}</text>`)

  const aria = `${symptomLabel(sym.type)} episodes per week: ${buckets.join(', ')}.`
  return `<svg viewBox="0 0 648 150" role="img" aria-label="${h(aria)}">${parts.join('')}</svg>`
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

function letterhead(snap: ReportSnapshot): string {
  return `
  <div class="letter">
    <div class="brand">
      <span class="wordmark">Nyx</span>
      <span class="kind">Owner-reported<br/>pet-health summary</span>
    </div>
    <div class="stamp">
      <div><b>Prepared for veterinary review</b></div>
      <div>Not a diagnosis · owner-reported observations</div>
      <div>Generated ${h(fmtDayYear(localDayKeyOf(snap.generatedAt, snap.timezone)))}</div>
    </div>
  </div>
  <div class="rule-brand"></div>`
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
  const ageBit =
    s.ageYears === null
      ? 'age not recorded'
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
    <div class="h">${warnIcon} Safety — flags for review <span class="sub">owner-reported · not a diagnosis</span></div>
    ${rows}
  </div>`
}

function flagRow(tag: string, body: string): string {
  return `<div class="flag"><div class="tag">${h(tag)}</div><div class="body">${body}</div></div>`
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
        `<b>${num(n)} vomiting incident${n === 1 ? '' : 's'} (${h(dates)})</b> ${
          n === 1 ? 'has' : 'have'
        } a photo Nyx flagged as ${h(kindPhrase)}. This is an AI read of an owner photo — owner-reviewable and not confirmed. Shown because it is present; a photo cannot exclude bleeding.`,
      )
    }
    case 'present_foreign': {
      const n = f.incidents.length
      const notes = f.incidents.map((i) => i.note).filter((x): x is string => !!x)
      const noteBit = notes.length ? ` Owner/AI note: ${h(notes[0])}.` : ''
      const dates = f.incidents.map((i) => fmtLocalDay(i.occurredAt, tz)).join(', ')
      return flagRow(
        'Foreign material',
        `<b>${num(n)} vomiting incident${n === 1 ? '' : 's'} (${h(dates)})</b> ${
          n === 1 ? 'has' : 'have'
        } a photo Nyx flagged as possible foreign material.${noteBit} AI read of an owner photo — owner-reviewable, not confirmed.`,
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
        snap.provenance.intakeLog.length > 0 ? ' Meal-by-meal detail in the recent-meals appendix.' : ''
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
      return flagRow(
        'Chronicity',
        `<b>${h(symptomLabel(f.symptomType))} has been ongoing ${num(f.spanDays)} day${
          f.spanDays === 1 ? '' : 's'
        }</b> (first noted ~${h(fmtLocalDay(f.firstOnsetIso, tz))}): ${num(f.episodeCount)} episodes across ${num(
          f.activeWeeks,
        )} week${
          f.activeWeeks === 1 ? '' : 's'
        }, on ${num(f.symptomDays)} day${f.symptomDays === 1 ? '' : 's'}; most recent ${num(
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
    <span class="l">A weight trend is a useful GI bellwether; the owner can log weigh-ins in Nyx. No value is shown here rather than reuse an undated onboarding figure.</span></div>
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
  if (snap.diet.activeTrial && ag.trialDaysLogged !== null) {
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
    tiles.push(tile('—', '', `A normally-eaten food was refused<br/>a health signal — see safety band`))
  } else {
    tiles.push(tile('—', '', `No rated meals in this window`))
  }

  // Tile 3 — weight (trend delta / single / empty), per §3.4.
  if (snap.weight.isEmpty) {
    tiles.push(tile('—', '', `Weight<br/>no weigh-ins yet — a useful trend to log`))
  } else if (snap.weight.trend && snap.weight.trend.readingCount >= 2 && snap.weight.trend.deltaKg !== null) {
    const d = snap.weight.trend.deltaKg
    const sign = d > 0 ? '+' : ''
    tiles.push(
      tile(
        `${sign}${d.toFixed(1)}`,
        `<small>&nbsp;kg</small>`,
        // Descriptive, but NEVER reassuring — a loss is the danger direction (B-186 guardrail).
        `Weight over ${snap.weight.trend.readingCount} weigh-ins<br/>home-scale trajectory (descriptive)`,
      ),
    )
  } else {
    const kg = snap.weight.latest?.kg ?? snap.weight.trend?.latestKg ?? null
    tiles.push(
      kg === null
        ? tile('—', '', `Weight<br/>no reading in this window`)
        : tile(`${kg.toFixed(1)}`, `<small>&nbsp;kg</small>`, `Latest weigh-in<br/>single reading — no trend yet`),
    )
  }

  // Tile 4 — logging coverage.
  tiles.push(
    tile(
      `${ag.loggedDays}`,
      `<small>&nbsp;/&nbsp;${ag.windowDays}</small>`,
      `Days with any log<br/>gaps could mask events`,
    ),
  )

  return `
  <div class="sec">
    <h2>At a glance <span class="aside">counts over the ${num(ag.windowDays)}-day window</span></h2>
    <div class="tiles">${tiles.join('')}</div>
  </div>`
}

function tile(value: string, small: string, label: string): string {
  return `<div class="tile"><div class="v num">${h(value)}${small}</div><div class="l">${label}</div></div>`
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
  return `
  <div class="sec">
    <h2>Symptom frequency &amp; trend <span class="aside">weekly episodes · read by frequency, not severity</span></h2>
    ${panels}
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
    deltaHtml = `<div class="delta">first ${num(firstDays)}&nbsp;d <b class="num">${firstCount}</b> &rarr; last ${num(
      lastDays,
    )}&nbsp;d <b class="num">${lastCount}</b></div>`
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
      Read the trend by frequency of episodes across the window, not by any single event's severity (severity is per-event in appendix&nbsp;A and is never averaged).${gapBit}</div>`
  }

  // Each intervention is timed honestly: "started <date>" when it began in-window (it also
  // carries a dashed chart marker), "ongoing since <date>" when it began BEFORE the window and
  // ran through it — a standing confounder with no start point to mark but every bit as able to
  // confound the trend (adversarial finding A1). "overlaps this window" is the honest umbrella:
  // a standing steroid did not "change" during the window, but its presence still forbids
  // crediting the diet.
  const list = changes
    .map(
      (c) =>
        `${changeLabel(c)} (${c.ongoing ? `ongoing since ${h(fmtDay(c.startDate))}` : `started ${h(fmtDay(c.startDate))}`})`,
    )
    .join('; ')
  const plural = changes.length > 1
  const lead = plural
    ? `<b>${num(changes.length)} interventions overlap this window:</b> ${list}.`
    : `<b>One intervention overlaps this window:</b> ${list}.`
  const caution = plural
    ? ' A change in signs over this period <b>cannot be attributed to any one of them alone</b> — they overlap in time.'
    : ' A change in signs over this period <b>cannot be attributed to the diet alone</b> while this intervention overlaps it.'
  return `
    <div class="callout">
      <span class="k">Reading the trend</span>
      ${lead}${caution}${gapBit}</div>`
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
        const light = i >= 4
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
    sideHtml = `
      <div class="limit">
        <span class="h">Blood &amp; foreign material</span>
        <b>Not seen</b> in the legible photos. This is <b>not</b> a clearance — a photo cannot exclude bleeding, digested (coffee-ground) blood photographs poorly, and these are AI reads. If blood or foreign material <b>is</b> seen in any incident, that incident leads the safety band at the top of the report.
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
        ${lines.join('<br/>')}<br/>Shown because present — owner-reviewable, not confirmed. ${
      blood.length > 0 || foreign.length > 0 ? 'These lead the safety band above.' : ''
    }
      </div>`
  }

  return `
  <div class="sec">
    <h2>Vomit characteristics <span class="aitag">Nyx photo analysis · owner-reviewable</span></h2>
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
  const feedBits: string[] = []
  if (d.mealCompletion) {
    feedBits.push(
      `${num(d.mealCompletion.finishedMeals)} of ${num(
        d.mealCompletion.ratedMeals,
      )} rated meals fully eaten (owner-observed; treats + free-fed excluded).`,
    )
  }
  if (d.freeFed.length > 0) {
    const labels = d.freeFed.map((f) => (f.foodLabel ? h(f.foodLabel) : 'free-fed food')).join(', ')
    // §4 / B-040 — the verbatim string, non-negotiable.
    feedBits.push(`Free-fed: ${labels}. <b>Intake not directly observed.</b>`)
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
    offBits.push(`${num(d.treats.count)} treat${d.treats.count === 1 ? '' : 's'} (${num(d.treats.distinctItems)} distinct). Dates in appendix&nbsp;B.`)
  }
  if (offBits.length === 0) offBits.push('None logged in this window.')
  left.push(kv('Off-diet', offBits.join(' ')))

  // Medications (B-117) + supplements as concurrent interventions.
  const meds = snap.medications.filter((m) => m.overlapsWindow && !m.isSupplement)
  const supps = snap.medications.filter((m) => m.overlapsWindow && m.isSupplement)
  if (meds.length === 0 && supps.length === 0) {
    right.push(kv('Medication', 'None logged in this window.'))
  }
  for (const m of meds) {
    right.push(kv(h(m.drugName), medicationLine(m)))
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
        )} (owner-reported, OTC) — a concurrent intervention over this window.`,
      ),
    )
  }

  // Timing vs symptoms (associational; §3.8).
  right.push(kv('Timing vs symptoms', timingLine(snap.correlation, snap)))

  return `
  <div class="sec">
    <h2>Diet, feeding, medications &amp; supplements</h2>
    <div class="cols2">
      <div>${left.join('')}</div>
      <div>${right.join('')}</div>
    </div>
    <p class="ref">Full diet history, off-diet exposures, event log &amp; medication log: appendices A&ndash;D.</p>
  </div>`
}

function kv(k: string, v: string): string {
  return `<div class="kv"><span class="k">${k}</span><span>${v}</span></div>`
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
    `since ${fmtDay(m.startedAt)}`,
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

function timingLine(c: CorrelationSummary, snap: ReportSnapshot): string {
  if (c.hasEstablished && c.established.length > 0) {
    const e = c.established[0]
    return `${h(e.protein)} reached the established association threshold for ${h(
      symptomLabel(e.symptomType).toLowerCase(),
    )} over this window (${num(e.caseExposed)}/${num(e.matchedPairs)} exposed cases vs ${num(
      e.controlExposed,
    )} controls; p&nbsp;=&nbsp;${e.pValue.toFixed(3)}). An association, <b>not a proven cause</b>. Detail in appendix&nbsp;B.`
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
  return `<b>No single food/protein reached the established correlation threshold</b> over this window${staple}.${timingBit} Detail in appendix&nbsp;B.`
}

// ── Footer (per page/section) ────────────────────────────────────────────────────

function footer(snap: ReportSnapshot, sectionLabel: string): string {
  const owner = snap.signalment.ownerName ? ` (${h(snap.signalment.ownerName)})` : ''
  return `
  <div class="foot">
    <div class="fbrand">
      <div class="fw">
        <span class="w">Nyx</span>
        <div class="scan">${h(snap.signalment.name)}${owner} &middot; owner-reported observations &middot; associational, not a diagnosis.</div>
      </div>
    </div>
    <div class="pg">${h(fmtRange(snap.scope.startDate, snap.scope.endDate))}<br/>${h(sectionLabel)}</div>
  </div>`
}

// ── Appendices ────────────────────────────────────────────────────────────────────

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
  <p class="appx-title serif">Appendix A — Symptom event log</p>
  <p class="appx-sub">Every symptom event in the window, in order. &ldquo;Occurred&rdquo; is the owner's best account of when it happened; for events found later it is a time range, not the time it was noticed.${estBit} Severity is owner-reported (1&ndash;5), blank when the owner did not rate it, and is <b>never averaged</b> anywhere in this report. For photographed vomiting events the Nyx photo-analysis fields are shown beneath the note (owner-reviewable).</p>
  <table>
    <caption>${num(count)} symptom event${count === 1 ? '' : 's'} &middot; ${h(fmtRange(snap.scope.startDate, snap.scope.endDate))}</caption>
    <thead>
      <tr>
        <th style="width:64px">Date</th>
        <th>Type</th>
        <th style="width:140px">Occurred (owner-reported)</th>
        <th style="width:58px">Logged</th>
        <th class="c" style="width:60px">Severity</th>
        <th>Owner note &amp; photo findings</th>
      </tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="6">No symptom events in this window.</td></tr>`}</tbody>
  </table>
  <p class="note" style="margin-top:9px"><b>Why a range and not a time:</b> a vomit found at 07:44 but occurring around 04:00 changes the interval from the prior meal from minutes to hours — a clinically different picture. Where the owner did not witness the event, the window it occurred in is shown, not the time it was noticed. Photo findings are Nyx's read of the owner's photo, owner-reviewable; they never carry a diagnosis or a single-incident verdict (that stays in the app, off this report).</p>
  ${footer(snap, 'Appendix A — event log')}
</section>`
}

function symptomLogRow(e: SymptomLogEntry, tz: string | null): string {
  const dateCell = fmtLocalDay(e.occurredAt, tz)
  const occCell = occurredCell(e, tz)
  const loggedCell = fmtLocalTime(e.loggedAt, tz)
  const sevCell = e.severity === null ? '—' : `${num(`${e.severity}/5`)}`
  const dup = e.dupCount > 1 ? ` <span class="conf">${e.dupCount} logs</span>` : ''
  let noteCell = e.notes ? h(e.notes) : ''
  const ph = e.phenotype
  if (ph) {
    if (ph.status === 'completed') {
      const bits = [
        ph.colour ? `colour ${h(ph.colour)}` : null,
        ph.contentsCategory ? `contents ${h(contentsLabel(ph.contentsCategory).toLowerCase())}` : null,
        ph.consistency ? `consistency ${h(ph.consistency.replace(/_/g, ' '))}` : null,
        // PRESENT-only (§5.9): render blood/foreign ONLY when present; silence otherwise.
        ph.bloodPresent ? `<b>blood ${ph.bloodPresent === 'fresh_red' ? 'possible fresh red' : 'possible coffee-ground'} (AI, unconfirmed)</b>` : null,
        ph.foreignPresent ? `<b>foreign material possible (AI, unconfirmed)${ph.foreignNote ? ` — ${h(ph.foreignNote)}` : ''}</b>` : null,
      ].filter(Boolean)
      noteCell += `<span class="fields"><b>Photo:</b> ${bits.join(' &middot; ')}</span>`
    } else {
      const stateWord =
        ph.status === 'failed' ? 'present but not legible' : ph.status === 'uncertain' ? 'read uncertain' : 'still processing'
      noteCell += `<span class="fields"><b>Photo:</b> ${h(stateWord)} — not counted as an assessed read</span>`
    }
  }
  return `<tr><td class="num">${h(dateCell)}</td><td>${h(symptomLabel(e.type))}</td><td>${occCell}${dup}</td><td class="num">${h(
    loggedCell,
  )}</td><td class="c num">${sevCell}</td><td>${noteCell || '&mdash;'}</td></tr>`
}

/** B-010 occurred cell — witnessed=exact+seen, estimated=~time+est, window=range+range. */
function occurredCell(e: SymptomLogEntry, tz: string | null): string {
  const conf = e.occurredAtConfidence
  if (conf === 'window' && e.occurredAtEarliest && e.occurredAtLatest) {
    return `${num(`~${fmtLocalTime(e.occurredAtEarliest, tz)}–${fmtLocalTime(e.occurredAtLatest, tz)}`)} <span class="conf">range</span>`
  }
  if (conf === 'estimated') {
    return `${num(`~${fmtLocalTime(e.occurredAt, tz)}`)} <span class="conf">est</span>`
  }
  if (conf === 'witnessed') {
    return `${num(fmtLocalTime(e.occurredAt, tz))} <span class="conf">seen</span>`
  }
  // null / unknown confidence — a bare point time, no false-precision tag.
  return `${num(fmtLocalTime(e.occurredAt, tz))}`
}

/**
 * Recent-meals intake appendix (B-213) — renders ONLY when the intake log is populated (i.e.
 * an intake-decline flag fired). The traceability the cold-read asked for: the page-1 intake
 * figures (baseline, decline, "how long off food") trace here, meal by meal. Most-recent-first,
 * so the recent decline + the last full meal lead; the last fully-eaten meal is tagged so the
 * page-1 "last full meal" number has an unambiguous home. Escalate-only voice: a declined meal
 * is a possible health signal, NEVER "picky"; free-fed food is unobserved and never appears.
 */
function intakeAppendix(snap: ReportSnapshot): string {
  const log: IntakeLogEntry[] = snap.provenance.intakeLog
  if (log.length === 0) return ''
  const hidden = snap.provenance.intakeLogHiddenOlder
  // A row flagged `pinned` is the last-full-meal anchor pulled back in past the most-recent cap;
  // draw an explicit "omitted" break before it so it never reads as contiguous with the recent
  // rows. The tag itself is report-computed (isLastFullMeal), so it always matches the page-1
  // anchor even when that meal predates the shown window (adversarial finding).
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
<section class="page">
  <p class="appx-title serif">Appendix — Recent meals &amp; intake</p>
  <p class="appx-sub">The rated meals behind the reduced-intake flag on page&nbsp;1, most recent first. &ldquo;Intake&rdquo; is what the owner recorded after each meal; a declined or barely-touched meal is recorded as a possible health signal, never &ldquo;picky.&rdquo; Free-fed food is not directly observed and is not rated, so it does not appear here.${hiddenBit}</p>
  <table>
    <caption>${num(log.length)} rated meal${log.length === 1 ? '' : 's'} &middot; ${h(
    fmtRange(snap.scope.startDate, snap.scope.endDate),
  )}</caption>
    <thead><tr><th style="width:64px">Date</th><th style="width:58px">Time</th><th>Food</th><th style="width:150px">Intake</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="note" style="margin-top:9px"><b>Reading this:</b> ${anchorSentence}. Absence of a full meal is not evidence the pet ate nothing — only that no fully-eaten meal was recorded.</p>
  ${footer(snap, 'Appendix — recent meals')}
</section>`
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

function appendixBCD(snap: ReportSnapshot): string {
  return `
<section class="page">
  ${appendixB(snap)}
  ${appendixC(snap)}
  ${appendixD(snap)}
  ${footer(snap, 'Appendices B–D — exposures, diet &amp; meds')}
</section>`
}

function appendixB(snap: ReportSnapshot): string {
  const conf: ConfounderExposure[] = snap.provenance.confounders
  const hasTrial = !!snap.diet.activeTrial
  const rows = conf
    .map(
      (c) =>
        // human_food-first, to agree with the page-1 lines and the confounder de-dup (A3): a
        // table-scrap logged as both a treat and human food is ONE "Human food" row here too.
        `<tr><td class="num">${h(fmtLocalDay(c.occurredAt, snap.timezone))}</td><td>${
          c.format === 'human_food' ? 'Human food' : c.foodType === 'treat' ? 'Treat' : 'Off-diet'
        }</td><td>${c.foodLabel ? h(c.foodLabel) : '&mdash;'}</td><td>${c.primaryProtein ? h(c.primaryProtein) : ''}${
          c.note ? ` ${h(c.note)}` : ''
        }</td></tr>`,
    )
    .join('')
  const tally = Object.entries(snap.provenance.proteinExposureTally)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([p, n]) => `${h(p)} &times;${n}`)
    .join(', ')
  // A continuously-available free-fed competing protein is the biggest breach of an elimination
  // trial, but it is not a discrete meal event so it never enters the count-based tally
  // (adversarial finding A2). Name it explicitly alongside — as a standing exposure, never a
  // fabricated "×N". Only when a trial exists: for a no-trial pet the free-fed food IS the diet
  // (appendix C), not an off-diet confounder.
  const freeFedProteins = [
    ...new Set(snap.diet.freeFed.map((f) => f.primaryProtein).filter((p): p is string => !!p)),
  ]
  const tallyParts: string[] = []
  if (tally) {
    tallyParts.push(
      `<b>Protein exposures (off-diet):</b> ${tally}${
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
  const tallyBit = tallyParts.length ? `<p class="note">${tallyParts.join(' ')}</p>` : ''
  return `
  <p class="appx-title serif">Appendix B — Off-diet exposures (confounders)</p>
  <p class="appx-sub">${
    hasTrial
      ? 'Everything fed outside the trial diet, because these are the most common reasons a diet trial reads as &ldquo;not working.&rdquo;'
      : 'Everything fed outside the main diet — the exposures most worth weighing against the symptom pattern.'
  }</p>
  <table>
    <caption>${num(conf.length)} off-diet exposure${conf.length === 1 ? '' : 's'} &middot; ${h(
    fmtRange(snap.scope.startDate, snap.scope.endDate),
  )}</caption>
    <thead><tr><th style="width:64px">Date</th><th style="width:96px">Category</th><th>Item</th><th>Note</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4">No off-diet exposures logged in this window.</td></tr>`}</tbody>
  </table>
  ${tallyBit}`
}

function appendixC(snap: ReportSnapshot): string {
  const d = snap.diet
  const supps = snap.medications.filter((m) => m.isSupplement)
  const suppBit = supps.length
    ? supps.map((m) => `${h(m.drugName)} (started ${h(fmtDay(m.startedAt))})`).join('; ')
    : 'None recorded.'
  const treatBit = d.treats.count
    ? `${num(d.treats.count)} this window (${num(d.treats.distinctItems)} distinct). Dates in appendix&nbsp;B.`
    : 'None recorded.'
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
  <p class="appx-title serif" style="margin-top:22px">Appendix C — Diet history</p>
  <p class="appx-sub">A picture of what ${h(snap.signalment.name)} is fed, in the spirit of the WSAVA Short Diet History Form. Fields the app does not yet capture are marked &ldquo;not recorded&rdquo; rather than guessed.</p>
  <table>
    <tbody>
      <tr><th style="width:180px">Primary diet</th><td>${primaryDiet}</td></tr>
      <tr><th>Previous diet</th><td>Not recorded.</td></tr>
      <tr><th>Amount &amp; schedule</th><td>Not recorded in structured form (per-meal quantities are owner-entered free text; see appendix&nbsp;A).</td></tr>
      <tr><th>Treats</th><td>${treatBit}</td></tr>
      <tr><th>Human food</th><td>${humanBit}</td></tr>
      <tr><th>Supplements</th><td>${suppBit}</td></tr>
      <tr><th>Active conditions</th><td>${condBit}</td></tr>
      <tr><th>Nutritional status</th><td>${weightBit}</td></tr>
    </tbody>
  </table>`
}

function appendixD(snap: ReportSnapshot): string {
  const meds = snap.medications.filter((m) => !m.isSupplement && m.overlapsWindow)
  const rows = meds
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
      } (since ${h(fmtDay(m.startedAt))})</td><td class="c num">${logged}</td><td>${adherence}</td></tr>`
    })
    .join('')
  return `
  <p class="appx-title serif" style="margin-top:22px">Appendix D — Medication log</p>
  <p class="appx-sub">Doses are owner-logged. The page-1 adherence line is computed from these entries; with no doses logged a drug reads &ldquo;adherence not tracked,&rdquo; never &ldquo;given.&rdquo; Over-the-counter supplements are listed in appendix&nbsp;C.</p>
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
  return `
<section class="page">
  <p class="appx-title serif">Appendix F — How to read this report</p>
  <dl class="legend">
    ${safetyDt}
    <dt>Owner-reported</dt><dd>Every entry was logged by the owner on a phone. This is a record of what the owner observed, not a clinical examination, and contains no diagnosis or treatment recommendation.</dd>
    <dt>Range</dt><dd>Scoped to ${h(scopeBasisLabel(snap.scope).toLowerCase())} (${h(fmtRange(snap.scope.startDate, snap.scope.endDate))}). A custom (hand-picked) window discloses the count of symptom events that fall outside it, so nothing is cropped to a good week.</dd>
    <dt>Denominators</dt><dd>Counts are shown over their window and the days logged, so a count is never read without knowing how long and how completely it was tracked.</dd>
    <dt>Severity</dt><dd>Owner-reported on a 1&ndash;5 scale, per event in appendix&nbsp;A, blank when unrated. It is intentionally never averaged into a headline figure; trend is read from frequency.</dd>
    <dt>Time confidence</dt><dd><span class="conf">seen</span> witnessed (exact time) &middot; <span class="conf">est</span> an estimated time &middot; <span class="conf">range</span> found later; the window it occurred in is shown, not the time it was noticed.</dd>
    <dt>Photo analysis</dt><dd>For photographed incidents, Nyx reads structured fields from the photo (colour, contents, blood, foreign material). These are owner-reviewable and aggregated over the incidents with a legible read. They never carry a diagnosis or a single-incident verdict, and a clear photo is never an all-clear.</dd>
    <dt>Blood &amp; foreign material</dt><dd>Reported <b>only when seen</b> in an incident — never as a &ldquo;0 of N&rdquo; count, because absence in a photo cannot exclude bleeding (digested blood photographs poorly) and these are AI reads. A flagged incident leads the safety band.</dd>
    <dt>Weight</dt><dd>Owner home-scale weigh-ins, shown as a trend rather than a single point. Descriptive context, never a diagnosis or an alarm; body condition is not assessed here.</dd>
    <dt>Intake</dt><dd>Where the owner logs meals, a declined or barely-touched meal is recorded as a possible health signal — never &ldquo;picky.&rdquo; When intake drops, page&nbsp;1 shows the time since the last <b>fully-eaten</b> meal (how long the pet has gone without a full meal), and the recent rated meals are listed in the recent-meals appendix. For free-fed food, intake is <b>not directly observed</b>; absence of a meal log is not read as &ldquo;didn't eat.&rdquo;</dd>
    <dt>Associations</dt><dd>Any timing relationship is reported as co-occurrence with counts for the clinician to weigh. Nothing in this report asserts that a food caused a symptom.</dd>
    <dt>Deleted entries</dt><dd>Entries the owner deleted are excluded. The symptom counts on page&nbsp;1 (including loose stools) trace line-by-line to appendix&nbsp;A and the off-diet exposures to appendix&nbsp;B; medication, diet, weight and normal-stool figures summarize the owner's logs for those items rather than itemising each one. Nothing is counted that the owner did not log.</dd>
  </dl>
  ${footer(snap, 'Appendix F — how to read')}
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
  ${vomitCharacteristics(snap)}
  ${stoolCharacteristics(snap)}
  ${dietMeds(snap)}
  ${footer(snap, 'Clinical summary')}
</section>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="referrer" content="no-referrer" />
<title>${title}</title>
<style>${STYLE}</style>
</head>
<body>
${page1}
${appendixA(snap)}
${intakeAppendix(snap)}
${appendixBCD(snap)}
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
  .brand{display:flex;align-items:baseline;gap:10px;}
  .wordmark{font-family:"Newsreader",Georgia,serif;font-weight:600;font-size:27px;letter-spacing:.005em;color:var(--brand);line-height:1;}
  .brand .kind{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);font-weight:600;padding-bottom:2px;}
  .letter .stamp{text-align:right;font-size:11px;line-height:1.55;color:var(--muted);}
  .letter .stamp b{color:var(--ink);font-weight:600;}
  .rule-brand{height:2px;background:var(--brand);margin:9px 0 0;border-radius:2px;opacity:.9;-webkit-print-color-adjust:exact;print-color-adjust:exact;}

  /* Signalment + range */
  .ident{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-top:14px;}
  .ident .name{font-size:23px;font-weight:700;letter-spacing:.005em;line-height:1.05;}
  .ident .sig{font-size:12.5px;color:#25272d;margin-top:3px;}
  .ident .wt{font-size:12px;color:var(--muted);margin-top:2px;}
  .rangebox{flex:0 0 auto;text-align:right;border:1px solid var(--hair);border-radius:8px;padding:8px 12px;min-width:190px;background:#fcfcfd;}
  .rangebox .win{font-size:14px;font-weight:700;letter-spacing:.005em;}
  .rangebox .days{font-size:11.5px;color:var(--muted);margin-top:1px;}
  .rangebox .basis{display:inline-block;margin-top:6px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);border:1px solid var(--hair);border-radius:999px;padding:2px 9px;background:#fff;}
  .cherry{margin-top:9px;border:1px solid var(--hair);border-left:3px solid var(--ink);border-radius:0 7px 7px 0;padding:7px 11px;font-size:11.5px;background:#fcfcfd;}

  /* Safety band — leads the page. Mono-prominent: heavy border + weight, never colour. */
  .safetyband{border:2px solid var(--ink);border-radius:9px;padding:10px 14px 6px;margin-top:14px;}
  .safetyband > .h{font-size:10px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--ink);display:flex;align-items:center;gap:8px;padding-bottom:7px;border-bottom:1.5px solid var(--ink);}
  .safetyband > .h svg{width:16px;height:16px;flex:0 0 auto;}
  .safetyband > .h .sub{margin-left:auto;font-weight:500;letter-spacing:0;text-transform:none;font-size:10px;color:var(--muted);}
  .safetyband .flag{display:flex;gap:11px;padding:8px 0;font-size:12.5px;line-height:1.45;}
  .safetyband .flag + .flag{border-top:1px solid var(--hair);}
  .safetyband .flag .tag{flex:0 0 66px;font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--ink);border:1.5px solid var(--ink);border-radius:4px;padding:3px 0;text-align:center;height:max-content;}
  .safetyband .flag .body b{font-weight:700;}

  .headline{margin-top:14px;font-size:14.5px;line-height:1.45;border-left:3px solid var(--ink);padding:2px 0 2px 12px;}
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

  /* Sections */
  .sec{margin-top:13px;}
  .sec > h2{font-size:10.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);margin:0 0 9px;padding-bottom:5px;border-bottom:1px solid var(--hair);display:flex;justify-content:space-between;align-items:baseline;gap:12px;}
  .sec > h2 .aside{font-weight:500;letter-spacing:0;text-transform:none;font-size:10.5px;color:var(--faint);}
  .note{font-size:11.5px;color:var(--muted);margin:6px 0 0;}
  .note b{color:var(--ink);}
  .ref{font-size:11px;color:var(--faint);font-style:italic;margin:6px 0 0;}
  .empty{font-size:12px;color:var(--muted);border:1px dashed var(--hair);border-radius:8px;padding:11px 13px;background:#fcfcfd;}

  /* Stat tiles */
  .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
  .tile{border:1px solid var(--hair);border-radius:9px;padding:11px 12px;background:#fcfcfd;}
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
  .trend .big .n{font-size:26px;font-weight:600;letter-spacing:-.01em;}
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
  .aitag{font-weight:500;letter-spacing:0;text-transform:none;font-size:10px;color:var(--muted);border:1px solid var(--hair);border-radius:999px;padding:1px 8px;white-space:nowrap;}
  .pheno{display:grid;grid-template-columns:1.35fr 1fr;gap:16px;align-items:start;}
  .barmix{display:flex;height:34px;border-radius:6px;overflow:hidden;background:#fff;border:1px solid var(--hair);}
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
  .conf{font-size:9.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);border:1px solid var(--hair);border-radius:3px;padding:0 4px;white-space:nowrap;}
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

  @media print{
    body{background:#fff;font-size:10.4pt;}
    .no-print{display:none !important;}
    .page{width:auto;min-height:0;margin:0;padding:0;box-shadow:none;border-radius:0;}
    .page + .page{page-break-before:always;}
    thead{display:table-header-group;}
    /* Only ATOMIC units resist breaking — never a whole .sec (that fragments the page). */
    tr,.trend,.tile,.callout,.weight,.safetyband,.present{page-break-inside:avoid;}
    .rule-brand,.wordmark,.foot .fbrand .fw .w{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  }
  @page{size:A4 portrait;margin:11mm;}
`
