// The course rule behind "What to tell them" (CUL-1510): a drug is named to a vet only when
// the record places it on board at the event.
jest.mock('./db', () => ({ getDb: jest.fn() }));
import { onBoardAt } from './incidentFloorFacts';

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

