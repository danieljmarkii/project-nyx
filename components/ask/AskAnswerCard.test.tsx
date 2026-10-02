// Ask's provenance link, rendered: its label and its route in both `history_v2` states
// (HV-11 / CUL-1168, CUL-498; `lib/historyDoors.ts` row `ask-provenance`).
//
// `lib/ask.test.ts` pins the pure resolvers against a hand-built reach; this renders the
// card, so the WIRING is what is tested: that the card reads the gate, asks for the trial
// only when the answer needs it, and hands the resolvers the reach in the right fields (two
// booleans type-check either way round). It is the flag-off proof the History v2 flag-off
// guard names for this file (`DRAWS_ELSEWHERE_OK`): flag off, today's link, byte for byte.
//
// The gate is stubbed per test; the trial read is the REAL hook over a stubbed
// `readWindowFacts` and the real `isWindowOffered` (C-34), so "offered" is decided by the
// window table, not by the test.
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/db', () => ({ getDb: jest.fn() }));
let mockHistoryV2 = false;
jest.mock('../../hooks/useHistoryV2', () => ({ useHistoryV2: () => mockHistoryV2 }));
jest.mock('../../lib/historyWindowFacts', () => ({ readWindowFacts: jest.fn() }));
jest.mock('./AskAnswerComponent', () => ({ AskAnswerComponent: () => null }));

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AskAnswerCard } from './AskAnswerCard';
import { readWindowFacts } from '../../lib/historyWindowFacts';
import { windowTrialOf, type WindowFacts } from '../../lib/historyWindows';
import { localDayIndexOf, toLocalDayKey } from '../../lib/utils';
import { usePetStore, type Pet } from '../../store/petStore';
import type { AskAnswerBody } from '../../lib/ask';

const mockRead = readWindowFacts as jest.MockedFunction<typeof readWindowFacts>;

const PET: Pet = {
  id: 'p1', name: 'Rex', species: 'dog', breed: null, date_of_birth: null,
  date_of_birth_precision: 'exact', sex: 'male', weight_kg: null, photo_path: null,
};

function body(window: string): AskAnswerBody {
  return {
    outcome: 'answer',
    substantive: true,
    headline: '3 vomits',
    detail: '',
    component: null,
    provenance: { window: null, denominator: '3 events', tapThrough: { kind: 'filter', symptomType: 'vomit', window } },
    safetyLead: null,
    readLine: null,
    followups: [],
    conversationCredited: true,
    generalMode: false,
  };
}

/** The window facts History would read for Rex today: a trial started 10 days ago, running
 *  (or ended, which the table then does not offer), or none. */
function facts(trial: 'running' | 'ended' | 'none'): WindowFacts {
  const today = toLocalDayKey(new Date());
  const todayIndex = localDayIndexOf(today) as number;
  const started = new Date();
  started.setDate(started.getDate() - 10);
  const startedAt = toLocalDayKey(started);
  const windowTrial =
    trial === 'none'
      ? null
      : windowTrialOf(
          { startedAt, targetDurationDays: 56, status: trial === 'running' ? 'active' : 'completed', endedAt: trial === 'ended' ? today : null },
          { exposureRange: { startDayIndex: todayIndex - 10, endDayIndex: todayIndex } },
          today,
        );
  return { petId: PET.id, today, firstRecordDay: '2026-01-01', trial: windowTrial, sinceVisit: null };
}

function renderCard(window: string) {
  const onTapThrough = jest.fn();
  const view = render(<AskAnswerCard body={body(window)} petName="Rex" onAsk={jest.fn()} onTapThrough={onTapThrough} />);
  return { view, onTapThrough };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHistoryV2 = false;
  usePetStore.setState({ pets: [PET], activePet: PET });
});

describe('flag off: today\'s link, byte for byte', () => {
  it('Last 14 days and since the trial started open Patterns, and no trial is read', () => {
    for (const w of ['14d', 'since_trial_start']) {
      const { view, onTapThrough } = renderCard(w);
      fireEvent.press(view.getByLabelText('Open in Patterns'));
      expect(onTapThrough).toHaveBeenCalledWith({ pathname: '/insights/[metric]', params: { metric: 'vomit' } });
      view.unmount();
    }
    expect(mockRead).not.toHaveBeenCalled();
  });

  it('the last 7 days opens History, as it always did', () => {
    const { view, onTapThrough } = renderCard('7d');
    fireEvent.press(view.getByLabelText('Open in History'));
    expect(onTapThrough).toHaveBeenCalledWith({ pathname: '/(tabs)/history', params: { type: 'vomit', window: '7d' } });
  });
});

describe('flag on (HV-11, CUL-498)', () => {
  beforeEach(() => {
    mockHistoryV2 = true;
  });

  it('Last 14 days opens History on that window, with no trial read', () => {
    const { view, onTapThrough } = renderCard('14d');
    fireEvent.press(view.getByLabelText('Open in History'));
    expect(onTapThrough).toHaveBeenCalledWith({ pathname: '/(tabs)/history', params: { type: 'vomit', window: '14d' } });
    expect(mockRead).not.toHaveBeenCalled();
  });

  it('since the trial started: History, once History is known to offer the window', async () => {
    mockRead.mockResolvedValue(facts('running'));
    const { view, onTapThrough } = renderCard('since_trial_start');
    // Until the read answers, the link makes no promise it cannot keep.
    expect(view.getByLabelText('Open in Patterns')).toBeTruthy();
    await waitFor(() => expect(view.getByLabelText('Open in History')).toBeTruthy());
    fireEvent.press(view.getByLabelText('Open in History'));
    expect(onTapThrough).toHaveBeenCalledWith({ pathname: '/(tabs)/history', params: { type: 'vomit', window: 'trial' } });
    expect(mockRead).toHaveBeenCalledTimes(1);
    expect(mockRead.mock.calls[0][0]).toMatchObject({ id: PET.id });
  });

  it('since the trial started, where History would not offer it: Patterns (B-378, never a superset)', async () => {
    for (const trial of ['ended', 'none'] as const) {
      mockRead.mockResolvedValue(facts(trial));
      const { view, onTapThrough } = renderCard('since_trial_start');
      await waitFor(() => expect(mockRead).toHaveBeenCalled());
      // Let the read's answer land before judging the link (the offered case above shows the
      // same wait flips it).
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      fireEvent.press(view.getByLabelText('Open in Patterns'));
      expect(onTapThrough).toHaveBeenCalledWith({ pathname: '/insights/[metric]', params: { metric: 'vomit' } });
      view.unmount();
      mockRead.mockClear();
    }
  });

  it('a failed trial read stays on Patterns, and says so in the log', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockRead.mockRejectedValue(new Error('sqlite gone'));
    const { view } = renderCard('since_trial_start');
    await waitFor(() => expect(errors).toHaveBeenCalled());
    expect(view.getByLabelText('Open in Patterns')).toBeTruthy();
    errors.mockRestore();
  });
});
