// The simulator's stand-in Supabase (CUL-2875). What the golden flow leans on: the fixture
// owner signs in with the typed credentials and nothing else does, the record ends yesterday
// so Today starts empty, and a pushed meal lands where the next pull reads it.
import { createFixtureHandler, FIXTURE_PASSWORD } from './fixtureServer';
import { FIXTURE_EMAIL } from '../web-capture/fixtureRest';

const NOW = Date.parse('2026-11-22T13:00:00Z');
const url = (path: string) => new URL(path, 'http://127.0.0.1:54321');

describe('fixtureServer', () => {
  it('signs in the fixture owner and refuses any other password', () => {
    const { answer } = createFixtureHandler({ nowMs: NOW });
    const ok = answer('POST', url('/auth/v1/token?grant_type=password'), '', JSON.stringify({ email: FIXTURE_EMAIL, password: FIXTURE_PASSWORD }));
    expect(ok.status).toBe(200);
    expect(JSON.parse(ok.body).user.email).toBe(FIXTURE_EMAIL);
    // The session must outlive the run on the real clock, not the story's.
    expect(JSON.parse(ok.body).expires_at * 1000).toBeGreaterThan(NOW);
    const wrong = answer('POST', url('/auth/v1/token?grant_type=password'), '', JSON.stringify({ email: FIXTURE_EMAIL, password: 'nope' }));
    expect(wrong.status).toBe(400);
  });

  it('ends the record yesterday, so Today holds only what the flow logs', () => {
    const { answer, tables } = createFixtureHandler({ nowMs: NOW });
    const today = new Date(NOW).toISOString().slice(0, 10);
    expect(tables.events.length).toBeGreaterThan(0);
    expect(tables.events.filter((e) => String(e.occurred_at) >= `${today}T00:00:00`)).toEqual([]);
    // The story's own last morning meal is still there, a day back: the record is whole.
    const yesterday = new Date(NOW - 86_400_000).toISOString().slice(0, 10);
    expect(tables.events.some((e) => String(e.occurred_at).startsWith(yesterday) && e.event_type === 'meal')).toBe(true);
    const pull = answer('GET', url(`/rest/v1/events?select=*&occurred_at=gte.${today}T00:00:00Z`), 'application/json', '');
    expect(JSON.parse(pull.body)).toEqual([]);
  });

  it('lands a pushed meal where the next pull reads it, upserting by id', () => {
    const logs: string[] = [];
    const { answer } = createFixtureHandler({ nowMs: NOW, log: (l) => logs.push(l) });
    const row = { id: 'meal-2875', event_id: 'ev-2875', pet_id: 'p', intake_rating: null };
    expect(answer('POST', url('/rest/v1/meals'), '', JSON.stringify([row])).status).toBe(201);
    answer('POST', url('/rest/v1/meals'), '', JSON.stringify([{ ...row, intake_rating: 'all' }]));
    const pulled = JSON.parse(answer('GET', url('/rest/v1/meals?id=eq.meal-2875'), 'application/json', '').body);
    expect(pulled).toEqual([{ ...row, intake_rating: 'all' }]);
    expect(logs.filter((l) => l === 'write meals 1 row(s)')).toHaveLength(2);
  });
});
