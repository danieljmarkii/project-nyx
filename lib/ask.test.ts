import {
  parseAskResponse,
  resolveTapThrough,
  tapThroughLabel,
  isSymptomShapedQuestion,
  isRundownRequest,
  formatResetLabel,
  buildSuggestionChips,
  buildOfflineDeflection,
  loadAskSuggestions,
  askQuestion,
  RUNDOWN_CTA,
} from './ask';
import { supabase } from './supabase';
import { getDb } from './db';

// ask.ts imports the real supabase client (fail-fast env check) and the SQLite
// handle — replace both before ask.ts resolves them (same pattern as signal.test.ts).
jest.mock('./supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));
jest.mock('./db', () => ({ getDb: jest.fn() }));

const mockedInvoke = supabase.functions.invoke as jest.Mock;
const mockedGetDb = getDb as jest.Mock;

describe('parseAskResponse — the typed response contract', () => {
  it('discriminates a successful answer body', () => {
    const res = parseAskResponse({
      success: true,
      outcome: 'answer',
      substantive: true,
      headline: 'Pixel has vomited 7 times in the last 30 days.',
      detail: '3 of them this past week.',
      component: { kind: 'spark', data: [4.2, 4.3, 4.3] },
      provenance: { window: 'the last 30 days', denominator: '7 events', tapThrough: { kind: 'filter', symptomType: 'vomit', window: '30d' } },
      safetyLead: null,
      followups: ['What time of day?', 42],
      conversationCredited: true,
      generalMode: false,
    });
    expect(res.ok).toBe(true);
    if (res.ok && 'answer' in res) {
      expect(res.answer.outcome).toBe('answer');
      expect(res.answer.substantive).toBe(true);
      expect(res.answer.component).toEqual({ kind: 'spark', data: [4.2, 4.3, 4.3] });
      // Non-string followups are dropped.
      expect(res.answer.followups).toEqual(['What time of day?']);
      expect(res.answer.conversationCredited).toBe(true);
    } else {
      throw new Error('expected answer branch');
    }
  });

  it('discriminates cap_reached', () => {
    const res = parseAskResponse({ cap_reached: true, grain: 'conversation', cap: 'monthly', resets_at: '2026-08-01T00:00:00.000Z' });
    expect(res.ok).toBe(true);
    if (res.ok && 'capped' in res) {
      expect(res.capped.grain).toBe('conversation');
      expect(res.capped.cap).toBe('monthly');
    } else {
      throw new Error('expected capped branch');
    }
  });

  it('discriminates feature_disabled', () => {
    const res = parseAskResponse({ feature_disabled: true, function: 'ask' });
    expect(res.ok && 'disabled' in res).toBe(true);
  });

  it('falls to !ok for an empty / unrecognized body (degrades to the designed offline state)', () => {
    expect(parseAskResponse(null).ok).toBe(false);
    expect(parseAskResponse({}).ok).toBe(false);
    expect(parseAskResponse({ headline: 'no outcome' }).ok).toBe(false);
  });

  it('drops a malformed component rather than rendering a half-parsed number', () => {
    const res = parseAskResponse({ outcome: 'answer', headline: 'x', component: { kind: 'ranked', data: 'nope' } });
    if (res.ok && 'answer' in res) expect(res.answer.component).toBeNull();
    else throw new Error('expected answer');
  });
});

describe('askQuestion — the network call', () => {
  afterEach(() => jest.clearAllMocks());

  it('sends pet_id + question + prior conversation and returns the parsed answer', async () => {
    mockedInvoke.mockResolvedValue({ data: { outcome: 'answer', headline: 'ok', detail: '', followups: [] }, error: null });
    const res = await askQuestion({ petId: 'p1', question: 'when did she last vomit?', conversation: [{ role: 'user', content: 'hi' }] });
    expect(mockedInvoke).toHaveBeenCalledWith('ask', {
      body: { pet_id: 'p1', question: 'when did she last vomit?', conversation: [{ role: 'user', content: 'hi' }] },
    });
    expect(res.ok).toBe(true);
  });

  it('resolves to !ok on a transport error (never throws — the online-only designed state)', async () => {
    mockedInvoke.mockResolvedValue({ data: null, error: { message: 'network' } });
    const res = await askQuestion({ petId: 'p1', question: 'q', conversation: [] });
    expect(res.ok).toBe(false);
  });

  it('resolves to !ok when invoke itself throws', async () => {
    mockedInvoke.mockRejectedValue(new Error('boom'));
    const res = await askQuestion({ petId: 'p1', question: 'q', conversation: [] });
    expect(res.ok).toBe(false);
  });
});

describe('resolveTapThrough — provenance navigation (real routes only)', () => {
  it('opens a single event detail', () => {
    expect(resolveTapThrough({ kind: 'events', eventIds: ['e1'] })).toEqual({ pathname: '/event/[id]', params: { id: 'e1' } });
  });

  it('opens the FIRST (most-recent) event when several — no multi-event route exists', () => {
    expect(resolveTapThrough({ kind: 'events', eventIds: ['e1', 'e2', 'e3'] })).toEqual({ pathname: '/event/[id]', params: { id: 'e1' } });
  });

  it('routes a symptom filter to that symptom Patterns detail', () => {
    expect(resolveTapThrough({ kind: 'filter', symptomType: 'vomit', window: '30d' })).toEqual({ pathname: '/insights/[metric]', params: { metric: 'vomit' } });
  });

  it('routes a non-symptom / symptomless filter to the Patterns index', () => {
    expect(resolveTapThrough({ kind: 'filter', window: '7d' })).toEqual({ pathname: '/insights' });
    // 'meal' is not a symptom metric → index, never a dead /insights/[metric].
    expect(resolveTapThrough({ kind: 'filter', symptomType: 'meal' })).toEqual({ pathname: '/insights' });
  });

  it('returns null when nothing is linkable', () => {
    expect(resolveTapThrough(null)).toBeNull();
    expect(resolveTapThrough({ kind: 'events', eventIds: [] })).toBeNull();
  });
});

describe('tapThroughLabel', () => {
  it('names where it actually lands', () => {
    expect(tapThroughLabel({ kind: 'events', eventIds: ['e1'] })).toBe('Open the event');
    // Several events open the LATEST one (no multi-event route), so the label must say
    // so — never "Open in History" (which would promise a filtered list — pm-review fix).
    expect(tapThroughLabel({ kind: 'events', eventIds: ['e1', 'e2'] })).toBe('Open the latest event');
    expect(tapThroughLabel({ kind: 'filter', symptomType: 'vomit' })).toBe('Open in Patterns');
    expect(tapThroughLabel(null)).toBeNull();
    expect(tapThroughLabel({ kind: 'events', eventIds: [] })).toBeNull();
  });
});

describe('isSymptomShapedQuestion — the §16.1 #3 cap-copy guard', () => {
  it('flags symptom/health-shaped questions', () => {
    for (const q of ['is she still vomiting?', 'has the blood stopped?', 'why is he so lethargic', 'is the diarrhea better', 'she won\'t eat']) {
      expect(isSymptomShapedQuestion(q)).toBe(true);
    }
  });
  it('does not flag neutral questions', () => {
    for (const q of ['what foods does she finish?', 'what\'s her weight doing?', 'how many meals this week?']) {
      expect(isSymptomShapedQuestion(q)).toBe(false);
    }
  });
});

describe('formatResetLabel', () => {
  it('daily → tomorrow', () => {
    expect(formatResetLabel('daily', '2026-08-01T00:00:00.000Z')).toBe('tomorrow');
  });
  it('monthly → a real month/day', () => {
    expect(formatResetLabel('monthly', '2026-08-01T00:00:00.000Z')).toMatch(/August|Aug/);
  });
  it('degrades a bad value safely (never "Invalid Date")', () => {
    expect(formatResetLabel('monthly', 'garbage')).toBe('next month');
    expect(formatResetLabel('monthly', '')).toBe('next month');
  });
});

describe('buildSuggestionChips — data-aware, seeded from the pet (§3.2)', () => {
  it('offers a chip only for data the pet actually has', () => {
    const chips = buildSuggestionChips(
      { total: 20, hasVomit: true, hasStool: false, hasMeal: true, hasWeight: true },
      'Pixel',
    );
    expect(chips.some((c) => /vomit/i.test(c))).toBe(true);
    expect(chips.some((c) => /appetite/i.test(c))).toBe(true);
    expect(chips.some((c) => /weight/i.test(c))).toBe(true);
    // No stool data → no loose-stool chip.
    expect(chips.some((c) => /loose stool/i.test(c))).toBe(false);
  });

  it('a pet with no vomit history never sees a vomit chip', () => {
    const chips = buildSuggestionChips({ total: 5, hasVomit: false, hasStool: false, hasMeal: true, hasWeight: false }, 'Juniper');
    expect(chips.some((c) => /vomit/i.test(c))).toBe(false);
  });

  it('caps at four so the fresh state stays chips-first', () => {
    const chips = buildSuggestionChips({ total: 99, hasVomit: true, hasStool: true, hasMeal: true, hasWeight: true }, 'Pixel');
    expect(chips.length).toBeLessThanOrEqual(4);
  });

  it('uses the pet name and falls back gracefully', () => {
    const chips = buildSuggestionChips({ total: 1, hasVomit: true, hasStool: false, hasMeal: false, hasWeight: false }, '');
    expect(chips[0]).toMatch(/your pet/);
  });
});

describe('loadAskSuggestions — local SQLite read', () => {
  afterEach(() => jest.clearAllMocks());

  it('reports total + builds chips from the presence row', () => {
    mockedGetDb.mockReturnValue({
      getAllSync: () => [{ total: 12, vomit: 3, stool: 0, meal: 9, weight: 2 }],
    });
    const s = loadAskSuggestions('p1', 'Pixel');
    expect(s.total).toBe(12);
    expect(s.chips.length).toBeGreaterThan(0);
    expect(s.chips.some((c) => /vomit/i.test(c))).toBe(true);
  });

  it('degrades to empty (never throws) when the DB is unreadable', () => {
    mockedGetDb.mockImplementation(() => {
      throw new Error('db closed');
    });
    const s = loadAskSuggestions('p1', 'Pixel');
    expect(s).toEqual({ total: 0, chips: [] });
  });
});

describe('buildOfflineDeflection — the online-only designed state', () => {
  it('is a non-substantive, guarded, never-blank deflection', () => {
    const b = buildOfflineDeflection('Pixel');
    expect(b.outcome).toBe('llm_unavailable');
    expect(b.substantive).toBe(false);
    expect(b.headline.length).toBeGreaterThan(0);
    expect(b.detail).toMatch(/Pixel/);
    expect(b.component).toBeNull();
    expect(b.safetyLead).toBeNull();
    expect(b.headline.includes('!')).toBe(false);
  });

  it('offers the rundown as its follow-up — a real offline escape (G3)', () => {
    // The rundown works with no connection, and the surface routes this CTA to /rundown
    // rather than round-tripping the model, so the offline deflection never dead-ends.
    expect(buildOfflineDeflection('Pixel').followups).toEqual([RUNDOWN_CTA]);
  });
});

describe('isRundownRequest — routes the rundown CTAs to /rundown, not the model (G3)', () => {
  it('matches the app-emitted rundown CTA strings (case/whitespace-insensitive)', () => {
    expect(isRundownRequest(RUNDOWN_CTA)).toBe(true);
    expect(isRundownRequest('  put together a vet-visit rundown  ')).toBe(true);
    expect(isRundownRequest('Heading to the vet? Build the visit rundown')).toBe(true);
  });

  it('does NOT hijack a freeform question that merely mentions "rundown"', () => {
    // Must still reach the model (which deflects unsupported) — never silently navigate away.
    expect(isRundownRequest('give me a rundown of her vomiting this month')).toBe(false);
    expect(isRundownRequest('How many times has she vomited?')).toBe(false);
    expect(isRundownRequest('')).toBe(false);
  });
});
