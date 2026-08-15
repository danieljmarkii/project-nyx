// InsightCard — the joint-candidate linked pair (B-351 slice 6, D5).
//
// The card frame, rail and expand behaviour predate this file and are exercised
// indirectly by the Home tests; what is asserted here is the one rendering decision
// slice 6 introduced, and it is a CLINICAL decision wearing a layout's clothes: when the
// engine cannot separate two proteins, every one of them has to reach the owner's eyes.
// A linked pair that silently drops a member — by truncating, by scrolling it off-screen,
// by rendering only `protein[0]` — would exonerate that protein by omission on the
// flagship wedge surface, which is exactly the false attribution the joint candidate
// exists to prevent.

import { type ReactElement } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { InsightCard } from './InsightCard';
import { dotLaneA11yLabel, stackedCompareA11yLabel, timingStoryBandRows } from '../../lib/signalCopy';
import type {
  CachedFinding,
  CorrelationFinding,
  EmptyStomachTimingFinding,
  PostprandialTimingFinding,
  ReflectionFinding,
  SymptomWorseningFinding,
  TimingStoryFinding,
} from '../../lib/signal';

const correlation = (over: Partial<CorrelationFinding> = {}): CorrelationFinding => ({
  type: 'food_symptom_correlation',
  priorityClass: 'insight',
  tier: 'early',
  symptomType: 'vomit',
  protein: 'chicken',
  matchedPairs: 4,
  symptomEventCount: 4,
  correlationWindowHours: 12,
  ...over,
});

const cached = (finding: CorrelationFinding, text = 'A sentence about Pixel.'): CachedFinding => ({
  rank: 0,
  text,
  finding,
});

const joint = (over: Partial<CorrelationFinding> = {}) =>
  correlation({
    protein: 'chicken and duck',
    proteins: ['chicken', 'duck'],
    jointCandidate: true,
    ...over,
  });

describe('InsightCard — joint candidate linked pair', () => {
  it('renders a chip for EVERY member of the cluster', () => {
    const { getByText } = render(<InsightCard cached={cached(joint())} petName="Pixel" />);
    expect(getByText('Chicken')).toBeTruthy();
    expect(getByText('Duck')).toBeTruthy();
    expect(getByText('always fed together')).toBeTruthy();
  });

  it('does not truncate a cluster larger than two', () => {
    // A 4-protein bag is a real shape (the live library holds sets up to 5), and dropping
    // the 3rd and 4th to keep the row tidy would be a false exoneration, not a layout call.
    const four = joint({
      protein: 'beef, chicken, duck and lamb',
      proteins: ['beef', 'chicken', 'duck', 'lamb'],
    });
    const { getByText } = render(<InsightCard cached={cached(four)} petName="Pixel" />);
    for (const p of ['Beef', 'Chicken', 'Duck', 'Lamb']) expect(getByText(p)).toBeTruthy();
  });

  it('renders NO pair row for an ordinary single-protein correlation', () => {
    const { queryByText } = render(<InsightCard cached={cached(correlation())} petName="Pixel" />);
    expect(queryByText('always fed together')).toBeNull();
  });

  it('renders NO pair row for a finding cached before slice 6 (no cluster on the row)', () => {
    // ai_signals rows written by the previous deployment carry no `proteins`; they must
    // render as the plain card they were generated as, never as an empty linked pair.
    const legacy = correlation({ protein: 'chicken', jointCandidate: undefined });
    const { queryByText } = render(<InsightCard cached={cached(legacy)} petName="Pixel" />);
    expect(queryByText('always fed together')).toBeNull();
  });

  it('exposes the pair to screen readers as one phrase, not as loose chips', () => {
    const { getByLabelText } = render(<InsightCard cached={cached(joint())} petName="Pixel" />);
    expect(getByLabelText('Chicken and Duck — always fed together')).toBeTruthy();
  });
});

// ── SR-1 (B-721) — the design-uplift receipts, dark behind signal_design_v2 ──────
// The load-bearing invariant is FR-FLAG-2: flag-OFF is BYTE-IDENTICAL to the shipped
// card. So designV2={false} renders exactly the default, and correlation/reflection
// are unchanged even flag-ON (they carry no card-face strip — S10 / sentence-only).
// Flag-ON adds the timing dot lane (degrading to the compare at large n) and, in the
// expand, the safety phone-call script + the two-sided timing control side. These are
// the render-side checks; the pure geometry/copy is covered in lib/signalCopy.test.ts.

