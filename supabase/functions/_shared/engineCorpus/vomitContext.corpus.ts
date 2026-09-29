// The Engines v3 guard corpus: per-incident vomit context (Engines v3 PR-11a, CUL-1267).
//
// HAND-BUILT, NEVER EXPORTED. Every row below was written by hand to state one scenario;
// none came from a real pet's record, and none may (real-record exports never enter the
// repo: the engine-replay README, PMD-12 / CUL-1313). It lives under supabase/functions/
// because that is the only tree CI's Deno job reads (ci.yml `--allow-read`).
//
// Each case states the flags the shipped derivation computes, by hand, from the rows: the
// derivation as of PR-11a (analyze-vomit/context.ts shippedVomitContext). They are the
// flag-off expectations, what EN-F promises every account not on the allowlist keeps. Two
// cases differ from the code before PR-11a, both on purpose and both marked: the meal at
// exactly the feline window's millisecond (C-40, now inclusive) and this event in the other
// ISO spelling (no longer counted twice; production never sends two spellings). Three are the named scenarios EN-0 is built against (critique R-3; the engines
// deep dive §5): the 8/19 read two days late, "ate then refused and read late", and the
// 6/7 vomit logged before the morning's meals were back-filled. Their shipped flags are
// the wrong answers EN-0 exists to correct, recorded here as what flag-off still says.
// PR-13a (CUL-1130) added each case's flag-ON expectation beside it, also by hand:
// `en0Flags` (the union of the shipped and the vomit-anchored evaluation, so always a
// superset of `shippedFlags`) and, where the intake flag fires, the record its read states.
//
// Times use both ISO spellings, `Z` and PostgREST's `+00:00`, because the builder parses
// every instant (C-40) and a corpus in one spelling could not show it.

import type { IntakeRecord, VomitContextRows } from '../../analyze-vomit/context.ts'

export type VomitContextualFlag = 'repeated_vomiting' | 'feline_reduced_intake' | 'concurrent_lethargy'

export interface VomitContextCase {
  name: string
  species: 'cat' | 'dog'
  // The moment the analysis runs.
  nowIso: string
  thisEventOccurredAt: string
  rows: VomitContextRows
  // The shipped (flag-off) contextual flags, stated by hand.
  shippedFlags: VomitContextualFlag[]
  // The EN-0 (flag-on) flags and intake record, stated by hand.
  en0Flags: VomitContextualFlag[]
  en0IntakeRecord?: IntakeRecord
}

const H = 3_600_000
const at = (baseIso: string, hours: number, spelling: 'Z' | '+00:00' = 'Z'): string => {
  const iso = new Date(Date.parse(baseIso) + hours * H).toISOString()
  return spelling === 'Z' ? iso : iso.replace('.000Z', '+00:00')
}
const meal = (occurred_at: string, rating: string | null) => ({ occurred_at, meals: { intake_rating: rating } })

const T = '2026-09-10T12:00:00.000Z'

