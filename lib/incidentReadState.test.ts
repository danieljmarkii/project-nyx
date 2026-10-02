import { escalationSurvivesFailure, escalationSurvivesReRead } from './incidentReadState';

describe('escalationSurvivesFailure — an escalation outlives a failed re-read (CUL-812)', () => {
  it('rescues a worth_a_call row from the failure frame', () => {
    expect(escalationSurvivesFailure({ recommendation: 'worth_a_call' })).toBe(true);
  });

  it('does NOT rescue a benign read — the failed attempt may have read a REPLACED photo', () => {
    // This is the half that keeps the fix from becoming a reassurance-on-absence
    // defect of its own: a "keep an eye out" standing in front of an image nothing
    // has successfully read is a claim the record cannot support.
    expect(escalationSurvivesFailure({ recommendation: 'monitor' })).toBe(false);
    expect(escalationSurvivesFailure({ recommendation: 'not_enough_to_say' })).toBe(false);
  });

  it('handles a row with no read at all, and no row', () => {
    expect(escalationSurvivesFailure({ recommendation: null })).toBe(false);
    expect(escalationSurvivesFailure({})).toBe(false);
    expect(escalationSurvivesFailure(null)).toBe(false);
    expect(escalationSurvivesFailure(undefined)).toBe(false);
  });
});

describe('escalationSurvivesReRead — an escalation stays on screen through a re-read (CUL-827)', () => {
  it('holds a worth_a_call, and a verdict this build does not know yet', () => {
    expect(escalationSurvivesReRead({ recommendation: 'worth_a_call' })).toBe(true);
    expect(escalationSurvivesReRead({ recommendation: 'call_now' })).toBe(true);
  });

  it('does NOT hold a quiet verdict in front of a read that has not finished', () => {
    expect(escalationSurvivesReRead({ recommendation: 'monitor' })).toBe(false);
    expect(escalationSurvivesReRead({ recommendation: 'not_enough_to_say' })).toBe(false);
  });

  it('holds nothing when there is no read', () => {
    expect(escalationSurvivesReRead({ recommendation: null })).toBe(false);
    expect(escalationSurvivesReRead(null)).toBe(false);
    expect(escalationSurvivesReRead(undefined)).toBe(false);
  });
});