const postprandial = (over: Partial<PostprandialTimingFinding> = {}): PostprandialTimingFinding => ({
  type: 'postprandial_timing',
  priorityClass: 'insight',
  symptomType: 'vomit',
  rapidCount: 4,
  eligibleCount: 8,
  totalEpisodes: 10,
  rapidWindowMinutes: 30,
  lastTwoEligibleRapid: true,
  medianMinutesSinceFeeding: 18,
  feedingFormsInEvidence: ['dry treat'],
  windowDays: 60,
  ...over,
});

const worsening = (over: Partial<SymptomWorseningFinding> = {}): SymptomWorseningFinding => ({
  type: 'symptom_worsening',
  priorityClass: 'safety',
  symptomType: 'vomit',
  currentCount: 5,
  priorCount: 2,
  currentDays: 3,
  priorDays: 2,
  trigger: 'more_episodes',
  tier: 'standard',
  windowDays: 14,
  ...over,
});

const reflection = (over: Partial<ReflectionFinding> = {}): ReflectionFinding => ({
  type: 'reflection',
  priorityClass: 'insight',
  symptomType: 'vomit',
  currentCount: 2,
  priorCount: 5,
  direction: 'improving',
  windowDays: 7,
  ...over,
});

// Signals v2 (CUL-12) — the A2 combined timing card + its lone empty-stomach sibling.
const timingStory = (over: Partial<TimingStoryFinding> = {}): TimingStoryFinding => ({
  type: 'timing_story',
  priorityClass: 'insight',
  symptomType: 'vomit',
  bandCounts: { rapid: 7, mid: 6, long: 7 },
  eligibleCount: 20,
  totalEpisodes: 26,
  rapidWindowMinutes: 30,
  longGapHours: 6,
  windowDays: 60,
  rapid: { count: 7, medianMinutesSinceFeeding: 12, lastTwoEligible: true, feedingFormsInEvidence: [] },
  long: {
    count: 7,
    medianHoursSinceFeeding: 9,
    lastTwoEligible: false,
    feedingFormsInEvidence: [],
    clockBand: { startLocalHour: 2, windowHours: 6 },
    clockCount: 6,
  },
  ...over,
});

const emptyStomach = (over: Partial<EmptyStomachTimingFinding> = {}): EmptyStomachTimingFinding => ({
  type: 'empty_stomach_timing',
  priorityClass: 'insight',
  symptomType: 'vomit',
  longCount: 7,
  eligibleCount: 12,
  bandCounts: { rapid: 2, mid: 3, long: 7 },
  totalEpisodes: 15,
  longGapHours: 6,
  lastTwoEligibleLong: true,
  medianHoursSinceFeeding: 9,
  feedingFormsInEvidence: [],
  clockBand: { startLocalHour: 2, windowHours: 6 },
  clockCount: 6,
  windowDays: 60,
  ...over,
});

const anyCached = (finding: CachedFinding['finding'], text = 'A sentence.'): CachedFinding => ({
  rank: 0,
  text,
  finding,
});

// The rendered tree as a stable structural string. JSON.stringify drops the Pressable's
// event-handler function props (new closures every render — never identity-equal), so
// two renders of the same structure compare equal; the a11y/style/text structure is
// exactly what FR-FLAG-2 "byte-identical" means.
const structureOf = (node: ReactElement) => JSON.stringify(render(node).toJSON());

