// CUL-2793 (C-34): the server's possible-phantom rule mirrors the client's. Both answer ONE
// question, "may the old recheck wheel have written this booking by itself?", so they must agree
// on every reason. The client's (`isPhantomRecheckBooking`, CUL-2788 #1542) keeps the recheck row
// from reading Booked; the server's (`isPossibleRecheckPhantom`) keeps the care state from going
// quiet. If one widens and the other does not, a surface says booked where another says not.
import { isPhantomRecheckBooking } from '../lib/vetVisits';
import { isPossibleRecheckPhantom } from '../supabase/functions/generate-signal/careState';

const REASONS: ReadonlyArray<string | null> = [
  'recheck', 'Recheck', 'RECHECK', ' recheck ', '\trecheck\n', 'recheck ',
  null, '', '   ', 'rechecks', 're-check', 'Recheck.', 'recheck ears', 'dental', 'Annual exam',
];

describe('the phantom recheck rule, client and server (CUL-2793)', () => {
  it.each(REASONS.map((r) => [JSON.stringify(r), r] as const))('agrees on %s', (_label, reason) => {
    expect(isPossibleRecheckPhantom(reason)).toBe(isPhantomRecheckBooking({ reason }));
  });

  it('is not vacuous: both flag the wheel\'s own reason and pass a real one', () => {
    expect(isPossibleRecheckPhantom('recheck')).toBe(true);
    expect(isPossibleRecheckPhantom('dental')).toBe(false);
  });
});