export const VOMIT_CONTEXT_CORPUS: VomitContextCase[] = [
  {
    name: 'a dog, one vomit, nothing else logged',
    species: 'dog',
    nowIso: T,
    thisEventOccurredAt: at(T, -1),
    rows: { vomits: [{ occurred_at: at(T, -1) }], lethargy: [], meals: [] },
    shippedFlags: [],
    en0Flags: [],
  },
  {
    name: 'two vomits inside four hours',
    species: 'dog',
    nowIso: T,
    thisEventOccurredAt: at(T, -1),
    rows: { vomits: [{ occurred_at: at(T, -1) }, { occurred_at: at(T, -4, '+00:00') }], lethargy: [], meals: [] },
    shippedFlags: ['repeated_vomiting'],
    en0Flags: ['repeated_vomiting'],
  },
  {
    name: 'three vomits eight hours apart inside a day',
    species: 'dog',
    nowIso: T,
    thisEventOccurredAt: at(T, -1),
    rows: {
      vomits: [{ occurred_at: at(T, -1) }, { occurred_at: at(T, -9) }, { occurred_at: at(T, -17, '+00:00') }],
      lethargy: [],
      meals: [],
    },
    shippedFlags: ['repeated_vomiting'],
    en0Flags: ['repeated_vomiting'],
  },
  {
    name: 'the third vomit is 25 hours before the read, so outside the window',
    species: 'dog',
    nowIso: T,
    thisEventOccurredAt: T,
    rows: { vomits: [{ occurred_at: T }, { occurred_at: at(T, -10) }, { occurred_at: at(T, -25) }], lethargy: [], meals: [] },
    shippedFlags: [],
    en0Flags: [],
  },
  {
    name: 'the read raced its own write: the vomit query did not return this event',
    species: 'dog',
    nowIso: T,
    thisEventOccurredAt: at(T, -1),
    rows: { vomits: [], lethargy: [], meals: [] },
    shippedFlags: [],
    en0Flags: [],
  },
  {
    // Differs from the code before PR-11a (a textual `includes` counted it twice).
    name: 'this event in the other ISO spelling is one vomit, not two (C-40)',
    species: 'dog',
    nowIso: T,
    thisEventOccurredAt: at(T, -1),
    rows: { vomits: [{ occurred_at: at(T, -1, '+00:00') }], lethargy: [], meals: [] },
    shippedFlags: [],
    en0Flags: [],
  },
  {
    // A late read of an old vomit: both rows sit outside the read-anchored 24 h window but
    // an hour apart. Pins the builder's own vomit-window re-filter (without it, two within
    // four hours would fire), which matters once EN-0 anchors windows on the vomit.
    name: 'two old vomits an hour apart, read 30 hours later, are outside the window',
    species: 'dog',
    nowIso: T,
    thisEventOccurredAt: at(T, -30),
    rows: { vomits: [{ occurred_at: at(T, -30) }, { occurred_at: at(T, -31) }], lethargy: [], meals: [] },
    shippedFlags: [],
    en0Flags: ['repeated_vomiting'],
  },
  {
    name: 'lethargy five hours ago',
    species: 'dog',
    nowIso: T,
    thisEventOccurredAt: at(T, -1),
    rows: { vomits: [{ occurred_at: at(T, -1) }], lethargy: [{ occurred_at: at(T, -5) }], meals: [] },
    shippedFlags: ['concurrent_lethargy'],
    en0Flags: ['concurrent_lethargy'],
  },
  {
    name: 'lethargy thirty hours ago is outside its window',
    species: 'dog',
    nowIso: T,
    thisEventOccurredAt: at(T, -1),
    rows: { vomits: [{ occurred_at: at(T, -1) }], lethargy: [{ occurred_at: at(T, -30) }], meals: [] },
    shippedFlags: [],
    en0Flags: [],
  },
  {
    name: 'a tracked cat that ate most of a meal six hours ago',
    species: 'cat',
    nowIso: T,
    thisEventOccurredAt: at(T, -1),
    rows: { vomits: [{ occurred_at: at(T, -1) }], lethargy: [], meals: [meal(at(T, -6), 'most'), meal(at(T, -30), 'all')] },
    shippedFlags: [],
    en0Flags: [],
  },
  {
    name: 'a tracked cat whose only meals in a day were picked at',
    species: 'cat',
    nowIso: T,
    thisEventOccurredAt: at(T, -1),
    rows: {
      vomits: [{ occurred_at: at(T, -1) }],
      lethargy: [],
      meals: [meal(at(T, -6), 'picked'), meal(at(T, -14), 'some'), meal(at(T, -60), 'all')],
    },
    shippedFlags: ['feline_reduced_intake'],
    en0Flags: ['feline_reduced_intake'],
    en0IntakeRecord: { window: 'before_vomit', mealsLogged: 2 },
  },
  {
    name: 'a cat whose owner never rates meals (absence of logging is not anorexia)',
    species: 'cat',
    nowIso: T,
    thisEventOccurredAt: at(T, -1),
    rows: { vomits: [{ occurred_at: at(T, -1) }], lethargy: [], meals: [meal(at(T, -6), null), meal(at(T, -30), null)] },
    shippedFlags: [],
    en0Flags: [],
  },
  {
    // The only rated meal is eight days old: outside the seven-day baseline, so this owner
    // does not count as tracking intake. Pins the baseline re-filter.
    name: 'a cat whose only rated meal is older than the tracking baseline',
    species: 'cat',
    nowIso: T,
    thisEventOccurredAt: at(T, -1),
    rows: { vomits: [{ occurred_at: at(T, -1) }], lethargy: [], meals: [meal(at(T, -8 * 24), 'refused'), meal(at(T, -6), null)] },
    shippedFlags: [],
    en0Flags: [],
  },
  {
    name: 'a dog is never flagged for intake',
    species: 'dog',
    nowIso: T,
    thisEventOccurredAt: at(T, -1),
    rows: { vomits: [{ occurred_at: at(T, -1) }], lethargy: [], meals: [meal(at(T, -6), 'refused'), meal(at(T, -60), 'all')] },
    shippedFlags: [],
    en0Flags: [],
  },
  {
    // Differs from the code before PR-11a (a textual compare dropped it): the one boundary
    // PR-11a moves, disclosed in context.ts.
    name: 'a good meal at exactly the window edge, spelled +00:00, counts (C-40, inclusive)',
    species: 'cat',
    nowIso: T,
    thisEventOccurredAt: at(T, -1),
    rows: { vomits: [{ occurred_at: at(T, -1) }], lethargy: [], meals: [meal(at(T, -24, '+00:00'), 'all')] },
    shippedFlags: [],
    en0Flags: [],
  },
  {
    name: 'every flag at once',
    species: 'cat',
    nowIso: T,
    thisEventOccurredAt: at(T, -1),
    rows: {
      vomits: [{ occurred_at: at(T, -1) }, { occurred_at: at(T, -2) }],
      lethargy: [{ occurred_at: at(T, -3) }],
      meals: [meal(at(T, -8), 'refused'), meal(at(T, -50), 'all')],
    },
    shippedFlags: ['repeated_vomiting', 'feline_reduced_intake', 'concurrent_lethargy'],
    en0Flags: ['repeated_vomiting', 'feline_reduced_intake', 'concurrent_lethargy'],
    en0IntakeRecord: { window: 'before_vomit', mealsLogged: 1 },
  },
  {
    // PM ruling (a), 2026-09-29: nothing logged in the day before the vomit, then the cat
    // ate well after it; read two days late. The shipped window holds the good meals, and
    // the anchored window is empty, which is a gap in the log, not a finding. Quiet both ways.
    name: 'a logging gap before the vomit, eating well after it, read late, adds nothing',
    species: 'cat',
    nowIso: T,
    thisEventOccurredAt: at(T, -48),
    rows: {
      vomits: [{ occurred_at: at(T, -48) }],
      lethargy: [],
      meals: [meal(at(T, -38), 'all'), meal(at(T, -18), 'all'), meal(at(T, -6), 'most'), meal(at(T, -100), 'some')],
    },
    shippedFlags: [],
    en0Flags: [],
  },
  // ── EN-0's named scenarios (their shipped answers, which EN-0 corrects) ──────────────
  {
    // Six meals in the 24 h before the vomit, all unrated; the read ran two days later, so
    // every window is measured back from the read and holds no rated meal at all, while
    // the week still does. Shipped: the cat "hasn't eaten a full meal recently".
    name: 'EN-0 · 8/19: a vomit analysed two days late over unrated meals',
    species: 'cat',
    nowIso: '2026-08-21T17:40:00.000Z',
    thisEventOccurredAt: '2026-08-19T17:40:00+00:00',
    rows: {
      vomits: [],
      lethargy: [],
      meals: [
        ...[2, 5, 8, 12, 16, 20].map((h) => meal(at('2026-08-19T17:40:00.000Z', -h), null)),
        meal('2026-08-17T08:00:00.000Z', 'all'),
      ],
    },
    shippedFlags: ['feline_reduced_intake'],
    en0Flags: ['feline_reduced_intake'],
    en0IntakeRecord: { window: 'before_vomit', mealsLogged: 6 },
  },
  {
    // Ate everything two hours before the vomit, refused twice after it; read 30 h after the
    // vomit, when the good meal has left the read-anchored window. Shipped fires, for a
    // reason that happens to be true here; EN-0 must keep firing (no warning lost).
    name: 'EN-0 · ate, vomited, then refused, read late',
    species: 'cat',
    nowIso: '2026-09-02T14:00:00.000Z',
    thisEventOccurredAt: '2026-09-01T08:00:00.000Z',
    rows: {
      vomits: [{ occurred_at: '2026-09-01T08:00:00+00:00' }],
      lethargy: [],
      meals: [
        meal('2026-09-01T06:00:00.000Z', 'all'),
        meal('2026-09-01T14:00:00.000Z', 'refused'),
        meal('2026-09-01T20:00:00.000Z', 'refused'),
      ],
    },
    shippedFlags: ['feline_reduced_intake'],
    en0Flags: ['feline_reduced_intake'],
    en0IntakeRecord: { window: 'before_read', mealsLogged: 2 },
  },
  {
    // The owner logged the vomit at 07:44 and back-filled the morning's meals at 07:48 to
    // 07:54. A read at 07:44 saw none of them: the cat looks like it has not eaten.
    name: 'EN-0 · 6/7: the vomit logged before the morning meals were back-filled',
    species: 'cat',
    nowIso: '2026-06-07T07:44:00.000Z',
    thisEventOccurredAt: '2026-06-07T07:44:00.000Z',
    rows: {
      vomits: [{ occurred_at: '2026-06-07T07:44:00+00:00' }],
      lethargy: [],
      meals: [meal('2026-06-05T07:00:00.000Z', 'most')],
    },
    shippedFlags: ['feline_reduced_intake'],
    // The anchored half counted no meals, so it adds nothing (ruling (a)); the read-time
    // half fired, and its read says so, pinned to the read's moment.
    en0Flags: ['feline_reduced_intake'],
    en0IntakeRecord: { window: 'before_read', mealsLogged: 0 },
  },
  {
    // The same vomit re-read at 07:55, after the back-fill landed.
    name: 'EN-0 · 6/7: the same vomit re-read after the back-fill',
    species: 'cat',
    nowIso: '2026-06-07T07:55:00.000Z',
    thisEventOccurredAt: '2026-06-07T07:44:00.000Z',
    rows: {
      vomits: [{ occurred_at: '2026-06-07T07:44:00+00:00' }],
      lethargy: [],
      meals: [meal('2026-06-07T06:30:00.000Z', 'all'), meal('2026-06-05T07:00:00.000Z', 'most')],
    },
    shippedFlags: [],
    en0Flags: [],
  },
]