describe('InsightCard — SR-1 flag gating (signal_design_v2)', () => {
  it('flag-OFF is byte-identical to the shipped default, and snapshot-pinned (FR-FLAG-2)', () => {
    const cases: CachedFinding[] = [
      anyCached(correlation()),
      anyCached(postprandial()),
      anyCached(worsening()),
      anyCached(reflection()),
    ];
    for (const c of cases) {
      // Passing designV2={false} renders exactly the shipped default (no prop).
      expect(structureOf(<InsightCard cached={c} petName="Nyx" designV2={false} />)).toBe(
        structureOf(<InsightCard cached={c} petName="Nyx" />),
      );
      // Pin the shipped surface so a future flag-off drift fails CI (snapshot per type).
      expect(render(<InsightCard cached={c} petName="Nyx" designV2={false} />).toJSON()).toMatchSnapshot(
        `flag-off ${c.finding.type}`,
      );
    }
  });

  it("a timing card folds its dot-lane sentence into the card's own a11y label only when the flag is on", () => {
    // The strip Views are decorative (swallowed by the outer Pressable); the receipt's
    // sentence must reach VoiceOver via the card button's OWN label. {exact:false} = the
    // sentence is CONTAINED in the composite `${cached.text}. ${receipt}` label.
    const c = anyCached(postprandial());
    const label = dotLaneA11yLabel(postprandial());
    expect(render(<InsightCard cached={c} petName="Nyx" designV2={false} />).queryByLabelText(label, { exact: false })).toBeNull();
    expect(render(<InsightCard cached={c} petName="Nyx" designV2 />).queryByLabelText(label, { exact: false })).toBeTruthy();
  });

  it('a large-n timing card degrades to the compare (no dot lane) on the card face', () => {
    const finding = postprandial({ eligibleCount: 20, totalEpisodes: 24, rapidCount: 12 });
    const view = render(<InsightCard cached={anyCached(finding)} petName="Nyx" designV2 />);
    // Degraded → the card-face + label carry the COMPARE sentence, not the dot-lane one.
    expect(view.queryByLabelText(dotLaneA11yLabel(finding), { exact: false })).toBeNull();
    expect(view.queryByText('Within 30 min of eating')).toBeTruthy();
    expect(view.queryByText('Timed, but later')).toBeTruthy();
  });

  it('correlation stays sentence-only even flag-ON (S10 — the sample line carries it)', () => {
    const c = anyCached(correlation());
    expect(structureOf(<InsightCard cached={c} petName="Nyx" designV2 />)).toBe(
      structureOf(<InsightCard cached={c} petName="Nyx" designV2={false} />),
    );
  });

  it('reflection card FACE stays sentence-only flag-ON (density treatment is expand-only, SR-5)', () => {
    // A reflection with no density payload renders byte-identically flag-on: the SR-5
    // density disclosure/withheld + trial adjacency live only in the EXPAND (S1/S10), and
    // the sample-line gating fires only on density.comparable === false (absent here).
    const c = anyCached(reflection());
    expect(structureOf(<InsightCard cached={c} petName="Nyx" designV2 />)).toBe(
      structureOf(<InsightCard cached={c} petName="Nyx" designV2={false} />),
    );
  });

  it('a SAFETY card carries no strip on its face (S1 — plainness is the severity signal)', () => {
    // Collapsed, the only flag-ON change lives inside the expand — the face is unchanged.
    const c = anyCached(worsening());
    expect(structureOf(<InsightCard cached={c} petName="Nyx" designV2 />)).toBe(
      structureOf(<InsightCard cached={c} petName="Nyx" designV2={false} />),
    );
  });

  it('the safety expand renders the phone-call script only when the flag is on', () => {
    const c = anyCached(worsening());
    const offView = render(<InsightCard cached={c} petName="Nyx" designV2={false} />);
    fireEvent.press(offView.getByRole('button'));
    expect(offView.queryByText('If you call your clinic, the facts to have ready')).toBeNull();

    const onView = render(<InsightCard cached={c} petName="Nyx" designV2 />);
    fireEvent.press(onView.getByRole('button'));
    expect(onView.queryByText('If you call your clinic, the facts to have ready')).toBeTruthy();
  });

  it('the timing expand draws the control side + the honest un-timeable remainder', () => {
    const c = anyCached(postprandial({ eligibleCount: 8, totalEpisodes: 10, rapidCount: 4 }));
    const view = render(<InsightCard cached={c} petName="Nyx" designV2 />);
    fireEvent.press(view.getByRole('button'));
    expect(view.queryByText('The other side of the picture')).toBeTruthy();
    expect(view.queryByText("2 episodes weren't near any logged meal")).toBeTruthy();
  });
});

