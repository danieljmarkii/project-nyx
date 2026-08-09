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
import { dotLaneA11yLabel } from '../../lib/signalCopy';
import type {
  CachedFinding,
  CorrelationFinding,
  PostprandialTimingFinding,
  ReflectionFinding,
  SymptomWorseningFinding,
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
