// B-417 PR 6 — the completion sheets, rendered (§4.3).
//
// The pure module's test owns the copy and the arithmetic. This one owns the two
// things only a rendered tree can answer:
//   • the outcome sheet puts the DATA above the QUESTION — a criterion about
//     ORDER, which a model test cannot see;
//   • a live intake-decline flag REPLACES the counts rather than sitting beside
//     them, which is a rendering decision the model only supplies the input for.
//
// jest hoists jest.mock() above the imports, so anything a factory closes over
// must be `mock`-prefixed.

const mockEndActiveTrial = jest.fn().mockResolvedValue(undefined);
jest.mock('../../lib/dietTrialSetup', () => ({
  endActiveTrial: (...args: unknown[]) => mockEndActiveTrial(...args),
}));

const mockLoadFacts = jest.fn();
jest.mock('../../lib/dietTrialOutcomeFacts', () => ({
  loadTrialOutcomeFacts: (...args: unknown[]) => mockLoadFacts(...args),
}));

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { TrialCompletionSheet } from './TrialCompletionSheet';
import type { TrialOutcomeFacts } from '../../lib/dietTrialCompletion';

const TRIAL = {
  id: 't-1',
  petId: 'pet-1',
  startedAt: '2026-07-03',
  targetDurationDays: 56,
  indication: 'skin' as const,
};

const FACTS: TrialOutcomeFacts = {
  duringDays: 56,
  beforeDays: 56,
  beforeTracked: true,
  symptoms: [{ symptomType: 'itch', label: 'Itch/Scratch', before: 14, during: 3 }],
  meals: { before: { daysLogged: 41, days: 56 }, during: { daysLogged: 52, days: 56 } },
};