// ── SR-3 (B-721) — the register: `New`-for-worsening + secondary compression ──────
describe('InsightCard — SR-3 New-for-worsening chip (§3.2)', () => {
  it('renders the New chip for a zero-prior worsening only when the flag is on', () => {
    const c = anyCached(worsening({ priorCount: 0, currentCount: 4, trigger: 'more_episodes' }));
    expect(render(<InsightCard cached={c} petName="Nyx" designV2={false} />).queryByText('New')).toBeNull();
    expect(render(<InsightCard cached={c} petName="Nyx" designV2 />).queryByText('New')).toBeTruthy();
  });

  it('shows no New chip for a worsening with a real prior week (a trend, not a first appearance)', () => {
    const c = anyCached(worsening({ priorCount: 2 }));
    expect(render(<InsightCard cached={c} petName="Nyx" designV2 />).queryByText('New')).toBeNull();
  });

  it('drops the "0 last week" pair from the sample line when the chip carries the novelty (S10)', () => {
    const c = anyCached(worsening({ priorCount: 0, currentCount: 4, trigger: 'more_episodes' }));
    const on = render(<InsightCard cached={c} petName="Nyx" designV2 />);
    expect(on.queryByText('4 episodes this week')).toBeTruthy();
    expect(on.queryByText(/0 last week/)).toBeNull();
    // Flag-off keeps the shipped pair line (and shows no chip) — byte-identical surface.
    const off = render(<InsightCard cached={c} petName="Nyx" designV2={false} />);
    expect(off.queryByText('4 episodes this week, 0 last week')).toBeTruthy();
  });

  it('flag-OFF is byte-identical for a zero-prior worsening too (FR-FLAG-2)', () => {
    const c = anyCached(worsening({ priorCount: 0 }));
    expect(structureOf(<InsightCard cached={c} petName="Nyx" designV2={false} />)).toBe(
      structureOf(<InsightCard cached={c} petName="Nyx" />),
    );
  });
});

describe('InsightCard — SR-3 secondary compression (§5.1)', () => {
  it('compact tightens the row; default/flag-off renders the shipped rhythm byte-identical', () => {
    const c = anyCached(worsening());
    // compact defaults false → identical to no prop (the flag-off / lead path).
    expect(structureOf(<InsightCard cached={c} petName="Nyx" designV2 compact={false} />)).toBe(
      structureOf(<InsightCard cached={c} petName="Nyx" designV2 />),
    );
    // compact true → a DIFFERENT (tighter) structure — the register's secondary rhythm.
    expect(structureOf(<InsightCard cached={c} petName="Nyx" designV2 compact />)).not.toBe(
      structureOf(<InsightCard cached={c} petName="Nyx" designV2 />),
    );
  });
});

// ── SR-5 (B-721) — the client consumption of SR-4's payload ───────────────────
describe('InsightCard — SR-5 med-on-board line (§5.4)', () => {
  const withMed = (over: Partial<CorrelationFinding> = {}) =>
    correlation({ medContext: { drugLabel: 'Apoquel', doseCount: 3 }, ...over });

  it('renders the med line on a correlation carrying medContext, only when the flag is on', () => {
    const c = anyCached(withMed());
    const line = 'During an active Apoquel course — 3 doses logged.';
    expect(render(<InsightCard cached={c} petName="Nyx" designV2={false} />).queryByText(line)).toBeNull();
    expect(render(<InsightCard cached={c} petName="Nyx" designV2 />).queryByText(line)).toBeTruthy();
  });

  it('renders on a timing card too (§5.4)', () => {
    const c = anyCached(postprandial({ medContext: { drugLabel: 'Metronidazole', doseCount: 4 } }));
    expect(
      render(<InsightCard cached={c} petName="Nyx" designV2 />).queryByText(
        'During an active Metronidazole course — 4 doses logged.',
      ),
    ).toBeTruthy();
  });

  it('pluralises a single dose (B-733 — doseCount can be 1)', () => {
    const c = anyCached(correlation({ medContext: { drugLabel: 'Apoquel', doseCount: 1 } }));
    expect(
      render(<InsightCard cached={c} petName="Nyx" designV2 />).queryByText(
        'During an active Apoquel course — 1 dose logged.',
      ),
    ).toBeTruthy();
  });

  it('drops the line entirely when a "%" in the drug name trips the guardrail (B-733)', () => {
    const c = anyCached(correlation({ medContext: { drugLabel: 'Baytril 2.5%', doseCount: 2 } }));
    const on = render(<InsightCard cached={c} petName="Nyx" designV2 />);
    // Fail-quiet: no partial line, no "%", no bare drug name — the whole line is dropped.
    expect(on.queryByText(/Baytril/)).toBeNull();
    expect(on.queryByText(/active .* course/)).toBeNull();
  });

  it('folds the med line into the card a11y label (flag-on) so VoiceOver hears it', () => {
    const c = anyCached(withMed(), 'Chicken tends to precede vomiting.');
    expect(
      render(<InsightCard cached={c} petName="Nyx" designV2 />).queryByLabelText(
        /During an active Apoquel course — 3 doses logged\./,
        { exact: false },
      ),
    ).toBeTruthy();
    expect(
      render(<InsightCard cached={c} petName="Nyx" designV2={false} />).queryByLabelText(/Apoquel/, {
        exact: false,
      }),
    ).toBeNull();
  });

  it('shows no med line on a reflection or a safety card (only correlation + timing carry it)', () => {
    const refl = anyCached(reflection());
    const safety = anyCached(worsening());
    expect(render(<InsightCard cached={refl} petName="Nyx" designV2 />).queryByText(/active .* course/)).toBeNull();
    expect(render(<InsightCard cached={safety} petName="Nyx" designV2 />).queryByText(/active .* course/)).toBeNull();
  });

  it('flag-OFF is byte-identical for a correlation carrying medContext (FR-FLAG-2)', () => {
    const c = anyCached(withMed());
    expect(structureOf(<InsightCard cached={c} petName="Nyx" designV2={false} />)).toBe(
      structureOf(<InsightCard cached={c} petName="Nyx" />),
    );
  });
});

