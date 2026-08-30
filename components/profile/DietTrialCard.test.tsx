// The card's own criterion: "any progress bar encodes getDietTrialProgress().
// fraction and nothing else, ASSERTED ON THE COMPUTED WIDTH PROP, not on the
// absence of a word" (§12, PR 4).
//
// That wording is not pedantry. `profile.tsx:770` bound the bar's width to a "%
// compliance" that measured logging, so an owner on day 2 of a 56-day skin trial
// who logged both days saw a nearly-full bar reading "almost done" at 3.5%
// elapsed. The deleted bar and the kept bar are visually IDENTICAL on a good
// week — so v0.9's criterion ("the string 'compliance' appears nowhere on the
// card") would have passed the more misleading of the two artifacts.
jest.mock('../../lib/feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));

import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';
import { DietTrialCard } from './DietTrialCard';
import { resolveTrialCard, type TrialCardInput } from '../../lib/dietTrialCard';
import { getDietTrialProgress } from '../../lib/analytics';
import { theme } from '../../constants/theme';

const FOOD = 'Zignature Kangaroo Formula';

function localNoon(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

function input(over: Partial<TrialCardInput> = {}): TrialCardInput {
  return {
    trial: {
      status: 'active',
      startedAt: '2026-07-03',
      targetDurationDays: 56,
      foodLabel: FOOD,
    },
    nowMs: localNoon(2026, 7, 25),
    petName: 'Biscuit',
    species: 'dog',
    coverage: { daysLogged: 22, daysElapsed: 23 },
    exposures: { mayStateRecordClean: true, totalFeedings: 68, offDiet: 0 },
    ...over,
  };
}

/** The rendered width, as a number of percent. */
function fillWidth(tree: ReturnType<typeof render>): number {
  const flat = StyleSheet.flatten(tree.getByTestId('trial-progress-fill').props.style) as {
    width: string;
  };
  expect(typeof flat.width).toBe('string');
  return Number(flat.width.replace('%', ''));
}

describe('the progress bar encodes DAY progress and nothing else', () => {
  it('binds the width to getDietTrialProgress().fraction', () => {
    const i = input();
    const tree = render(<DietTrialCard model={resolveTrialCard(i)} />);
    const expected = getDietTrialProgress(
      { startedAt: '2026-07-03', targetDurationDays: 56 },
      i.nowMs,
    )!.fraction;
    expect(fillWidth(tree)).toBeCloseTo(expected * 100, 6);
    expect(fillWidth(tree)).toBeCloseTo((23 / 56) * 100, 6);
  });

  // THE REGRESSION. Day 2 of 56 with both days logged is 100% coverage and a
  // 3.5%-elapsed window. The shipped bar rendered ~100% wide; this one renders
  // ~3.6%, and the two differ ONLY here.
  it('renders ~3.6% on day 2 of 56, not the ~100% the deleted bar rendered', () => {
    const tree = render(<DietTrialCard model={resolveTrialCard(input({
      nowMs: localNoon(2026, 7, 4),
      coverage: { daysLogged: 2, daysElapsed: 2 },
      exposures: { mayStateRecordClean: true, totalFeedings: 4, offDiet: 0 },
    }))} />);
    expect(fillWidth(tree)).toBeCloseTo((2 / 56) * 100, 6);
    expect(fillWidth(tree)).toBeLessThan(5);
  });

  // Coverage moving must not move the bar. This is the property the string-only
  // criterion could not express: the bar is INDEPENDENT of record quality.
  it('is unchanged when coverage and exposures change', () => {
    const perfect = render(<DietTrialCard model={resolveTrialCard(input({
      coverage: { daysLogged: 23, daysElapsed: 23 },
      exposures: { mayStateRecordClean: true, totalFeedings: 68, offDiet: 0 },
    }))} />);
    const poor = render(<DietTrialCard model={resolveTrialCard(input({
      coverage: { daysLogged: 3, daysElapsed: 23 },
      exposures: { mayStateRecordClean: true, totalFeedings: 9, offDiet: 7 },
    }))} />);
    expect(fillWidth(perfect)).toBeCloseTo(fillWidth(poor), 10);
  });

  it('clamps at 100% past the window rather than overflowing', () => {
    const tree = render(<DietTrialCard model={resolveTrialCard(input({
      nowMs: localNoon(2026, 9, 1),
    }))} />);
    expect(fillWidth(tree)).toBe(100);
  });

  it('draws no bar at all on a finished trial', () => {
    const tree = render(<DietTrialCard model={resolveTrialCard(input({
      trial: {
        status: 'completed', startedAt: '2026-07-03', endedAt: '2026-08-27',
        targetDurationDays: 56, foodLabel: FOOD, outcome: 'improved',
      },
    }))} />);
    expect(tree.queryByTestId('trial-progress-fill')).toBeNull();
  });
});

describe('what the card renders', () => {
  it('renders the coverage and exposure sentences as separate lines', () => {
    const tree = render(<DietTrialCard model={resolveTrialCard(input())} />);
    const facts = tree.getAllByTestId('trial-line-fact').map((n) => n.props.children);
    expect(facts).toEqual([
      'Meals logged on 22 of 23 days.',
      '68 feedings in total — all 68 matched the trial diet or a permitted food.',
    ]);
  });

  it('re-sites the C2 standing note rather than dropping it', () => {
    const tree = render(<DietTrialCard model={resolveTrialCard(input({
      standingNote: {
        title: 'About this food',
        body: 'It’s an over-the-counter limited-ingredient diet.',
      },
    }))} />);
    expect(tree.getByText('About this food')).toBeTruthy();
    expect(tree.getByText('It’s an over-the-counter limited-ingredient diet.')).toBeTruthy();
  });

  // §4.2: "Logging is the FAB. A second door to the same room is not a feature."
  it('carries no "Log a meal" action in any state', () => {
    for (const i of [
      input(),
      input({ trial: null }),
      input({ nowMs: localNoon(2026, 9, 1) }),
      input({ belowCoverageFloor: true }),
      input({ intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.' }),
    ]) {
      const tree = render(<DietTrialCard model={resolveTrialCard(i)} />);
      expect(tree.queryByText(/log a meal/i)).toBeNull();
      expect(tree.queryByText(/^log /i)).toBeNull();
    }
  });

  it('renders no percentage anywhere on screen', () => {
    const tree = render(<DietTrialCard model={resolveTrialCard(input({
      exposures: { mayStateRecordClean: true, totalFeedings: 68, offDiet: 3 },
    }))} />);
    expect(tree.queryByText(/%/)).toBeNull();
    expect(tree.queryByText(/compliance/i)).toBeNull();
  });
});

// The seam B-417 PR 3 and PR 4 meet at. PR 3 shipped the modal and its own
// state-0 markup; PR 4 folded that markup into this one card. §4.1 D5 makes this
// the ONLY way into starting a trial — no menu item, no second path — so if the
// card stops offering it, the feature has no entry point at all.
describe('the entry point to PR 3’s start-a-trial modal', () => {
  it('renders the empty state with the design-locked copy', () => {
    const tree = render(
      <DietTrialCard
        model={resolveTrialCard({ ...input(), trial: null, petObjectPronoun: 'him' })}
        actions={{ start_trial: jest.fn() }}
      />,
    );
    expect(tree.getByText('No trial running.')).toBeTruthy();
    expect(tree.getByText(
      'If Biscuit’s vet has put him on an elimination diet, tell Culprit — it keeps ' +
      'the dated record your vet will ask for at the recheck.',
    )).toBeTruthy();
  });

  it('suppresses the header affordance on the empty card and says "Replace" on a running one', () => {
    // no_trial: the body carries "Start a diet trial", so the header manage
    // affordance is suppressed rather than shown as a duplicate "+ Start".
    const empty = render(
      <DietTrialCard model={resolveTrialCard({ ...input(), trial: null })} onManage={jest.fn()} />,
    );
    expect(empty.queryByText('+ Start')).toBeNull();
    expect(empty.queryByText('Change')).toBeNull();

    // A running trial: the header opens the end-and-replace sheet, so it says what
    // it does — "Replace" — never "Change" (which read as an edit).
    const running = render(
      <DietTrialCard model={resolveTrialCard(input())} onManage={jest.fn()} />,
    );
    expect(running.getByText('Replace')).toBeTruthy();
    expect(running.queryByText('Change')).toBeNull();
  });

  it('opens the start modal from the empty card body, and end-and-replace from a running header', () => {
    // The empty card has ONE start door now — the body CTA, not a duplicate header.
    const onStart = jest.fn();
    const empty = render(
      <DietTrialCard
        model={resolveTrialCard({ ...input(), trial: null })}
        actions={{ start_trial: onStart }}
        onManage={jest.fn()}
      />,
    );
    fireEvent.press(empty.getByText('Start a diet trial'));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(empty.queryByText('+ Start')).toBeNull();

    // On a running trial the header "Replace" is the way into end-and-replace.
    const onManage = jest.fn();
    const running = render(
      <DietTrialCard model={resolveTrialCard(input())} onManage={onManage} />,
    );
    fireEvent.press(running.getByText('Replace'));
    expect(onManage).toHaveBeenCalledTimes(1);
  });
});

describe('actions are drawn only when the surface can service them', () => {
  it('draws nothing when no handler is supplied (PR 3 / PR 6 not yet landed)', () => {
    const tree = render(<DietTrialCard model={resolveTrialCard(input({ trial: null }))} />);
    expect(tree.getByText('No trial running.')).toBeTruthy();
    expect(tree.queryByText('Start a diet trial')).toBeNull();
  });

  it('draws the start action once a handler exists', () => {
    const onStart = jest.fn();
    const tree = render(
      <DietTrialCard
        model={resolveTrialCard(input({ trial: null }))}
        actions={{ start_trial: onStart }}
      />,
    );
    expect(tree.getByText('Start a diet trial')).toBeTruthy();
  });

  it('does not draw an unrelated action for a state that declares another', () => {
    const tree = render(
      <DietTrialCard
        model={resolveTrialCard(input({ nowMs: localNoon(2026, 8, 27) }))}
        actions={{ start_trial: jest.fn() }}
      />,
    );
    // State 5 declares `milestone`; only a `milestone` handler may draw it.
    expect(tree.queryByText(/Tell Culprit what’s next/)).toBeNull();
  });
});

// ── B-533 — the safety register renders as one block, not as body text ──────
//
// The `flag` role is a BLOCK: a headline and its body inside one tinted
// container. Drawing each line in its own container would make one safety
// statement look like two. The shipped intake-decline state was rendering in
// ordinary body weight, so the one composition §5.2 makes structural was the
// quietest thing on the card.
describe('the safety register renders as one block, not as body text', () => {
  it('draws the decline headline and its body inside ONE tinted container', () => {
    const tree = render(
      <DietTrialCard
        model={resolveTrialCard(input({
          species: 'cat',
          petName: 'Mochi',
          intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
        }))}
      />,
    );
    expect(tree.getAllByTestId('trial-flag')).toHaveLength(1);
    expect(tree.getAllByTestId('trial-line-flag')).toHaveLength(2);
    const tint = StyleSheet.flatten(tree.getByTestId('trial-flag').props.style) as {
      backgroundColor?: string;
    };
    expect(tint.backgroundColor).toBe(theme.colorEventSymptomLight);
  });

  // NO COLOUR-ONLY MEANING: the headline carries the fact in words, so the block
  // survives greyscale and reaches a screen reader in the same order.
  it('says the fact in words rather than in the tint', () => {
    const tree = render(
      <DietTrialCard
        model={resolveTrialCard(input({
          species: 'cat',
          petName: 'Mochi',
          intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
        }))}
      />,
    );
    expect(tree.getByText(/left most of her food for 3 days/)).toBeTruthy();
  });
});

// CUL-170 — the Pet tab measures this card's top to land the Home/recap trial strip
// on it. A passthrough rather than a wrapper View at the call site, so the anchor
// cannot move the thing it is measuring; that only holds if it reaches the Card.
describe('the scroll anchor (CUL-170)', () => {
  it('forwards onLayout to the card itself, so the measured top IS the card top', () => {
    const onLayout = jest.fn();
    const tree = render(<DietTrialCard model={resolveTrialCard(input())} onLayout={onLayout} />);
    // The outermost host view IS the Card — there is no wrapper between them, which
    // is the property under test as much as the callback firing.
    const root = tree.UNSAFE_getByType(View);
    expect(root.props.onLayout).toBe(onLayout);
  });
});
