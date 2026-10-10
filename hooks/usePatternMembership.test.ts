// K2 (CUL-1515): the record's membership hook. The read is stubbed, never the rule (C-34).
const mockRead = jest.fn();
jest.mock('../lib/incidentPattern', () => ({ readPatternMembership: (i: unknown) => mockRead(i) }));

import { renderHook, waitFor } from '@testing-library/react-native';
import { usePatternMembership } from './usePatternMembership';

const A = { identity: 'a', noun: 'vomiting', href: '/signal/a?pet=p' };

beforeEach(() => mockRead.mockReset());

describe('usePatternMembership', () => {
  it('asks nothing for a read that cannot take the word', () => {
    const { result } = renderHook(() => usePatternMembership({ petId: 'p', eventId: 'e1', eventType: 'vomit' }, false, 'k'));
    expect(result.current).toBeNull();
    expect(mockRead).not.toHaveBeenCalled();
  });

  it("never shows one record's finding on another while the new answer is in flight", async () => {
    mockRead.mockResolvedValueOnce(A).mockReturnValueOnce(new Promise(() => undefined));
    const { result, rerender } = renderHook(
      ({ eventId }: { eventId: string }) => usePatternMembership({ petId: 'p', eventId, eventType: 'vomit' }, true, 'k'),
      { initialProps: { eventId: 'e1' } },
    );
    await waitFor(() => expect(result.current).toEqual(A));
    rerender({ eventId: 'e2' });
    expect(result.current).toBeNull();
    expect(mockRead).toHaveBeenLastCalledWith({ petId: 'p', eventId: 'e2', eventType: 'vomit' });
  });
});