describe('InsightCard — SR-5 reflection density + trial adjacency (§3.3 / §3.4)', () => {
  const comparable = { comparable: true, currentLoggingDays: 6, priorLoggingDays: 5 } as const;
  const incomparable = { comparable: false, currentLoggingDays: 2, priorLoggingDays: 6 } as const;
  const falling = (over: Partial<ReflectionFinding> = {}) =>
    reflection({ direction: 'improving', currentCount: 2, priorCount: 5, ...over });

  it('the expand shows the disclosure line for a COMPARABLE falling reflection', () => {
    const view = render(<InsightCard cached={anyCached(falling({ density: comparable }))} petName="Nyx" designV2 />);
    fireEvent.press(view.getByRole('button'));
    expect(view.queryByText('Counted honestly')).toBeTruthy();
    expect(view.queryByText('Counted from days you logged: 6 this week, 5 last.')).toBeTruthy();
  });

  it('the expand shows the WITHHELD line for a NOT-comparable falling reflection, and the FACE drops the pair', () => {
    const view = render(<InsightCard cached={anyCached(falling({ density: incomparable }))} petName="Nyx" designV2 />);
    // Card FACE: the sample line withholds the incomparable "5 last week" (§3.3 coherence).
    expect(view.queryByText('2 episodes this week')).toBeTruthy();
    expect(view.queryByText(/5 last week/)).toBeNull();
    // Expand: the reworded withheld line, grounded in logged days (B-733).
    fireEvent.press(view.getByRole('button'));
    expect(view.queryByText(/fewer logged days can look like fewer episodes/)).toBeTruthy();
  });

  it('flag-OFF keeps the shipped sample-line pair for the same not-comparable reflection (FR-FLAG-2)', () => {
    const view = render(<InsightCard cached={anyCached(falling({ density: incomparable }))} petName="Nyx" designV2={false} />);
    expect(view.queryByText('2 episodes this week, 5 last week')).toBeTruthy();
  });

  it('appends the trial adjacency in the expand when a trial is running (falling)', () => {
    const view = render(
      <InsightCard cached={anyCached(falling({ density: comparable }))} petName="Nyx" designV2 trialRunning />,
    );
    fireEvent.press(view.getByRole('button'));
    expect(view.queryByText(/isn't the trial's verdict — the full run is what makes it readable/)).toBeTruthy();
  });

  it('renders BOTH the withheld line and the trial adjacency in one box when density fell during a trial', () => {
    // The real combined case (falling reflection + fallen density + active trial): one
    // "Counted honestly" box carries the withheld density line AND the mid-trial adjacency,
    // while the card face still withholds the incomparable pair.
    const view = render(
      <InsightCard cached={anyCached(falling({ density: incomparable }))} petName="Nyx" designV2 trialRunning />,
    );
    fireEvent.press(view.getByRole('button'));
    expect(view.queryByText('Counted honestly')).toBeTruthy();
    expect(view.queryByText(/fewer logged days can look like fewer episodes/)).toBeTruthy();
    expect(view.queryByText(/isn't the trial's verdict/)).toBeTruthy();
    expect(view.queryByText('2 episodes this week')).toBeTruthy();
    expect(view.queryByText(/5 last week/)).toBeNull();
  });

  it('shows NO adjacency for a FLAT reflection even with a trial running', () => {
    const flat = anyCached(reflection({ direction: 'flat', currentCount: 4, priorCount: 4, density: comparable }));
    const view = render(<InsightCard cached={flat} petName="Nyx" designV2 trialRunning />);
    fireEvent.press(view.getByRole('button'));
    expect(view.queryByText(/isn't the trial's verdict/)).toBeNull();
    expect(view.queryByText('Counted honestly')).toBeNull();
  });

  it('an old cached falling reflection (no density) still gets the adjacency when a trial runs', () => {
    const view = render(<InsightCard cached={anyCached(falling())} petName="Nyx" designV2 trialRunning />);
    fireEvent.press(view.getByRole('button'));
    expect(view.queryByText(/isn't the trial's verdict/)).toBeTruthy();
    // …but no density line (nothing to disclose).
    expect(view.queryByText(/Counted from days you logged/)).toBeNull();
  });

  it('flag-OFF is byte-identical for a reflection carrying density (FR-FLAG-2)', () => {
    const c = anyCached(falling({ density: incomparable }));
    expect(structureOf(<InsightCard cached={c} petName="Nyx" designV2={false} />)).toBe(
      structureOf(<InsightCard cached={c} petName="Nyx" />),
    );
  });
});

