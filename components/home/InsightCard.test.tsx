// InsightCard — the Signal insight card after the GA of the design uplift (SR-1..SR-6)
// and the Signals-v2 lanes (CUL-547 + CUL-548). The uplift receipts + the v2 story/trial
// renderers are now the ONLY path (no flag props), so these tests exercise the rendered
// surface directly. What survives from the flag era is the G10 contract: an unknown
// finding type with no registered renderer renders null (a future lane merged ahead of its
// client renderer must skip its card, never crash the surface).

import { type ReactElement } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { InsightCard } from './InsightCard';
import {
  dotLaneA11yLabel,
  stackedCompareA11yLabel,
  timingStoryBandRows,
  trialResponseCompareRows,
} from '../../lib/signalCopy';
import type {
  CachedFinding,
  CorrelationFinding,
  EmptyStomachTimingFinding,
  PostprandialTimingFinding,
  ReflectionFinding,
  SymptomChronicityFinding,
  SymptomWorseningFinding,
  TimingStoryFinding,
  TrialResponseFinding,
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

// ── SR-1 (B-721) — the design-uplift receipts (GA'd, the only path) ──────────────
// A timing finding gains its card-face dot lane (degrading to the compare at large n);
// every other type stays sentence-only (S1 safety faces stay plain; S10 correlation/
// intake/reflection are already carried by their sample line). The pure geometry/copy is
// covered in lib/signalCopy.test.ts; these are the render-side checks.

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

const chronicity = (over: Partial<SymptomChronicityFinding> = {}): SymptomChronicityFinding => ({
  type: 'symptom_chronicity',
  priorityClass: 'safety',
  symptomType: 'vomit',
  episodeCount: 14,
  spanDays: 48,
  activeWeeks: 7,
  symptomDays: 14,
  daysSinceLastEpisode: 3,
  firstOnsetIso: '2026-07-05T08:00:00.000Z',
  tier: 'firm',
  windowDays: 56,
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

// Signals v2 (CUL-13) — the event-driven trial card (Nyx's fewer case: after-eating 4 · was 8;
// empty-stomach 0 · was 7; pooled 4 · 20).
const trialResponse = (over: Partial<TrialResponseFinding> = {}): TrialResponseFinding => ({
  type: 'trial_response',
  priorityClass: 'insight',
  trialDayNumber: 20,
  targetDurationDays: 56,
  trialLoggedDays: 18,
  baselineLoggedDays: 40,
  baselineWindowDays: 49,
  pooledTrialCount: 4,
  pooledBaselineCount: 20,
  rapid: { trial: 4, baseline: 8 },
  long: { trial: 0, baseline: 7 },
  rapidWindowMinutes: 30,
  longGapHours: 6,
  treatShare: { trial: 0.1, baseline: 0.8 },
  mealsPerDay: { trial: 4, baseline: 2 },
  comparisonDirection: 'fewer_during_trial',
  densityComparable: true,
  trialWindowDays: 20,
  ...over,
});

const anyCached = (finding: CachedFinding['finding'], text = 'A sentence.'): CachedFinding => ({
  rank: 0,
  text,
  finding,
});

// The rendered tree as a stable structural string. JSON.stringify drops the Pressable's
// event-handler function props (new closures every render — never identity-equal), so
// two renders of the same structure compare equal.
const structureOf = (node: ReactElement) => JSON.stringify(render(node).toJSON());

// The collapsed card's own accessibilityLabel. CUL-784: the face is one button and the
// control row beside it holds one or two more, so the face is reached by its testID.
const a11yLabelOf = (node: ReactElement) => render(node).getByTestId('insight-face').props.accessibilityLabel;

describe('InsightCard — SR-1 card-face receipts', () => {
  it("a timing card folds its dot-lane sentence into the card's own a11y label", () => {
    // The strip Views are decorative (swallowed by the outer Pressable); the receipt's
    // sentence must reach VoiceOver via the card button's OWN label. {exact:false} = the
    // sentence is CONTAINED in the composite `${cached.text}. ${receipt}` label.
    const c = anyCached(postprandial());
    const label = dotLaneA11yLabel(postprandial());
    expect(render(<InsightCard cached={c} petName="Nyx" />).queryByLabelText(label, { exact: false })).toBeTruthy();
  });

  it('a large-n timing card degrades to the compare (no dot lane) on the card face', () => {
    const finding = postprandial({ eligibleCount: 20, totalEpisodes: 24, rapidCount: 12 });
    const view = render(<InsightCard cached={anyCached(finding)} petName="Nyx" />);
    // Degraded → the card-face + label carry the COMPARE sentence, not the dot-lane one.
    expect(view.queryByLabelText(dotLaneA11yLabel(finding), { exact: false })).toBeNull();
    expect(view.queryByText('Within 30 min of eating')).toBeTruthy();
    expect(view.queryByText('Timed, but later')).toBeTruthy();
  });

  it('correlation stays sentence-only — no card-face receipt in its a11y label (S10)', () => {
    const c = anyCached(correlation());
    expect(a11yLabelOf(<InsightCard cached={c} petName="Nyx" />)).toBe(c.text);
  });

  it('a reflection with no density payload stays sentence-only on its face (SR-5 is expand-only)', () => {
    const c = anyCached(reflection());
    expect(a11yLabelOf(<InsightCard cached={c} petName="Nyx" />)).toBe(c.text);
  });

  it('a SAFETY card carries no strip on its face (S1 — plainness is the severity signal)', () => {
    // A real-prior worsening (no New clause) → the collapsed label is exactly the sentence.
    const c = anyCached(worsening({ priorCount: 2 }));
    expect(a11yLabelOf(<InsightCard cached={c} petName="Nyx" />)).toBe(c.text);
  });

  it('the safety expand renders the phone-call script', () => {
    const c = anyCached(worsening());
    const view = render(<InsightCard cached={c} petName="Nyx" />);
    fireEvent.press(view.getByTestId('insight-face'));
    expect(view.queryByText('If you call your clinic, the facts to have ready')).toBeTruthy();
  });

  it('the timing expand draws the control side + the honest un-timeable remainder', () => {
    const c = anyCached(postprandial({ eligibleCount: 8, totalEpisodes: 10, rapidCount: 4 }));
    const view = render(<InsightCard cached={c} petName="Nyx" />);
    fireEvent.press(view.getByTestId('insight-face'));
    expect(view.queryByText('The other side of the picture')).toBeTruthy();
    expect(view.queryByText("2 episodes weren't near any logged meal")).toBeTruthy();
  });
});

// ── SR-3 (B-721) — the register: `New`-for-worsening + secondary compression ──────
describe('InsightCard — SR-3 New-for-worsening chip (§3.2)', () => {
  it('renders the New chip for a zero-prior worsening', () => {
    const c = anyCached(worsening({ priorCount: 0, currentCount: 4, trigger: 'more_episodes' }));
    expect(render(<InsightCard cached={c} petName="Nyx" />).queryByText('New')).toBeTruthy();
  });

  it('shows no New chip for a worsening with a real prior week (a trend, not a first appearance)', () => {
    const c = anyCached(worsening({ priorCount: 2 }));
    expect(render(<InsightCard cached={c} petName="Nyx" />).queryByText('New')).toBeNull();
  });

  it('drops the "0 last week" pair from the sample line when the chip carries the novelty (S10)', () => {
    const c = anyCached(worsening({ priorCount: 0, currentCount: 4, trigger: 'more_episodes' }));
    const view = render(<InsightCard cached={c} petName="Nyx" />);
    expect(view.queryByText('4 episodes this week')).toBeTruthy();
    expect(view.queryByText(/0 last week/)).toBeNull();
  });

  // B-727 (CUL-239 client half): the chip is visual-only and the card is one accessible
  // button, so the label must carry the chip's fact. Load-bearing for GA-3: when the server
  // sentence retires "after none", this clause keeps the novelty audible.
  it('the card a11y label carries the New fact when the chip shows (B-727)', () => {
    const c = anyCached(worsening({ priorCount: 0, currentCount: 4, trigger: 'more_episodes' }));
    expect(a11yLabelOf(<InsightCard cached={c} petName="Nyx" />)).toBe(`${c.text}. New this week.`);
  });

  it('a worsening with a real prior week gains no New clause in its label', () => {
    const c = anyCached(worsening({ priorCount: 2 }));
    expect(a11yLabelOf(<InsightCard cached={c} petName="Nyx" />)).toBe(c.text);
  });
});

describe('InsightCard — SR-3 secondary compression (§5.1)', () => {
  it('compact tightens the row; the default (lead) row keeps the fuller rhythm', () => {
    const c = anyCached(worsening());
    // compact defaults false → identical to no prop.
    expect(structureOf(<InsightCard cached={c} petName="Nyx" compact={false} />)).toBe(
      structureOf(<InsightCard cached={c} petName="Nyx" />),
    );
    // compact true → a DIFFERENT (tighter) structure — the register's secondary rhythm.
    expect(structureOf(<InsightCard cached={c} petName="Nyx" compact />)).not.toBe(
      structureOf(<InsightCard cached={c} petName="Nyx" />),
    );
  });
});

// ── SR-5 (B-721) — the client consumption of SR-4's payload ───────────────────
describe('InsightCard — SR-5 med-on-board line (§5.4)', () => {
  const withMed = (over: Partial<CorrelationFinding> = {}) =>
    correlation({ medContext: { drugLabel: 'Apoquel', doseCount: 3 }, ...over });

  it('renders the med line on a correlation carrying medContext', () => {
    const c = anyCached(withMed());
    expect(
      render(<InsightCard cached={c} petName="Nyx" />).queryByText(
        'During an active Apoquel course — 3 doses logged.',
      ),
    ).toBeTruthy();
  });

  it('renders on a timing card too (§5.4)', () => {
    const c = anyCached(postprandial({ medContext: { drugLabel: 'Metronidazole', doseCount: 4 } }));
    expect(
      render(<InsightCard cached={c} petName="Nyx" />).queryByText(
        'During an active Metronidazole course — 4 doses logged.',
      ),
    ).toBeTruthy();
  });

  it('pluralises a single dose (B-733 — doseCount can be 1)', () => {
    const c = anyCached(correlation({ medContext: { drugLabel: 'Apoquel', doseCount: 1 } }));
    expect(
      render(<InsightCard cached={c} petName="Nyx" />).queryByText(
        'During an active Apoquel course — 1 dose logged.',
      ),
    ).toBeTruthy();
  });

  it('drops the line entirely when a "%" in the drug name trips the guardrail (B-733)', () => {
    const c = anyCached(correlation({ medContext: { drugLabel: 'Baytril 2.5%', doseCount: 2 } }));
    const view = render(<InsightCard cached={c} petName="Nyx" />);
    // Fail-quiet: no partial line, no "%", no bare drug name — the whole line is dropped.
    expect(view.queryByText(/Baytril/)).toBeNull();
    expect(view.queryByText(/active .* course/)).toBeNull();
  });

  it('folds the med line into the card a11y label so VoiceOver hears it', () => {
    const c = anyCached(withMed(), 'Chicken tends to precede vomiting.');
    expect(
      render(<InsightCard cached={c} petName="Nyx" />).queryByLabelText(
        /During an active Apoquel course — 3 doses logged\./,
        { exact: false },
      ),
    ).toBeTruthy();
  });

  it('shows no med line on a reflection or a safety card (only correlation + timing carry it)', () => {
    const refl = anyCached(reflection());
    const safety = anyCached(worsening());
    expect(render(<InsightCard cached={refl} petName="Nyx" />).queryByText(/active .* course/)).toBeNull();
    expect(render(<InsightCard cached={safety} petName="Nyx" />).queryByText(/active .* course/)).toBeNull();
  });
});

describe('InsightCard — SR-5 reflection density + trial adjacency (§3.3 / §3.4)', () => {
  const comparable = { comparable: true, currentLoggingDays: 6, priorLoggingDays: 5 } as const;
  const incomparable = { comparable: false, currentLoggingDays: 2, priorLoggingDays: 6 } as const;
  const falling = (over: Partial<ReflectionFinding> = {}) =>
    reflection({ direction: 'improving', currentCount: 2, priorCount: 5, ...over });

  it('the expand shows the disclosure line for a COMPARABLE falling reflection', () => {
    const view = render(<InsightCard cached={anyCached(falling({ density: comparable }))} petName="Nyx" />);
    fireEvent.press(view.getByTestId('insight-face'));
    expect(view.queryByText('Counted honestly')).toBeTruthy();
    expect(view.queryByText('Counted from days you logged: 6 this week, 5 last.')).toBeTruthy();
  });

  it('the expand shows the WITHHELD line for a NOT-comparable falling reflection, and the FACE drops the pair', () => {
    const view = render(<InsightCard cached={anyCached(falling({ density: incomparable }))} petName="Nyx" />);
    // Card FACE: the sample line withholds the incomparable "5 last week" (§3.3 coherence).
    expect(view.queryByText('2 episodes this week')).toBeTruthy();
    expect(view.queryByText(/5 last week/)).toBeNull();
    // Expand: the reworded withheld line, grounded in logged days (B-733).
    fireEvent.press(view.getByTestId('insight-face'));
    expect(view.queryByText(/fewer logged days can look like fewer episodes/)).toBeTruthy();
  });

  it('appends the trial adjacency in the expand when a trial is running (falling)', () => {
    const view = render(
      <InsightCard cached={anyCached(falling({ density: comparable }))} petName="Nyx" trialRunning />,
    );
    fireEvent.press(view.getByTestId('insight-face'));
    expect(view.queryByText(/isn't the trial's verdict — the full run is what makes it readable/)).toBeTruthy();
  });

  it('renders BOTH the withheld line and the trial adjacency in one box when density fell during a trial', () => {
    const view = render(
      <InsightCard cached={anyCached(falling({ density: incomparable }))} petName="Nyx" trialRunning />,
    );
    fireEvent.press(view.getByTestId('insight-face'));
    expect(view.queryByText('Counted honestly')).toBeTruthy();
    expect(view.queryByText(/fewer logged days can look like fewer episodes/)).toBeTruthy();
    expect(view.queryByText(/isn't the trial's verdict/)).toBeTruthy();
    expect(view.queryByText('2 episodes this week')).toBeTruthy();
    expect(view.queryByText(/5 last week/)).toBeNull();
  });

  it('shows NO adjacency for a FLAT reflection even with a trial running', () => {
    const flat = anyCached(reflection({ direction: 'flat', currentCount: 4, priorCount: 4, density: comparable }));
    const view = render(<InsightCard cached={flat} petName="Nyx" trialRunning />);
    fireEvent.press(view.getByTestId('insight-face'));
    expect(view.queryByText(/isn't the trial's verdict/)).toBeNull();
    expect(view.queryByText('Counted honestly')).toBeNull();
  });

  it('an old cached falling reflection (no density) still gets the adjacency when a trial runs', () => {
    const view = render(<InsightCard cached={anyCached(falling())} petName="Nyx" trialRunning />);
    fireEvent.press(view.getByTestId('insight-face'));
    expect(view.queryByText(/isn't the trial's verdict/)).toBeTruthy();
    // …but no density line (nothing to disclose).
    expect(view.queryByText(/Counted from days you logged/)).toBeNull();
  });
});

// ── CUL-12 (Signals v2) — the A2 timing card (GA'd, renders on payload presence) ──
describe('InsightCard — CUL-12 A2 timing card', () => {
  it('draws the three-band face (each count printed — S2), badge + sample', () => {
    const c = anyCached(timingStory(), 'Her vomiting keeps two kinds of time.');
    const view = render(<InsightCard cached={c} petName="Nyx" />);
    expect(view.queryByText('Her vomiting keeps two kinds of time.')).toBeTruthy();
    // The three time-ordered bands, each label anchored to its boundary.
    expect(view.queryByText('Within 30 min of eating')).toBeTruthy();
    expect(view.queryByText('30 min to 6h after eating')).toBeTruthy();
    expect(view.queryByText('6h or more after eating')).toBeTruthy();
    // The meta row: badge + honest-denominator sample.
    expect(view.queryByText('Timing pattern')).toBeTruthy();
    expect(view.queryByText('20 timed of 26 episodes · 60 days')).toBeTruthy();
  });

  it("folds the three-band compare into the card's OWN a11y label (the strip Views are decorative)", () => {
    const finding = timingStory();
    const c = anyCached(finding, 'Her vomiting keeps two kinds of time.');
    const label = stackedCompareA11yLabel(timingStoryBandRows(finding));
    expect(render(<InsightCard cached={c} petName="Nyx" />).queryByLabelText(label, { exact: false })).toBeTruthy();
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
    const view = render(<InsightCard cached={c} petName="Nyx" />);
    fireEvent.press(view.getByTestId('insight-face'));
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
    const view = render(<InsightCard cached={c} petName="Nyx" />);
    fireEvent.press(view.getByTestId('insight-face'));
    expect(view.queryByText('During an active Metronidazole course — 4 doses logged.')).toBeTruthy();
    expect(view.queryByText('What the photos showed')).toBeTruthy();
    expect(view.queryByText('Recognizable food 6h or more after eating: 3 of 5 photos we could read.')).toBeTruthy();
    expect(view.queryByText('Hair: 2 of 6 photos we could read.')).toBeTruthy();
  });

  it('a lone empty-stomach card renders its own face + expand (no rapid phenotype)', () => {
    const c = anyCached(emptyStomach(), '7 of the 12 episodes we could time came 6 or more hours after eating.');
    const view = render(<InsightCard cached={c} petName="Nyx" />);
    expect(view.queryByText('Timing pattern')).toBeTruthy();
    expect(view.queryByText('12 timed of 15 episodes · 60 days')).toBeTruthy();
    fireEvent.press(view.getByTestId('insight-face'));
    expect(view.queryByText('By clock')).toBeTruthy();
  });

  it('a story card with no clock band draws the meal lane but no clock lane', () => {
    const noClock = emptyStomach({ clockBand: undefined, clockCount: undefined });
    const view = render(<InsightCard cached={anyCached(noClock)} petName="Nyx" />);
    fireEvent.press(view.getByTestId('insight-face'));
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
    const view = render(<InsightCard cached={anyCached(dense)} petName="Nyx" />);
    // Face still shows the compare (each band still legible as a proportional bar).
    expect(view.queryByText('Within 30 min of eating')).toBeTruthy();
    fireEvent.press(view.getByTestId('insight-face'));
    expect(view.queryByText('After eating')).toBeNull(); // meal lane omitted (40 > cap)
    expect(view.queryByText('By clock')).toBeTruthy(); // clock lane kept (7 ≤ cap)
    // The clustering fact survives in text even where the lane is dropped — the for-your-vet relay.
    expect(view.queryByText(/early-morning timing is worth flagging/)).toBeTruthy();
  });

  it('drops the "When they happen" box entirely when BOTH lanes exceed the cap', () => {
    const veryDense = timingStory({
      bandCounts: { rapid: 20, mid: 10, long: 20 },
      eligibleCount: 50,
      totalEpisodes: 52,
      long: { count: 20, medianHoursSinceFeeding: 9, lastTwoEligible: false, feedingFormsInEvidence: [], clockBand: { startLocalHour: 2, windowHours: 6 }, clockCount: 15 },
    });
    const view = render(<InsightCard cached={anyCached(veryDense)} petName="Nyx" />);
    fireEvent.press(view.getByTestId('insight-face'));
    expect(view.queryByText('When they happen')).toBeNull();
    expect(view.queryByText('After eating')).toBeNull();
    expect(view.queryByText('By clock')).toBeNull();
    // The for-your-vet relay still carries the clustering in words.
    expect(view.queryByText(/early-morning timing is worth flagging/)).toBeTruthy();
  });
});

// The trial card (CUL-13) — GA'd (renders on payload presence): the server lead + the two
// two-sided count rows + the day badge, and an expand with the RTM/confound honesty +
// adjacency + density + diet-structure.
describe('InsightCard — CUL-13 trial card', () => {
  const LEAD =
    "We've logged 4 episodes of vomiting for Nyx in the 20 days since the trial began, compared with 20 across the 7 weeks before it — worth reviewing with your vet.";

  it('draws the server lead + the two two-sided count rows + the day badge + sample', () => {
    const c = anyCached(trialResponse(), LEAD);
    const view = render(<InsightCard cached={c} petName="Nyx" />);
    expect(view.queryByText(LEAD)).toBeTruthy();
    // Time-ordered rows: rapid first, then long. Labels are the mechanism-free band labels (never
    // "empty stomach"), identical to the A2 timing card.
    expect(view.queryByText('Within 30 min of eating')).toBeTruthy();
    expect(view.queryByText('6h or more after eating')).toBeTruthy();
    // Two-sided counts ("4 · was 8", "0 · was 7") — G2. The lead + baseline render in one Text node,
    // so match the fragment.
    expect(view.queryByText('was 8', { exact: false })).toBeTruthy();
    expect(view.queryByText('was 7', { exact: false })).toBeTruthy();
    // Meta row: the day badge + the C5 sample line.
    expect(view.queryByText('Day 20 of 56')).toBeTruthy();
    expect(view.queryByText('counted from days you logged')).toBeTruthy();
  });

  it("folds the count rows + day badge into the card's OWN a11y label", () => {
    const finding = trialResponse();
    const c = anyCached(finding, LEAD);
    const rows = stackedCompareA11yLabel(trialResponseCompareRows(finding));
    const on = render(<InsightCard cached={c} petName="Nyx" />);
    expect(on.queryByLabelText(rows, { exact: false })).toBeTruthy();
    expect(on.queryByLabelText('Day 20 of 56', { exact: false })).toBeTruthy();
  });

  it('the expand draws the RTM/confound honesty, the §3.4 adjacency, and the density + diet-structure', () => {
    const c = anyCached(trialResponse(), LEAD);
    const view = render(<InsightCard cached={c} petName="Nyx" />);
    fireEvent.press(view.getByTestId('insight-face'));
    expect(view.queryByText('Reading this stretch honestly')).toBeTruthy();
    expect(view.queryByText(/Three things changed at once when the trial started/)).toBeTruthy();
    expect(view.queryByText(/isn't the trial's verdict/)).toBeTruthy();
    expect(view.queryByText('What else changed')).toBeTruthy();
    // Diet-structure in WORDS (no "%"): treat share (most → a few) + meals/day (2 → 4).
    expect(view.queryByText(/Treats went from most of the feedings to a few/)).toBeTruthy();
    expect(view.queryByText(/Meals a day went from about 2 to about 4/)).toBeTruthy();
    // Density disclosure names the logged-days denominators.
    expect(view.queryByText(/Counted from the days you logged — 18 days during the trial, 40 in the 7 weeks before/)).toBeTruthy();
  });

  it('discloses uneven logging when densityComparable is false (a more-during-trial card)', () => {
    const c = anyCached(
      trialResponse({ comparisonDirection: 'more_during_trial', densityComparable: false, rapid: { trial: 8, baseline: 2 }, long: { trial: 2, baseline: 1 } }),
      'A more sentence.',
    );
    const view = render(<InsightCard cached={c} petName="Nyx" />);
    fireEvent.press(view.getByTestId('insight-face'));
    expect(view.queryByText(/read the counts as a rough comparison/)).toBeTruthy();
  });

  it('omits the fewer-specific "calmer/quieter" RTM box on a more-during-trial card, keeps "What else changed"', () => {
    // The RTM/adjacency wording ("A calmer stretch…", "A quieter week…") contradicts a rising record,
    // so it renders only on a fewer card. The direction-neutral diet-structure box still shows.
    const c = anyCached(
      trialResponse({ comparisonDirection: 'more_during_trial', rapid: { trial: 8, baseline: 2 }, long: { trial: 2, baseline: 1 } }),
      'A more sentence.',
    );
    const view = render(<InsightCard cached={c} petName="Nyx" />);
    fireEvent.press(view.getByTestId('insight-face'));
    expect(view.queryByText('Reading this stretch honestly')).toBeNull();
    expect(view.queryByText(/Three things changed at once/)).toBeNull();
    expect(view.queryByText(/isn't the trial's verdict/)).toBeNull();
    // Direction-neutral confound context still renders.
    expect(view.queryByText('What else changed')).toBeTruthy();
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
    // A synthetic type with no registered renderer — deliberately NOT a real lane name. The
    // G10 contract under test is "registry lookup fails → null", not any particular name, so a
    // sentinel keeps this pinned no matter which real lanes gain client renderers.
    type: '__unrendered_future_lane__',
    priorityClass: 'insight',
  } as unknown as CachedFinding['finding'];

  it('renders nothing (null) for a finding type with no registered renderer', () => {
    const c: CachedFinding = {
      rank: 0,
      text: 'A future lane this client build cannot yet draw.',
      finding: unknownFinding,
    };
    expect(render(<InsightCard cached={c} petName="Nyx" />).toJSON()).toBeNull();
  });

  it('POSITIVE CONTROL: a known finding type still renders (the guard is not "null for everything")', () => {
    expect(render(<InsightCard cached={cached(correlation())} petName="Nyx" />).toJSON()).not.toBeNull();
  });
});

describe('InsightCard — the counted 4-week compare inside the chronicity card (v1.1-b, CUL-787)', () => {
  const falling = { halfDays: 28, recentCount: 2, priorCount: 12, recentLoggingDays: 27, priorLoggingDays: 28, comparable: true } as const;
  const rising = { halfDays: 28, recentCount: 9, priorCount: 0, recentLoggingDays: 26, priorLoggingDays: 0, comparable: true } as const;

  it('the FACE carries nothing from the compare — the label is exactly the sentence (S1 / §3.5)', () => {
    const c = anyCached(chronicity({ compare: falling }));
    const view = render(<InsightCard cached={c} petName="Nyx" />);
    expect(a11yLabelOf(<InsightCard cached={c} petName="Nyx" />)).toBe(c.text);
    expect(view.queryByText('Recent 4 weeks')).toBeNull();
    expect(view.queryByText('Counted honestly')).toBeNull();
  });

  it('the expand draws the compare box ABOVE the phone script, with the clause, on a falling pair', () => {
    const view = render(<InsightCard cached={anyCached(chronicity({ compare: falling }))} petName="Nyx" />);
    fireEvent.press(view.getByTestId('insight-face'));
    expect(view.queryByText('Counted honestly')).toBeTruthy();
    expect(view.queryByText('Recent 4 weeks')).toBeTruthy();
    expect(view.queryByText('The 4 before')).toBeTruthy();
    expect(view.queryByText('Counted from days you logged: 27 in the recent 4 weeks, 28 in the 4 before.')).toBeTruthy();
    expect(view.queryByText(/Fewer lately doesn't change the ask/)).toBeTruthy();
    expect(view.queryByText('If you call your clinic, the facts to have ready')).toBeTruthy();
    // The script row renders label + value as ONE text node ("Recent 4 weeks: 2 · …"), so match the value within it.
    expect(view.queryByText(/Recent 4 weeks: 2 · the 4 before: 12 · logged on 27 and 28 of those days/)).toBeTruthy();
  });

  it('a RISING pair draws the compare and the script row but never the clause', () => {
    const view = render(<InsightCard cached={anyCached(chronicity({ compare: rising }))} petName="Nyx" />);
    fireEvent.press(view.getByTestId('insight-face'));
    expect(view.queryByText('Counted honestly')).toBeTruthy();
    expect(view.queryByText(/Fewer lately doesn't change the ask/)).toBeNull();
    expect(view.queryByText(/Recent 4 weeks: 9 · the 4 before: 0 · logged on 26 and 0 of those days/)).toBeTruthy();
  });

  it('a thin-logged falling pair keeps both counts and swaps in the withheld line', () => {
    const thin = { ...falling, recentLoggingDays: 10, comparable: false };
    const view = render(<InsightCard cached={anyCached(chronicity({ compare: thin }))} petName="Nyx" />);
    fireEvent.press(view.getByTestId('insight-face'));
    expect(view.queryByText(/so a lower count there can be fewer logs, not fewer episodes/)).toBeTruthy();
    expect(view.queryByText(/Fewer lately doesn't change the ask/)).toBeTruthy();
    expect(view.queryByText('The 4 before')).toBeTruthy();
  });

  it('an old cache (no compare) renders the pre-v1.1-b expand: the script alone', () => {
    const view = render(<InsightCard cached={anyCached(chronicity())} petName="Nyx" />);
    fireEvent.press(view.getByTestId('insight-face'));
    expect(view.queryByText('If you call your clinic, the facts to have ready')).toBeTruthy();
    expect(view.queryByText('Counted honestly')).toBeNull();
    expect(view.queryByText(/Recent 4 weeks/)).toBeNull();
  });
});
