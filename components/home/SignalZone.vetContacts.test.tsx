// Vet contacts PR-07 (CUL-2769; spec §4.5, §6.1, AC 9 and AC 18; mock §E). A logged call, text
// or email is AWARENESS ONLY (R5): the card keeps its sentence, count, ask and slot byte for byte
// and gains one context line. Proven on the real stack, with the real rule and the real read
// behind a mocked database, against the same stack with no contact.

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(cb, [cb]),
}));
const mockSupabaseFrom = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => mockSupabaseFrom(...a), functions: { invoke: jest.fn() } } }));
const mockGetAllAsync = jest.fn();
const mockRunAsync = jest.fn();
const mockExecAsync = jest.fn();
jest.mock('../../lib/db', () => ({
  getDb: () => ({
    getAllSync: () => [{ last: null }],
    getAllAsync: (...a: unknown[]) => mockGetAllAsync(...a),
    runAsync: (...a: unknown[]) => mockRunAsync(...a),
    execAsync: (...a: unknown[]) => mockExecAsync(...a),
  }),
}));
jest.mock('../../lib/signalLead', () => ({
  loadSignalLead: async () => null,
  loadSignalRowTrial: async () => null,
  loadSignalRowScreen: async () => ({ kind: 'unanswered' }),
}));
const mockUseSignal = jest.fn();
jest.mock('../../hooks/useSignal', () => ({ useSignal: () => mockUseSignal() }));
jest.mock('../../hooks/useGapWarning', () => ({ useGapWarning: () => ({ text: null, answered: true, failed: false, retry: () => {}, reading: false }) }));
jest.mock('../../lib/emergencyDoorRead', () => ({ loadEmergencyRead: async () => ({ status: 'failed' }) }));
jest.mock('../../hooks/useFloorOn', () => ({ useFloorOn: () => false }));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));
jest.mock('../../lib/signalArrival', () => ({ hasPlayedArrival: async () => true, markArrivalPlayed: async () => {} }));
jest.mock('../../lib/haptics', () => ({ insightArrival: jest.fn() }));
jest.mock('../../lib/measureNode', () => ({ measureNodeInWindow: (_n: unknown, cb: (r: null) => void) => cb(null) }));
// The gate's two halves, switched per test. Every other flag resolves as shipped.
let mockFlagOn = true;
let mockOptedIn = true;
jest.mock('../../hooks/useAppConfig', () => {
  const actual = jest.requireActual('../../hooks/useAppConfig');
  return { ...actual, useAllowlistFlag: (key: string) => (key === 'vet_contacts_enabled' ? mockFlagOn : actual.useAllowlistFlag(key)) };
});
jest.mock('../../lib/betaFeatures', () => {
  const actual = jest.requireActual('../../lib/betaFeatures');
  return { ...actual, useBetaOptIn: (key: string) => (key === 'vet_contacts_enabled' ? mockOptedIn : actual.useBetaOptIn(key)) };
});

import { render, waitFor, type RenderAPI } from '@testing-library/react-native';
import { SignalZone } from './SignalZone';
import { SignalRow } from '../surfaces/signal/SignalRow';
import type { SignalState } from '../../hooks/useSignal';
import type { CachedFinding, SignalFinding } from '../../lib/signal';
import { contactLineFor } from '../../lib/vetContactLine';
import { toLocalDayKey } from '../../lib/utils';

const now = new Date();
const today = toLocalDayKey(now);
const dayBefore = (() => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return toLocalDayKey(d);
})();
// A time earlier today, built from local components (C-29); at 00:00 it is still today.
const earlierToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0).toISOString();

const intake: CachedFinding = {
  rank: 0,
  text: 'Pixel has eaten much less than usual for 2 days. Worth a call to your vet today.',
  finding: { type: 'intake_decline', priorityClass: 'safety', trigger: 'consecutive_low', species: 'cat', daysBelowBaseline: 2, refusedFoodLabel: null, ratedMealsConsidered: 7 },
};
const chronic: CachedFinding = {
  rank: 1,
  text: 'Pixel has vomited 14 times across 5 of the last 8 weeks.',
  finding: {
    type: 'symptom_chronicity',
    priorityClass: 'safety',
    symptomType: 'vomit',
    episodeCount: 14,
    spanDays: 40,
    activeWeeks: 5,
    symptomDays: 12,
    daysSinceLastEpisode: 1,
    // Long before any contact here, so the chronicity row qualifies too.
    firstOnsetIso: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 40, 12, 0).toISOString(),
    tier: 'firm',
    windowDays: 56,
  },
};
const watched: CachedFinding = {
  ...chronic,
  rank: 2,
  finding: {
    ...(chronic.finding as Extract<SignalFinding, { type: 'symptom_chronicity' }>),
    symptomType: 'diarrhea',
    careState: { state: 'with_vet', text: "Pixel's diarrhea, your vet knows. You said the vet started a diet.", backLine: null },
  } as unknown as SignalFinding,
};
const correlation: CachedFinding = {
  rank: 3,
  text: 'Vomiting has tended to follow chicken.',
  finding: { type: 'food_symptom_correlation', priorityClass: 'insight', tier: 'early', symptomType: 'vomit', protein: 'chicken', matchedPairs: 4, symptomEventCount: 4, correlationWindowHours: 12 },
};