// ── CUL-12 (Signals v2) — the A2 timing card, dark behind signals_v2 ─────────────
// The A2 card rides its OWN flag (signals_v2, not signal_design_v2 — spec §0 D6). The
// load-bearing invariant is the same FR-FLAG-2 / G10 one: with the flag OFF, a
// timing_story / empty_stomach_timing cache row renders NOTHING (byte-identical to before
// the type had a renderer — the server computes these uniformly, so a non-eligible cache
// DOES carry them). Flag-ON draws the three-band face + the A2 expand.
describe('InsightCard — CUL-12 A2 timing card flag gating (signals_v2)', () => {
  it('renders NOTHING for a story type when the flag is off — both types, and even with designV2 on', () => {
    for (const finding of [timingStory(), emptyStomach()]) {
      const c = anyCached(finding, 'Her vomiting keeps two kinds of time.');
      // signals_v2 defaults false → null (the whole card, no stray rail/divider).
      expect(render(<InsightCard cached={c} petName="Nyx" />).toJSON()).toBeNull();
      // designV2 is a DIFFERENT flag — it does not turn the A2 card on.
      expect(render(<InsightCard cached={c} petName="Nyx" designV2 />).toJSON()).toBeNull();
    }
  });

  it('draws the three-band face (each count printed — S2), badge + sample, when the flag is on', () => {
    const c = anyCached(timingStory(), 'Her vomiting keeps two kinds of time.');
    const view = render(<InsightCard cached={c} petName="Nyx" signalsV2 />);
    expect(view.queryByText('Her vomiting keeps two kinds of time.')).toBeTruthy();
    // The three time-ordered bands, each label anchored to its boundary.
    expect(view.queryByText('Within 30 min of eating')).toBeTruthy();
    expect(view.queryByText('30 min–6h after eating')).toBeTruthy();
    expect(view.queryByText('6h+ after eating')).toBeTruthy();
    // The meta row: badge + honest-denominator sample.
    expect(view.queryByText('Timing pattern')).toBeTruthy();
    expect(view.queryByText('20 timed of 26 episodes · 60 days')).toBeTruthy();
  });

  it('renders the A2 card on signals_v2 ALONE — it does not require signal_design_v2', () => {
    const c = anyCached(timingStory());
    // designV2 omitted (false), signalsV2 on → the card still fully renders.
    expect(render(<InsightCard cached={c} petName="Nyx" signalsV2 />).queryByText('Timing pattern')).toBeTruthy();
  });

  it("folds the three-band compare into the card's OWN a11y label (the strip Views are decorative)", () => {
    const finding = timingStory();
    const c = anyCached(finding, 'Her vomiting keeps two kinds of time.');
    const label = stackedCompareA11yLabel(timingStoryBandRows(finding));
    // Off → the label is just the sentence (no card at all, in fact).
    expect(render(<InsightCard cached={c} petName="Nyx" />).queryByLabelText(label, { exact: false })).toBeNull();
    // On → the compare sentence is contained in the composite card label.
    expect(render(<InsightCard cached={c} petName="Nyx" signalsV2 />).queryByLabelText(label, { exact: false })).toBeTruthy();
  });

  it('the expand draws the lanes, the control side, and the for-your-vet relay', () => {
    // A small-n fixture (eligibleCount ≤ DOT_LANE_MAX) so both dot lanes render.
    const c = anyCached(
      timingStory({
        bandCounts: { rapid: 4, mid: 3, long: 3 },
        eligibleCount: 10,
        totalEpisodes: 16,
        long: { count: 3, medianHoursSinceFeeding: 9, lastTwoEligible: false, feedingFormsInEvidence: [], clockBand: { startLocalHour: 2, windowHours: 6 }, clockCount: 2 },
      }),
    );
    const view = render(<InsightCard cached={c} petName="Nyx" signalsV2 />);
    fireEvent.press(view.getByRole('button'));
    // The two per-phenotype lanes.
    expect(view.queryByText('When they happen')).toBeTruthy();
    expect(view.queryByText('After eating')).toBeTruthy();
    expect(view.queryByText('By clock')).toBeTruthy();
    // The honest un-timeable remainder (S2), titled for what it holds (not a base-rate promise).
    expect(view.queryByText("What we couldn't time")).toBeTruthy();
    expect(view.queryByText("6 episodes weren't near any logged meal — we can't time those.")).toBeTruthy();
    // The for-your-vet relay (descriptors, never labels).
    expect(view.queryByText('For your vet')).toBeTruthy();
  });

  it('the expand renders the §5.4 med line + the L3 photo lines when the payload carries them', () => {
    const c = anyCached(
      timingStory({
        medContext: { drugLabel: 'Metronidazole', doseCount: 4 },
        photoComposition: { retainedFood: { count: 3, denominator: 5 }, hair: { count: 2, denominator: 6 } },
      }),
    );
    const view = render(<InsightCard cached={c} petName="Nyx" signalsV2 />);
    fireEvent.press(view.getByRole('button'));
    expect(view.queryByText('During an active Metronidazole course — 4 doses logged.')).toBeTruthy();
    expect(view.queryByText('What the photos showed')).toBeTruthy();
    expect(view.queryByText('Recognizable food 6h+ after eating: 3 of 5 photos we could read.')).toBeTruthy();
    expect(view.queryByText('Hair: 2 of 6 photos we could read.')).toBeTruthy();
  });

  it('a lone empty-stomach card renders its own face + expand (no rapid phenotype)', () => {
    const c = anyCached(emptyStomach(), '7 of the 12 episodes we could time came 6 or more hours after eating.');
    const view = render(<InsightCard cached={c} petName="Nyx" signalsV2 />);
    expect(view.queryByText('Timing pattern')).toBeTruthy();
    expect(view.queryByText('12 timed of 15 episodes · 60 days')).toBeTruthy();
    fireEvent.press(view.getByRole('button'));
    expect(view.queryByText('By clock')).toBeTruthy();
  });

  it('a story card with no clock band draws the meal lane but no clock lane', () => {
    const noClock = emptyStomach({ clockBand: undefined, clockCount: undefined });
    const view = render(<InsightCard cached={anyCached(noClock)} petName="Nyx" signalsV2 />);
    fireEvent.press(view.getByRole('button'));
    expect(view.queryByText('After eating')).toBeTruthy();
    expect(view.queryByText('By clock')).toBeNull();
  });

  it('omits a dot lane above the legibility cap — a chronic patient never sees a 40-dot blob', () => {
    // eligibleCount 40 > DOT_LANE_MAX (12): the meal lane would blob, so it is omitted (the face
    // three-band compare still carries the split). The clock lane (7 long episodes) still fits.
    const dense = timingStory({
      bandCounts: { rapid: 14, mid: 12, long: 14 },
      eligibleCount: 40,
      totalEpisodes: 44,
      long: { count: 7, medianHoursSinceFeeding: 9, lastTwoEligible: false, feedingFormsInEvidence: [], clockBand: { startLocalHour: 2, windowHours: 6 }, clockCount: 6 },
    });
    const view = render(<InsightCard cached={anyCached(dense)} petName="Nyx" signalsV2 />);
    // Face still shows the compare (each band still legible as a proportional bar).
    expect(view.queryByText('Within 30 min of eating')).toBeTruthy();
    fireEvent.press(view.getByRole('button'));
    expect(view.queryByText('After eating')).toBeNull(); // meal lane omitted (40 > cap)
    expect(view.queryByText('By clock')).toBeTruthy(); // clock lane kept (7 ≤ cap)
    // The clustering fact survives in text even where the lane is dropped — the for-your-vet relay.
    expect(view.queryByText(/early-morning timing is worth flagging/)).toBeTruthy();
  });

  it('drops the "When they happen" box entirely when BOTH lanes exceed the cap', () => {
    // Both eligibleCount and longCount over the cap → no lanes → no box; the rest of the expand
    // (control, for-your-vet) still renders, so the tap-through is never empty.
    const veryDense = timingStory({
      bandCounts: { rapid: 20, mid: 10, long: 20 },
      eligibleCount: 50,
      totalEpisodes: 52,
      long: { count: 20, medianHoursSinceFeeding: 9, lastTwoEligible: false, feedingFormsInEvidence: [], clockBand: { startLocalHour: 2, windowHours: 6 }, clockCount: 15 },
    });
    const view = render(<InsightCard cached={anyCached(veryDense)} petName="Nyx" signalsV2 />);
    fireEvent.press(view.getByRole('button'));
    expect(view.queryByText('When they happen')).toBeNull();
    expect(view.queryByText('After eating')).toBeNull();
    expect(view.queryByText('By clock')).toBeNull();
    // The for-your-vet relay still carries the clustering in words.
    expect(view.queryByText(/early-morning timing is worth flagging/)).toBeTruthy();
  });
});

