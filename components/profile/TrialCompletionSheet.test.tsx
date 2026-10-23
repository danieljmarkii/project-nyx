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
// The real module's imports reach the network client; the read and the sync are
// stubbed so `requireActual` below loads the pure half (the StartTrialModal precedent).
jest.mock('../../lib/db', () => ({ getDb: jest.fn() }));
jest.mock('../../lib/sync', () => ({
  syncPendingDietTrials: jest.fn().mockResolvedValue(undefined),
  syncPendingDietTrialFoods: jest.fn().mockResolvedValue(undefined),
}));
// The REAL `TrialEndRefused` and `trialEndRefusedNotice` (C-34: the write is what
// needs stubbing, never the rule that decides what the owner is told, CUL-2012).
jest.mock('../../lib/dietTrialSetup', () => {
  const actual = jest.requireActual('../../lib/dietTrialSetup');
  return {
    endActiveTrial: (...args: unknown[]) => mockEndActiveTrial(...args),
    TrialEndRefused: actual.TrialEndRefused,
    trialEndRefusedNotice: actual.trialEndRefusedNotice,
  };
});

const mockLoadFacts = jest.fn();
jest.mock('../../lib/dietTrialOutcomeFacts', () => ({
  loadTrialOutcomeFacts: (...args: unknown[]) => mockLoadFacts(...args),
}));

// Every facts object the sheet BUILT a render from, in order (CUL-1560's test B).
// `rerender` flushes effects inside act, so a stale frame that a passive effect
// clears is invisible to a query; the builder sees every render that painted.
// A passthrough over the real module (C-34): the read is stubbed, never the rule.
const mockBuiltFacts: unknown[] = [];
// Every indication the decision step DREW, in order (CUL-2055): the same reason, for a
// frame a passive effect closes before any query can see it.
const mockDrawnDecisions: unknown[] = [];
jest.mock('../../lib/dietTrialCompletion', () => {
  const actual = jest.requireActual('../../lib/dietTrialCompletion');
  return {
    ...actual,
    buildOutcomeSheet: (args: { facts: unknown }) => {
      mockBuiltFacts.push(args.facts);
      return actual.buildOutcomeSheet(args);
    },
    milestoneNote: (indication: unknown) => {
      mockDrawnDecisions.push(indication);
      return actual.milestoneNote(indication);
    },
  };
});

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, TextInput } from 'react-native';
import { TrialCompletionSheet } from './TrialCompletionSheet';
import { TrialEndRefused } from '../../lib/dietTrialSetup';
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
  beforeLoggedDays: 48,
  duringLoggedDays: 54,
  symptoms: [{ symptomType: 'itch', label: 'Itch/Scratch', before: 14, during: 3 }],
  meals: { before: { daysLogged: 41, days: 56 }, during: { daysLogged: 52, days: 56 } },
};