function state(findings: CachedFinding[]): SignalState {
  return {
    petId: 'pet-1',
    findings,
    coverage: [],
    signalText: null,
    petName: 'Pixel',
    isLoading: false,
    hasRecentActivity: true,
    hasSubstantialHistory: false,
    lastLoggedAt: null,
    lookSinceLastLogged: false,
    eventCount: 80,
    acknowledging: false,
    generatedAt: now.toISOString(),
    answered: true,
  };
}

type Row = { label: string; headline: string; texts: string[] };

/** Every row in order: its spoken label, its headline and every text node but the contact line. */
function rowsOf(view: RenderAPI): Row[] {
  return view.getAllByTestId('signal-row').map((row) => {
    const texts: string[] = [];
    const walk = (n: { props?: { testID?: string; children?: unknown }; children?: unknown[] }) => {
      if (n.props?.testID === 'signal-row-contact') return;
      for (const ch of (n.children ?? []) as unknown[]) {
        if (typeof ch === 'string') texts.push(ch);
        else walk(ch as never);
      }
    };
    walk(row as never);
    return {
      label: row.props.accessibilityLabel as string,
      headline: String(view.getAllByTestId('signal-row-headline').find((h) => isInside(h, row))?.props.children),
      texts,
    };
  });
}
function isInside(node: { parent?: unknown }, ancestor: unknown): boolean {
  for (let p = node as { parent?: unknown } | undefined; p; p = p.parent as never) if (p === ancestor) return true;
  return false;
}

const STACK = [intake, chronic, watched, correlation];

async function renderStack(contacts: Array<{ id: string; visited_at: string; channel: string; contacted_at: string | null }>) {
  mockGetAllAsync.mockImplementation(async (sql: string) => (/FROM vet_visits/.test(sql) ? contacts : []));
  const view = render(<SignalZone withholdFallingVomit={false} />);
  if (mockFlagOn && mockOptedIn) await waitFor(() => expect(mockGetAllAsync).toHaveBeenCalled());
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFlagOn = true;
  mockOptedIn = true;
  mockUseSignal.mockReturnValue(state(STACK));
});