describe('InsightCard — G10: the renderer registry safely ignores an unknown finding type', () => {
  // The precondition for every Signals v2 server lane's "no deploy" merge
  // (docs/nyx-signals-v2-requirements.md §5 / G10 — the B-182 lesson): `generate-signal`
  // is redeployed with a NEW finding/payload type ONLY after the client that renders-or-
  // safely-ignores it has merged. The safe-ignore is `INSIGHT_RENDERERS` having no entry
  // for the type → the `if (!Body) return null` guard. A cached row written by a newer
  // server deployment (or a lane merged ahead of its renderer) must SKIP its card, never
  // crash the whole Signal surface. This pins that contract: a refactor that drops the
  // guard, makes an unknown type throw, or reaches a copy helper before the guard fails CI.
  const unknownFinding = {
    // A real Signals v2 lane (§2 L4, CUL-14) this client build has no renderer for yet —
    // timing_story is now rendered (CUL-12), so this uses the still-unrendered gap lane.
    type: 'gap_shortening',
    priorityClass: 'insight',
  } as unknown as CachedFinding['finding'];

  it('renders nothing (null) for a finding type with no registered renderer — both branches', () => {
    const c: CachedFinding = {
      rank: 0,
      text: 'A future lane this client build cannot yet draw.',
      finding: unknownFinding,
    };
    expect(render(<InsightCard cached={c} petName="Nyx" />).toJSON()).toBeNull();
    // The design-v2 path returns before its receipt/med helpers too — neither branch throws.
    expect(render(<InsightCard cached={c} petName="Nyx" designV2 />).toJSON()).toBeNull();
  });

  it('POSITIVE CONTROL: a known finding type still renders (the guard is not "null for everything")', () => {
    expect(render(<InsightCard cached={cached(correlation())} petName="Nyx" />).toJSON()).not.toBeNull();
  });
});