function renderSheet(props: Partial<React.ComponentProps<typeof TrialCompletionSheet>> = {}) {
  return render(
    <TrialCompletionSheet
      entry="complete"
      trial={TRIAL}
      petName="Biscuit"
      species="cat"
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
  mockEndActiveTrial.mockReset().mockResolvedValue(undefined);
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
    const densityAt = texts.findIndex((t: string) => t.startsWith('Days you logged any food:'));
    const questionAt = texts.findIndex((t: string) => t.includes('Does that match what you’ve seen?'));

    expect(factAt).toBeGreaterThanOrEqual(0);
    expect(densityAt).toBeGreaterThan(factAt);
    expect(questionAt).toBeGreaterThan(densityAt);
  });

  it('always renders the C5 density line', async () => {
    const tree = renderSheet();
    const density = await waitFor(() => tree.getByTestId('trial-outcome-density'));
    expect(String(density.props.children)).toContain(
      'Days you logged any food: 41 of 56 before, 52 of 56 during.',
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

    // The strongest safety sentence in the feature must be ON this screen — the
    // one that ENDS the intervention. PR 6's first cut dropped it here and kept it
    // only on the card, so the terminal surface said less about a cat that had
    // stopped eating than the card said about one skipped dinner. Species-aware:
    // the 48h hepatic-lipidosis window is feline.
    expect(
      String(tree.getByTestId('trial-outcome-decline-note').props.children),
    ).toContain('needs a call today');

    // The question still stands — it is the one thing the counts cannot supply —
    // but it no longer points at counts that are not on screen.
    expect(tree.getByText('How has it seemed to you?')).toBeTruthy();
    expect(tree.queryByText('Does that match what you’ve seen?')).toBeNull();
  });

  it('keeps the decline note firm-not-feline for a dog', async () => {
    const tree = renderSheet({
      species: 'dog',
      intakeDeclineHeadline: 'Biscuit has left most of his food for 3 days.',
    });
    await waitFor(() => tree.getByTestId('trial-outcome-decline-note'));
    const note = String(tree.getByTestId('trial-outcome-decline-note').props.children);
    expect(note).toContain('needs a call');
    expect(note).not.toContain('today');
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

  it('carries the decline sentence on the screen that offers the primary action', () => {
    // F3: this is the one step in the flow that offers `Keep going` as a filled
    // button, and it was the only one not carrying the decline lead — the card
    // before it does and the outcome step after it does.
    const tree = renderSheet({
      entry: 'decision',
      dayCounter: 61,
      intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
    });
    expect(
      String(tree.getByTestId('trial-decision-decline').props.children),
    ).toContain('left most of her food');
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

// CUL-1329 — a stale sheet over a trial that was already ended (on the other host, or
// on another device whose ending has hydrated). The write path refuses; the sheet's
// job is to re-read and get out of the way, never to say "have another go".
describe('an ending the record refused', () => {
  let alert: jest.SpyInstance;
  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alert.mockRestore());

  const notices = () => alert.mock.calls.filter((c) => c[0] === 'Already ended');

  async function saveDone(refusal: InstanceType<typeof TrialEndRefused>) {
    mockEndActiveTrial.mockRejectedValueOnce(refusal);
    const onChanged = jest.fn();
    const onClose = jest.fn();
    const tree = renderSheet({ onChanged, onClose });
    await waitFor(() => tree.getByText('Save'));
    await act(async () => { fireEvent.press(tree.getByText('Save')); });
    // One attempt, never a retry over the first ending; the sheet still re-reads and closes.
    expect(mockEndActiveTrial).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  }

  async function saveStoppedRefused(refusal: InstanceType<typeof TrialEndRefused>) {
    mockEndActiveTrial.mockRejectedValueOnce(refusal);
    const onChanged = jest.fn();
    const onClose = jest.fn();
    const tree = renderSheet({ entry: 'stopped_early', onChanged, onClose });
    fireEvent.press(tree.getByTestId('trial-stop-refused'));
    await act(async () => { fireEvent.press(tree.getByText('Save')); });
    expect(mockEndActiveTrial).toHaveBeenCalledTimes(1);
    expect(mockEndActiveTrial.mock.calls[0][0].reason).toBe('refused');
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  }

  it('not_found: re-reads, closes, and says nothing', async () => {
    await saveDone(new TrialEndRefused({ reason: 'not_found' }));
    expect(alert).not.toHaveBeenCalled();
  });

  it('*This trial is done* over a trial already completed elsewhere: the same answer, so silent', async () => {
    await saveDone(new TrialEndRefused({ reason: 'not_running', status: 'completed', endedOn: '2026-09-20' }));
    expect(alert).not.toHaveBeenCalled();
  });

  // CUL-2035 — phone A ended at the target with no verdict; phone B's owner said
  // "worse" with a note. The reasons match, but the verdict is not on the record.
  it('*This trial is done* with worse and a note over a completion without one: said once, in the outcome variant', async () => {
    mockEndActiveTrial.mockRejectedValueOnce(new TrialEndRefused({
      reason: 'not_running', status: 'completed', endedOn: '2026-09-20', storedOutcome: null, storedOutcomeNotes: null,
    }));
    const onChanged = jest.fn();
    const onClose = jest.fn();
    const tree = renderSheet({ onChanged, onClose });
    await waitFor(() => tree.getByTestId('trial-outcome-worse'));
    fireEvent.press(tree.getByTestId('trial-outcome-worse'));
    fireEvent.changeText(tree.UNSAFE_getAllByType(TextInput)[0], 'vomiting came back in week 6');
    await act(async () => { fireEvent.press(tree.getByText('Save')); });
    expect(mockEndActiveTrial).toHaveBeenCalledTimes(1);
    expect(mockEndActiveTrial.mock.calls[0][0]).toMatchObject({
      reason: 'completed', outcome: 'worse', outcomeNotes: 'vomiting came back in week 6',
    });
    expect(alert).toHaveBeenCalledTimes(1);
    expect(notices()[0][1]).toMatch(
      /^Biscuit’s trial was already ended on another phone, on Sep 20(, 2026)?\. That ending stays on the record, so what you said about how it went wasn’t saved\. You can tell your vet yourself\.$/,
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('*This trial is done* over a trial stopped early elsewhere: said once', async () => {
    await saveDone(new TrialEndRefused({
      reason: 'not_running', status: 'abandoned', endedOn: '2026-09-20', storedReason: 'vet_advised',
    }));
    expect(notices()).toHaveLength(1);
    expect(alert).toHaveBeenCalledTimes(1);
  });

  // CUL-2012's case: the owner says "wouldn't eat it", the record says otherwise, and
  // the vet report keys on the record. Before the fix this closed without a word.
  it('*Stopped early → refused* over a trial completed elsewhere: tells the owner the reason was not saved', async () => {
    await saveStoppedRefused(new TrialEndRefused({ reason: 'not_running', status: 'completed', endedOn: '2026-09-20' }));
    expect(notices()).toHaveLength(1);
    expect(notices()[0][1]).toMatch(
      /^Biscuit’s trial was already ended on another phone, on Sep 20(, 2026)?\. That ending stays on the record, so the reason you gave wasn’t saved\. You can tell your vet yourself\.$/,
    );
  });

  it('*Stopped early → refused* over a refusal already on the record: silent', async () => {
    await saveStoppedRefused(new TrialEndRefused({
      reason: 'not_running', status: 'abandoned', endedOn: '2026-09-20', storedReason: 'refused',
    }));
    expect(alert).not.toHaveBeenCalled();
  });

  it('*Stopped early → refused* with no readable stored reason errs loud', async () => {
    await saveStoppedRefused(new TrialEndRefused({ reason: 'not_running' }));
    expect(notices()).toHaveLength(1);
    expect(notices()[0][1]).toMatch(/^Biscuit’s trial was already ended on another phone\. That ending/);
  });

  it('a genuine failure still says so, and keeps the sheet open', async () => {
    // The refusal branch must not swallow the case the alert is true for.
    mockEndActiveTrial.mockRejectedValueOnce(new Error('SQLITE_BUSY'));
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const onChanged = jest.fn();
    const onClose = jest.fn();
    const tree = renderSheet({ entry: 'stopped_early', onChanged, onClose });
    fireEvent.press(tree.getByTestId('trial-stop-refused'));
    await act(async () => { fireEvent.press(tree.getByText('Save')); });

    expect(alert).toHaveBeenCalledWith('That didn’t save', expect.any(String));
    expect(onChanged).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    err.mockRestore();
  });
});

// CUL-1560 — the host keeps this sheet mounted while it is closed, so a read taken on
// one open must never answer the next. The flow is a likely one ("wait, let me log
// this first"): close, log this morning's vomit, reopen, and the sheet must not say
// "No symptoms are on the record for either stretch."
// CUL-2041 — the same loss as above, one step earlier: another phone's ending
// hydrates while the owner is still entering their answer, and the host's gate takes
// the sheet's trial away before Save. The owner is told, from the newly read row, in
// CUL-2012's own words; nothing is written.
describe('a trial another phone ended while the owner is entering an answer', () => {
  let alert: jest.SpyInstance;
  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alert.mockRestore());

  const COMPLETED_ELSEWHERE = {
    id: 't-1', status: 'completed', endedOn: '2026-09-20',
    stoppedReason: null, outcome: 'improved', outcomeNotes: null,
  };
  const STOPPED_ELSEWHERE = {
    id: 't-1', status: 'abandoned', endedOn: '2026-09-20',
    stoppedReason: 'vet_advised', outcome: null, outcomeNotes: null,
  };

  function host(onClose: jest.Mock, entry: 'complete' | 'stopped_early' = 'complete') {
    return (
      trial: typeof TRIAL | null,
      endedRow: React.ComponentProps<typeof TrialCompletionSheet>['endedRow'] = null,
    ) => (
      <TrialCompletionSheet
        entry={entry}
        trial={trial}
        endedRow={endedRow}
        petName="Biscuit"
        species="cat"
        dayCounter={56}
        onClose={onClose}
        onExtend={jest.fn()}
        onChanged={jest.fn()}
      />
    );
  }

  it('an outcome picked mid-entry: the sheet stays to say it, from the newly read row', async () => {
    const onClose = jest.fn();
    const withTrial = host(onClose);
    const tree = render(withTrial(TRIAL));
    await waitFor(() => tree.getByTestId('trial-outcome-worse'));
    fireEvent.press(tree.getByTestId('trial-outcome-worse'));

    tree.rerender(withTrial(null, COMPLETED_ELSEWHERE));

    expect(tree.getByTestId('trial-lost-notice-title').props.children).toBe('Already ended');
    expect(tree.getByTestId('trial-lost-notice-body').props.children).toMatch(
      /^Biscuit’s trial was already ended on another phone, on Sep 20(, 2026)?\. That ending stays on the record, so what you said about how it went wasn’t saved\. You can tell your vet yourself\.$/,
    );
    // Nothing is written over the first ending, and the sheet waits for the owner.
    expect(mockEndActiveTrial).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();

    fireEvent.press(tree.getByText('OK'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(tree.queryByTestId('trial-lost-notice-body')).toBeNull();
  });

  it('a note typed mid-entry, with no outcome picked, is said too', async () => {
    const withTrial = host(jest.fn());
    const tree = render(withTrial(TRIAL));
    await waitFor(() => tree.getByTestId('trial-outcome-worse'));
    fireEvent.changeText(tree.UNSAFE_getAllByType(TextInput)[0], 'itching back by week 5');

    tree.rerender(withTrial(null, COMPLETED_ELSEWHERE));

    expect(tree.getByTestId('trial-lost-notice-body').props.children).toMatch(
      /so what you said about how it went wasn’t saved/,
    );
  });

  it('a stopped-early reason picked mid-entry, over a different reason on the record', () => {
    const withTrial = host(jest.fn(), 'stopped_early');
    const tree = render(withTrial(TRIAL));
    fireEvent.press(tree.getByTestId('trial-stop-refused'));

    tree.rerender(withTrial(null, STOPPED_ELSEWHERE));

    expect(tree.getByTestId('trial-lost-notice-body').props.children).toMatch(
      /^Biscuit’s trial was already ended on another phone, on Sep 20(, 2026)?\. That ending stays on the record, so the reason you gave wasn’t saved\./,
    );
    expect(mockEndActiveTrial).not.toHaveBeenCalled();
  });

  it('no entry: the sheet goes away as before, and says nothing', async () => {
    const onClose = jest.fn();
    const withTrial = host(onClose);
    const tree = render(withTrial(TRIAL));
    await waitFor(() => tree.getByTestId('trial-outcome-worse'));

    tree.rerender(withTrial(null, COMPLETED_ELSEWHERE));

    expect(tree.toJSON()).toBeNull();
    expect(tree.queryByTestId('trial-lost-notice-body')).toBeNull();
    expect(mockEndActiveTrial).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it('the record already holds the owner’s answer: nothing lost, so it closes in silence', () => {
    const onClose = jest.fn();
    const withTrial = host(onClose, 'stopped_early');
    const tree = render(withTrial(TRIAL));
    fireEvent.press(tree.getByTestId('trial-stop-refused'));

    tree.rerender(withTrial(null, { ...STOPPED_ELSEWHERE, stoppedReason: 'refused' }));

    expect(tree.toJSON()).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
  });

  it('a Save in flight when the ending hydrates: said once, by the Save’s refusal', async () => {
    let reject: (e: unknown) => void = () => {};
    mockEndActiveTrial.mockImplementationOnce(() => new Promise((_, r) => { reject = r; }));
    const onClose = jest.fn();
    const withTrial = host(onClose, 'stopped_early');
    const tree = render(withTrial(TRIAL));
    fireEvent.press(tree.getByTestId('trial-stop-refused'));
    await act(async () => { fireEvent.press(tree.getByText('Save')); });

    tree.rerender(withTrial(null, STOPPED_ELSEWHERE));
    expect(tree.queryByTestId('trial-lost-notice-body')).toBeNull();

    await act(async () => {
      reject(new TrialEndRefused({
        reason: 'not_running', status: 'abandoned', endedOn: '2026-09-20', storedReason: 'vet_advised',
      }));
    });
    expect(alert.mock.calls.filter((c) => c[0] === 'Already ended')).toHaveLength(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('no row to read (the trial was replaced elsewhere): errs loud, with no date', () => {
    const withTrial = host(jest.fn(), 'stopped_early');
    const tree = render(withTrial(TRIAL));
    fireEvent.press(tree.getByTestId('trial-stop-refused'));

    tree.rerender(withTrial({ ...TRIAL, id: 't-2', startedAt: '2026-09-21' }, null));

    expect(tree.getByTestId('trial-lost-notice-body').props.children).toMatch(
      /^Biscuit’s trial was already ended on another phone\. That ending stays on the record, so the reason you gave wasn’t saved\./,
    );
  });
});

describe('reopening the sheet (CUL-1560)', () => {
  const ABSENCE = 'No symptoms are on the record for either stretch.';
  const NOTHING: TrialOutcomeFacts = { ...FACTS, symptoms: [] };
  const VOMIT: TrialOutcomeFacts = {
    ...FACTS,
    symptoms: [{ symptomType: 'vomit', label: 'Vomit', before: 0, during: 1 }],
  };

  function sheetWith(entry: React.ComponentProps<typeof TrialCompletionSheet>['entry']) {
    return (
      <TrialCompletionSheet
        entry={entry}
        trial={TRIAL}
        petName="Biscuit"
        species="cat"
        dayCounter={56}
        onClose={jest.fn()}
        onExtend={jest.fn()}
        onChanged={jest.fn()}
      />
    );
  }

  it('A: close and reopen reads the record again and renders the second read', async () => {
    mockLoadFacts.mockReset().mockResolvedValueOnce(NOTHING).mockResolvedValueOnce(VOMIT);
    const tree = render(sheetWith('complete'));
    await waitFor(() => tree.getByText(ABSENCE));

    tree.rerender(sheetWith(null));
    tree.rerender(sheetWith('complete'));

    await waitFor(() => tree.getByText('Vomit: 0 before · 1 during.'));
    expect(mockLoadFacts).toHaveBeenCalledTimes(2);
    expect(tree.queryByText(ABSENCE)).toBeNull();
  });

  it('B: a read still in flight at close never renders after the reopen', async () => {
    let resolveFirst: (f: TrialOutcomeFacts) => void = () => {};
    mockLoadFacts
      .mockReset()
      .mockImplementationOnce(() => new Promise<TrialOutcomeFacts>((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce(VOMIT);
    const tree = render(sheetWith('complete'));
    expect(mockLoadFacts).toHaveBeenCalledTimes(1);

    tree.rerender(sheetWith(null));
    await act(async () => { resolveFirst(NOTHING); });

    mockBuiltFacts.length = 0;
    tree.rerender(sheetWith('complete'));
    await waitFor(() => tree.getByText('Vomit: 0 before · 1 during.'));
    expect(mockLoadFacts).toHaveBeenCalledTimes(2);
    // Not even for a frame: no render after the reopen was built from the first read.
    expect(mockBuiltFacts).not.toContain(NOTHING);
    expect(mockBuiltFacts).toContain(VOMIT);
    expect(tree.queryByText(ABSENCE)).toBeNull();
  });

  // CUL-2055 replaced S1's second half: the sheet no longer re-reads for the new trial,
  // it closes. What S1 protected (the old trial's counts never paint) holds a fortiori.
  it('S1: a trial that changes while the sheet is open never renders the old trial’s read', async () => {
    mockLoadFacts.mockReset().mockResolvedValueOnce(NOTHING).mockResolvedValueOnce(VOMIT);
    const T2 = { ...TRIAL, id: 't-2', startedAt: '2026-08-01' };
    const onClose = jest.fn();
    const withTrial = (trial: typeof TRIAL) => (
      <TrialCompletionSheet
        entry="complete"
        trial={trial}
        petName="Biscuit"
        species="cat"
        dayCounter={56}
        onClose={onClose}
        onExtend={jest.fn()}
        onChanged={jest.fn()}
      />
    );
    const tree = render(withTrial(TRIAL));
    await waitFor(() => tree.getByText(ABSENCE));

    mockBuiltFacts.length = 0;
    tree.rerender(withTrial(T2));
    await act(async () => {});
    expect(mockBuiltFacts).toEqual([]);
    expect(tree.toJSON()).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a trial that goes away and comes back with the same key reads the record again', async () => {
    mockLoadFacts.mockReset().mockResolvedValueOnce(NOTHING).mockResolvedValueOnce(VOMIT);
    const onClose = jest.fn();
    const withTrial = (
      trial: typeof TRIAL | null,
      entry: React.ComponentProps<typeof TrialCompletionSheet>['entry'] = 'complete',
    ) => (
      <TrialCompletionSheet
        entry={entry}
        trial={trial}
        petName="Biscuit"
        species="cat"
        dayCounter={56}
        onClose={onClose}
        onExtend={jest.fn()}
        onChanged={jest.fn()}
      />
    );
    const tree = render(withTrial(TRIAL));
    await waitFor(() => tree.getByText(ABSENCE));

    // The trial going away closes the sheet (CUL-2055); its return is the owner's
    // reopen, and a vomit may have been logged in between.
    tree.rerender(withTrial(null));
    expect(onClose).toHaveBeenCalledTimes(1);
    // The host clears its entry on that close, before the trial comes back.
    tree.rerender(withTrial(null, null));
    tree.rerender(withTrial({ ...TRIAL }, null));
    mockBuiltFacts.length = 0;
    tree.rerender(withTrial({ ...TRIAL }));
    await waitFor(() => tree.getByText('Vomit: 0 before · 1 during.'));
    expect(mockLoadFacts).toHaveBeenCalledTimes(2);
    expect(mockBuiltFacts).not.toContain(NOTHING);
  });

  it('C: one read per open, and only once the outcome step is on screen', async () => {
    // Refactor safety (green before and after): decision → outcome inside one open.
    const tree = render(sheetWith('decision'));
    expect(mockLoadFacts).not.toHaveBeenCalled();
    fireEvent.press(tree.getByTestId('trial-decision-complete'));
    await waitFor(() => tree.getByTestId('trial-outcome-density'));
    expect(mockLoadFacts).toHaveBeenCalledTimes(1);
  });

  it('C: a reopen at `decision` after an outcome open reads nothing until the owner picks the outcome', async () => {
    const tree = render(sheetWith('complete'));
    await waitFor(() => tree.getByTestId('trial-outcome-density'));
    expect(mockLoadFacts).toHaveBeenCalledTimes(1);

    tree.rerender(sheetWith(null));
    tree.rerender(sheetWith('decision'));
    await act(async () => {});
    // The previous open's step must not answer for this one, not even with a read.
    expect(mockLoadFacts).toHaveBeenCalledTimes(1);
    expect(tree.getByTestId('trial-decision-extend')).toBeTruthy();

    fireEvent.press(tree.getByTestId('trial-decision-complete'));
    await waitFor(() => tree.getByTestId('trial-outcome-density'));
    expect(mockLoadFacts).toHaveBeenCalledTimes(2);
  });
});

// CUL-2055 — the sheet was opened for one trial and answers for that one only. When
// another phone ends it and starts a new one, hydration hands this sheet trial B under
// the open entry. It must never redraw over B with its saves live: one Save would end a
// trial the owner never opened it for.
describe('the trial under an open sheet is replaced by a different trial (A→B)', () => {
  let alert: jest.SpyInstance;
  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alert.mockRestore());

  const T2 = { ...TRIAL, id: 't-2', startedAt: '2026-09-21' };

  // A host whose `onClose` behaves like the real one's or (`sticky`) never clears the
  // entry, so the sheet's own latch is what is under test.
  function host(onClose: jest.Mock, entry: 'complete' | 'stopped_early' | 'decision') {
    return (trial: React.ComponentProps<typeof TrialCompletionSheet>['trial']) => (
      <TrialCompletionSheet
        entry={entry}
        trial={trial}
        endedRow={null}
        petName="Biscuit"
        species="cat"
        dayCounter={56}
        onClose={onClose}
        onExtend={jest.fn()}
        onChanged={jest.fn()}
      />
    );
  }

  it.each(['decision', 'complete', 'stopped_early'] as const)(
    'nothing entered (%s): closes, and no frame draws B’s saves',
    async (entry) => {
      const onClose = jest.fn();
      const withTrial = host(onClose, entry);
      const tree = render(withTrial(TRIAL));
      await act(async () => {});
      expect(tree.toJSON()).not.toBeNull();

      mockBuiltFacts.length = 0;
      tree.rerender(withTrial(T2));
      // The commit that brought B in, and every one after, draws nothing.
      expect(tree.toJSON()).toBeNull();
      await act(async () => {});
      expect(tree.toJSON()).toBeNull();
      expect(mockBuiltFacts).toEqual([]);
      expect(tree.queryByText('Save')).toBeNull();
      expect(tree.queryByTestId('trial-decision-complete')).toBeNull();
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(mockEndActiveTrial).not.toHaveBeenCalled();
      expect(alert).not.toHaveBeenCalled();
    },
  );

  it('not even the commit that brings B in draws B’s decision', async () => {
    const withTrial = host(jest.fn(), 'decision');
    const tree = render(withTrial(TRIAL));
    expect(mockDrawnDecisions).toContain('skin');

    mockDrawnDecisions.length = 0;
    tree.rerender(withTrial({ ...T2, indication: 'gi' }));
    await act(async () => {});
    expect(mockDrawnDecisions).toEqual([]);
  });

  it('nothing entered, and the trial goes away before B arrives (A→gone→B): never reappears over B', async () => {
    const onClose = jest.fn();
    const withTrial = host(onClose, 'stopped_early');
    const tree = render(withTrial(TRIAL));

    tree.rerender(withTrial(null));
    await act(async () => {});
    expect(onClose).toHaveBeenCalledTimes(1);

    tree.rerender(withTrial(T2));
    await act(async () => {});
    expect(tree.toJSON()).toBeNull();
    expect(tree.queryByText('Save')).toBeNull();
    expect(mockEndActiveTrial).not.toHaveBeenCalled();
  });

  it('an answer entered: says what happened, and nothing can be saved against B', async () => {
    const onClose = jest.fn();
    const withTrial = host(onClose, 'complete');
    const tree = render(withTrial(TRIAL));
    await waitFor(() => tree.getByTestId('trial-outcome-worse'));
    fireEvent.press(tree.getByTestId('trial-outcome-worse'));

    tree.rerender(withTrial(T2));

    expect(tree.getByTestId('trial-lost-notice-title').props.children).toBe('Already ended');
    expect(tree.queryByTestId('trial-outcome-worse')).toBeNull();
    expect(tree.queryByText('Save')).toBeNull();
    fireEvent.press(tree.getByText('OK'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(tree.toJSON()).toBeNull();
    expect(mockEndActiveTrial).not.toHaveBeenCalled();
  });

  // The adversarial pass on this PR (BROKE-1): a Save in flight defers the verdict,
  // and a failure that leaves the sheet open must not leave it open over B.
  it('a Save that fails after A→B never leaves the sheet live over B', async () => {
    let reject: (e: unknown) => void = () => {};
    mockEndActiveTrial.mockImplementationOnce(() => new Promise((_, r) => { reject = r; }));
    const onClose = jest.fn();
    const withTrial = host(onClose, 'stopped_early');
    const tree = render(withTrial(TRIAL));
    fireEvent.press(tree.getByTestId('trial-stop-refused'));
    await act(async () => { fireEvent.press(tree.getByText('Save')); });

    tree.rerender(withTrial(T2));
    expect(tree.queryByText('Save')).toBeNull();
    await act(async () => { reject(new Error('network')); });

    // The owner's reason was lost to an ending this sheet cannot read: said, loud.
    expect(tree.getByTestId('trial-lost-notice-title').props.children).toBe('Already ended');
    expect(tree.queryByText('Save')).toBeNull();
    fireEvent.press(tree.getByText('OK'));
    expect(tree.toJSON()).toBeNull();
    expect(mockEndActiveTrial).toHaveBeenCalledTimes(1);
    expect(mockEndActiveTrial).toHaveBeenCalledWith(expect.objectContaining({ trialId: 't-1' }));
  });

  // BROKE-2: once the notice is up, a second change must not take it down unread.
  it.each([['B→C', { ...TRIAL, id: 't-3', startedAt: '2026-09-25' }], ['B→gone', null]] as const)(
    'the notice survives a second change (%s) until the owner reads it',
    async (_label, next) => {
      const onClose = jest.fn();
      const withTrial = host(onClose, 'stopped_early');
      const tree = render(withTrial(TRIAL));
      fireEvent.press(tree.getByTestId('trial-stop-refused'));
      tree.rerender(withTrial(T2));
      expect(tree.getByTestId('trial-lost-notice-title')).toBeTruthy();

      tree.rerender(withTrial(next));
      await act(async () => {});
      expect(tree.getByTestId('trial-lost-notice-title')).toBeTruthy();
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.press(tree.getByText('OK'));
      expect(onClose).toHaveBeenCalledTimes(1);
    },
  );

  it('an open and a replacement in one commit bind to the trial the owner tapped over', async () => {
    const onClose = jest.fn();
    const closed = (trial: typeof TRIAL) => (
      <TrialCompletionSheet
        entry={null} trial={trial} petName="Biscuit" dayCounter={56}
        onClose={onClose} onExtend={jest.fn()} onChanged={jest.fn()}
      />
    );
    const tree = render(closed(TRIAL));
    mockDrawnDecisions.length = 0;
    tree.rerender(host(onClose, 'decision')({ ...T2, indication: 'gi' }));
    await act(async () => {});
    expect(mockDrawnDecisions).toEqual([]);
    expect(tree.toJSON()).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a fresh open over B, after the close, is an ordinary open', async () => {
    const onClose = jest.fn();
    const tree = render(host(onClose, 'stopped_early')(TRIAL));
    tree.rerender(host(onClose, 'stopped_early')(T2));
    await act(async () => {});
    expect(tree.toJSON()).toBeNull();

    // The host clears its entry on the close; the owner then opens the sheet for B.
    tree.rerender(
      <TrialCompletionSheet
        entry={null} trial={T2} petName="Biscuit" dayCounter={1}
        onClose={onClose} onExtend={jest.fn()} onChanged={jest.fn()}
      />,
    );
    tree.rerender(host(onClose, 'stopped_early')(T2));
    fireEvent.press(tree.getByTestId('trial-stop-refused'));
    await act(async () => { fireEvent.press(tree.getByText('Save')); });
    expect(mockEndActiveTrial).toHaveBeenCalledWith(expect.objectContaining({ trialId: 't-2' }));
  });
});