function renderSheet(props: Partial<React.ComponentProps<typeof TrialCompletionSheet>> = {}) {
  return render(
    <TrialCompletionSheet
      entry="complete"
      trial={TRIAL}
      petName="Biscuit"
      pronouns={{ object: 'him', possessive: 'his' }}
      dayCounter={56}
      onClose={jest.fn()}
      onExtend={jest.fn()}
      onChanged={jest.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  mockEndActiveTrial.mockClear();
  mockLoadFacts.mockReset().mockResolvedValue(FACTS);
});

describe('the outcome sheet', () => {
  it('renders the counts ABOVE the question (§4.3 — the data leads)', async () => {
    const tree = renderSheet();
    await waitFor(() => tree.getByTestId('trial-outcome-density'));

    // Order, in the rendered tree. Round 2 asked for the verdict with none of the
    // data on screen; the ruling was that the sheet opens with the counts and only
    // then asks for the owner's read.
    const texts = tree.root
      .findAllByType(require('react-native').Text)
      .map((n: { props: { children: unknown } }) => String(n.props.children));
    const factAt = texts.findIndex((t: string) => t.includes('Itch/Scratch: 14 before · 3 during.'));
    const densityAt = texts.findIndex((t: string) => t.startsWith('Meals logged:'));
    const questionAt = texts.findIndex((t: string) => t.includes('Does that match what you’ve seen?'));

    expect(factAt).toBeGreaterThanOrEqual(0);
    expect(densityAt).toBeGreaterThan(factAt);
    expect(questionAt).toBeGreaterThan(densityAt);
  });

  it('always renders the C5 density line', async () => {
    const tree = renderSheet();
    const density = await waitFor(() => tree.getByTestId('trial-outcome-density'));
    expect(String(density.props.children)).toContain(
      'Meals logged: 41 of 56 days before, 52 of 56 during.',
    );
  });

  it('records the owner’s read as owner-reported, on a COMPLETED trial', async () => {
    const onChanged = jest.fn();
    const tree = renderSheet({ onChanged });
    await waitFor(() => tree.getByTestId('trial-outcome-improved'));

    fireEvent.press(tree.getByTestId('trial-outcome-improved'));
    await act(async () => { fireEvent.press(tree.getByText('Save')); });

    expect(mockEndActiveTrial).toHaveBeenCalledWith(
      expect.objectContaining({ trialId: 't-1', reason: 'completed', outcome: 'improved' }),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it('saves without a read — the counts are the record, the verdict is optional', async () => {
    const tree = renderSheet();
    await waitFor(() => tree.getByText('Save'));
    await act(async () => { fireEvent.press(tree.getByText('Save')); });
    expect(mockEndActiveTrial).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'completed', outcome: null }),
    );
  });

  it('lets a live intake-decline flag REPLACE the counts', async () => {
    const tree = renderSheet({
      petName: 'Mochi',
      intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
    });
    await waitFor(() => tree.getByTestId('trial-outcome-decline'));

    // §5.2's composition, on a terminal surface. The animal outranks the trial:
    // a symptom tally about the last eight weeks must not render over a pet that
    // has stopped eating NOW.
    expect(tree.queryAllByTestId('trial-outcome-fact')).toHaveLength(0);
    expect(tree.queryByTestId('trial-outcome-density')).toBeNull();
    // The question still stands — it is the one thing the counts cannot supply.
    expect(tree.getByText('Does that match what you’ve seen?')).toBeTruthy();
  });

  it('asks the question anyway when the counts cannot be read', async () => {
    mockLoadFacts.mockResolvedValueOnce(null);
    const tree = renderSheet();
    await waitFor(() => tree.getByText('How did it go?'));
    // Inventing counts on the screen where an owner decides what the trial meant
    // would be far worse than having none.
    expect(tree.queryAllByTestId('trial-outcome-fact')).toHaveLength(0);
    expect(tree.getByTestId('trial-outcome-worse')).toBeTruthy();
  });
});

describe('the stopped-early sheet', () => {
  it('records the reason and NEVER an outcome (§4.3’s refusal rule)', async () => {
    const tree = renderSheet({ entry: 'stopped_early' });
    fireEvent.press(tree.getByTestId('trial-stop-refused'));
    await act(async () => { fireEvent.press(tree.getByText('Save')); });

    expect(mockEndActiveTrial).toHaveBeenCalledWith(
      expect.objectContaining({ trialId: 't-1', reason: 'refused', outcome: null }),
    );
    // The sheet never asks how it went, so there is no verdict to attach.
    expect(tree.queryByText('Does that match what you’ve seen?')).toBeNull();
  });

  it('surfaces the health-lane line under a refusal', () => {
    const tree = renderSheet({ entry: 'stopped_early' });
    expect(tree.queryByTestId('trial-stop-note-refused')).toBeNull();
    fireEvent.press(tree.getByTestId('trial-stop-refused'));
    expect(
      String(tree.getByTestId('trial-stop-note-refused').props.children),
    ).toContain('health question');
  });

  it('cannot save without a reason — the reason is the whole point', () => {
    const tree = renderSheet({ entry: 'stopped_early' });
    fireEvent.press(tree.getByText('Save'));
    expect(mockEndActiveTrial).not.toHaveBeenCalled();
  });

  it('never reads the counts — an owner who stops early is not asked how it went', () => {
    renderSheet({ entry: 'stopped_early' });
    expect(mockLoadFacts).not.toHaveBeenCalled();
  });
});

describe('the decision step (the overrun entry)', () => {
  it('offers the same three choices, `Keep going` first and filled', () => {
    const tree = renderSheet({ entry: 'decision', dayCounter: 61 });
    expect(tree.getByTestId('trial-decision-extend')).toBeTruthy();
    expect(tree.getByText('Keep going — 4 more weeks')).toBeTruthy();
    expect(tree.getByText('This trial is done')).toBeTruthy();
    expect(tree.getByText('Stopped early')).toBeTruthy();
  });

  it('delegates `Keep going` to the host — one extension implementation', () => {
    const onExtend = jest.fn();
    const tree = renderSheet({ entry: 'decision', dayCounter: 61, onExtend });
    fireEvent.press(tree.getByTestId('trial-decision-extend'));
    expect(onExtend).toHaveBeenCalled();
    // The sheet must not end the trial on its way out.
    expect(mockEndActiveTrial).not.toHaveBeenCalled();
  });

  it('routes the other two into their sheets', async () => {
    const tree = renderSheet({ entry: 'decision', dayCounter: 61 });
    fireEvent.press(tree.getByTestId('trial-decision-stopped_early'));
    expect(tree.getByText('What got in the way?')).toBeTruthy();
  });
});
