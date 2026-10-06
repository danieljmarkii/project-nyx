// The course rule behind "What to tell them" (CUL-1510): a drug is named to a vet only when
// the record places it on board at the event.
let mockEvents: { id: string; event_type: string; occurred_at: string; occurred_at_confidence: string | null }[] = [];
let mockPhotographed: string[] = [];
let mockCopies = new Map<string, Record<string, unknown>>();
jest.mock('./db', () => ({
  getDb: () => ({
    getFirstAsync: async (_sql: string, [id]: string[]) => mockEvents.find((e) => e.id === id) ?? null,
    getAllAsync: async (sql: string) => {
      if (sql.includes('FROM events')) return mockEvents;
      if (sql.includes('FROM event_attachments')) return mockPhotographed.map((event_id) => ({ event_id }));
      return [];
    },
  }),
}));
jest.mock('./readCopy', () => ({
  readCopies: async (ids: readonly string[]) => new Map([...mockCopies].filter(([k]) => ids.includes(k))),
}));
import { loadIncidentFloorFacts, onBoardAt } from './incidentFloorFacts';

const AT = Date.parse('2026-06-10T13:00:00.000Z');

describe('onBoardAt', () => {
  it('a running course started before the event is on board', () => {
    expect(onBoardAt({ status: 'active', started_at: '2026-06-01T00:00:00.000Z', ended_at: null }, AT)).toBe(true);
  });

  it('a course started after the event is not', () => {
    expect(onBoardAt({ status: 'active', started_at: '2026-06-11T00:00:00.000Z', ended_at: null }, AT)).toBe(false);
  });

  it('an ended course is on board only if it ended after the event, either ISO spelling (C-40)', () => {
    expect(onBoardAt({ status: 'completed', started_at: '2026-06-01T00:00:00+00:00', ended_at: '2026-06-12T00:00:00+00:00' }, AT)).toBe(true);
    expect(onBoardAt({ status: 'completed', started_at: '2026-06-01T00:00:00.000Z', ended_at: '2026-06-09T00:00:00.000Z' }, AT)).toBe(false);
    // The exact instant: '+00:00' and '.000Z' spell it differently, and it has ended.
    expect(onBoardAt({ status: 'completed', started_at: '2026-06-01T00:00:00Z', ended_at: '2026-06-10T13:00:00+00:00' }, AT)).toBe(false);
  });

  it('a course no longer active with no end date cannot be placed in time, so it is not named', () => {
    expect(onBoardAt({ status: 'completed', started_at: '2026-06-01T00:00:00.000Z', ended_at: null }, AT)).toBe(false);
    expect(onBoardAt({ status: 'stopped', started_at: '2026-06-01T00:00:00.000Z', ended_at: null }, AT)).toBe(false);
  });

  it('a date-only end is the last day the course ran, through its end locally', () => {
    const at = new Date(2026, 5, 10, 21, 0).getTime();
    expect(onBoardAt({ status: 'completed', started_at: '2026-06-01T00:00:00Z', ended_at: '2026-06-10' }, at)).toBe(true);
    expect(onBoardAt({ status: 'completed', started_at: '2026-06-01T00:00:00Z', ended_at: '2026-06-09' }, at)).toBe(false);
  });

  it('an unreadable date names nothing', () => {
    expect(onBoardAt({ status: 'active', started_at: 'not a date', ended_at: null }, AT)).toBe(false);
    expect(onBoardAt({ status: 'active', started_at: '2026-06-01T00:00:00Z', ended_at: 'garbage' }, AT)).toBe(false);
  });
});

describe('loadIncidentFloorFacts: a neighbour whose call is beyond the record (pass 3)', () => {
  const ev = (id: string, type: string, iso: string) => ({ id, event_type: type, occurred_at: iso, occurred_at_confidence: 'witnessed' });
  const call = { status: 'completed', recommendation: 'worth_a_call', tier: 'call_today', engine_flags: '["engines_v3_en3"]' };
  beforeEach(() => {
    mockEvents = [ev('me', 'vomit', '2026-06-10T20:00:00.000Z'), ev('b', 'vomit', '2026-06-10T19:00:00+00:00'), ev('s', 'diarrhea', '2026-06-12T10:00:00.000Z')];
    mockPhotographed = [];
    mockCopies = new Map();
  });

  it('a photographed neighbour standing as a call is beyond the record', async () => {
    mockPhotographed = ['b'];
    mockCopies = new Map([['b', call]]);
    expect((await loadIncidentFloorFacts('me', 'pet'))?.neighbourCallBeyondRecord).toBe(true);
  });

  it('a neighbour at call now is beyond the record, photo or not', async () => {
    mockCopies = new Map([['s', { ...call, tier: 'call_now' }]]);
    expect((await loadIncidentFloorFacts('me', 'pet'))?.neighbourCallBeyondRecord).toBe(true);
  });

  it('a photoless neighbour calling today is the record the floor already checks', async () => {
    mockCopies = new Map([['b', call]]);
    expect((await loadIncidentFloorFacts('me', 'pet'))?.neighbourCallBeyondRecord).toBe(false);
  });

  it('the event itself is never its own neighbour, and a calm photographed neighbour is nothing', async () => {
    mockPhotographed = ['me', 'b'];
    mockCopies = new Map([['me', call], ['b', { ...call, recommendation: 'monitor', tier: 'logged' }]]);
    const facts = await loadIncidentFloorFacts('me', 'pet');
    expect(facts?.neighbourCallBeyondRecord).toBe(false);
    expect(facts?.vomits).toHaveLength(2);
  });
});