describe('AC 9 — awareness only: a same-day email changes no card and adds one line', () => {
  it('sentence, count, ask and order are identical, string and index; each live safety card gains one line', async () => {
    const without = await renderStack([]);
    const before = rowsOf(without);
    expect(without.queryAllByTestId('signal-row-contact')).toHaveLength(0);
    without.unmount();

    const withContact = await renderStack([{ id: 'v1', visited_at: today, channel: 'email', contacted_at: earlierToday }]);
    await waitFor(() => expect(withContact.queryAllByTestId('signal-row-contact').length).toBeGreaterThan(0));
    const after = rowsOf(withContact);

    // Non-vacuity: the stack drew every card, the intake card leads.
    expect(before.map((r) => r.headline)).toHaveLength(4);
    expect(after.map((r) => r.headline)).toEqual(before.map((r) => r.headline));
    expect(after.map((r) => r.texts)).toEqual(before.map((r) => r.texts));

    const line = 'You emailed the vet today, 12:00 am.';
    const lines = withContact.getAllByTestId('signal-row-contact').map((n) => n.props.children);
    // The intake card, the chronicity card and the watched concern: one line each. The insight
    // card gains none.
    expect(lines).toEqual([line, line, line]);
    // Spoken: the card's own label word for word, then the line as its own last sentence.
    after.forEach((r, i) => {
      expect(r.label).toBe(i < 3 ? `${before[i].label} ${line}` : before[i].label);
    });
  });

  it('a contact writes nothing: no care answer, acknowledgement, vet_calls or follow-up row', async () => {
    const view = await renderStack([{ id: 'v1', visited_at: today, channel: 'phone', contacted_at: null }]);
    await waitFor(() => expect(view.queryAllByTestId('signal-row-contact').length).toBeGreaterThan(0));
    expect(mockRunAsync).not.toHaveBeenCalled();
    expect(mockExecAsync).not.toHaveBeenCalled();
    for (const [sql] of mockGetAllAsync.mock.calls as unknown as [string][]) expect(sql).toMatch(/^\s*SELECT/);
    expect(mockSupabaseFrom).not.toHaveBeenCalled();
  });

  it('a contact from before the card began is not about it: the intake card gains nothing', async () => {
    const older = toLocalDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 5));
    const view = await renderStack([{ id: 'v1', visited_at: older, channel: 'phone', contacted_at: null }]);
    await waitFor(() => expect(view.queryAllByTestId('signal-row-contact').length).toBe(2));
    expect(view.getAllByTestId('signal-row')[0].props.accessibilityLabel).not.toMatch(/You called/);
  });

  it('C-12: nothing is drawn while the read is in flight, and a failed read draws the cards as they were', async () => {
    let release: (v: unknown) => void = () => {};
    mockGetAllAsync.mockImplementation(() => new Promise((r) => (release = r)));
    const view = render(<SignalZone withholdFallingVomit={false} />);
    await waitFor(() => expect(mockGetAllAsync).toHaveBeenCalled());
    expect(view.queryAllByTestId('signal-row-contact')).toHaveLength(0);
    expect(view.getAllByTestId('signal-row')).toHaveLength(4);
    view.unmount();

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetAllAsync.mockImplementation(async () => {
      throw new Error('db gone');
    });
    const failed = render(<SignalZone withholdFallingVomit={false} />);
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(failed.queryAllByTestId('signal-row-contact')).toHaveLength(0);
    expect(failed.getAllByTestId('signal-row')).toHaveLength(4);
    warn.mockRestore();
    release([]);
  });
});

describe('C-36 — flag off, or not opted in: no read and no line', () => {
  it.each([
    ['flag off', false, true],
    ['not opted in', true, false],
  ])('%s', async (_n, flag, opt) => {
    mockFlagOn = flag;
    mockOptedIn = opt;
    // A fixture that WOULD answer if read, so the absence proves the gate (C-41).
    const view = await renderStack([{ id: 'v1', visited_at: today, channel: 'email', contacted_at: null }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockGetAllAsync.mock.calls.filter(([sql]) => /vet_visits/.test(String(sql)))).toHaveLength(0);
    expect(view.queryAllByTestId('signal-row-contact')).toHaveLength(0);
  });
});

describe('AC 18 — the double line (R11), on a row handed the shipped "You called on" day', () => {
  const calledOn = dayBefore;
  const rowFor = (contacts: Parameters<typeof contactLineFor>[1]) => {
    const line = contactLineFor(intake.finding, contacts, today, today, calledOn);
    return render(<SignalRow cached={intake} petId="pet-1" onOpen={() => {}} generatedAt={now.toISOString()} contactLine={line} />);
  };
  const bare = () => render(<SignalRow cached={intake} petId="pet-1" onOpen={() => {}} generatedAt={now.toISOString()} />);

  it('a phone contact on the called day adds nothing; the card is the card', () => {
    const base = bare();
    const label = base.getByTestId('signal-row').props.accessibilityLabel;
    const sub = base.getByTestId('signal-row-ask').props.children;
    base.unmount();
    const view = rowFor([{ id: 'a', day: calledOn, channel: 'phone', contactedAt: null }]);
    expect(view.queryByTestId('signal-row-contact')).toBeNull();
    expect(view.getByTestId('signal-row').props.accessibilityLabel).toBe(label);
    expect(view.getByTestId('signal-row-ask').props.children).toBe(sub);
  });

  it('an email the next day is said beneath, and the card is unchanged', () => {
    const base = bare();
    const label = base.getByTestId('signal-row').props.accessibilityLabel;
    base.unmount();
    const view = rowFor([
      { id: 'a', day: calledOn, channel: 'phone', contactedAt: null },
      { id: 'b', day: today, channel: 'email', contactedAt: null },
    ]);
    expect(view.getByTestId('signal-row-contact').props.children).toBe('You emailed the vet today.');
    expect(view.getByTestId('signal-row').props.accessibilityLabel).toBe(`${label} You emailed the vet today.`);
  });
});
