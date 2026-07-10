import { useSignalMarkStore } from './signalMarkStore';

describe('signalMarkStore (B-284 §3 pulse contract)', () => {
  beforeEach(() => {
    useSignalMarkStore.setState({ seenSignatures: {} });
  });

  it('records the seen signature per pet, independent of other pets', () => {
    useSignalMarkStore.getState().markSeen('pet-a', 'sig-1');
    expect(useSignalMarkStore.getState().seenSignatures).toEqual({ 'pet-a': 'sig-1' });

    useSignalMarkStore.getState().markSeen('pet-b', 'sig-2');
    expect(useSignalMarkStore.getState().seenSignatures).toEqual({
      'pet-a': 'sig-1',
      'pet-b': 'sig-2',
    });
  });

  it('a new signature for an already-seen pet overwrites, re-arming the pulse for the new set', () => {
    useSignalMarkStore.getState().markSeen('pet-a', 'sig-1');
    useSignalMarkStore.getState().markSeen('pet-a', 'sig-2');
    expect(useSignalMarkStore.getState().seenSignatures['pet-a']).toBe('sig-2');
  });

  it('re-marking the same signature is a no-op (no unnecessary state churn)', () => {
    useSignalMarkStore.getState().markSeen('pet-a', 'sig-1');
    const before = useSignalMarkStore.getState().seenSignatures;
    useSignalMarkStore.getState().markSeen('pet-a', 'sig-1');
    expect(useSignalMarkStore.getState().seenSignatures).toBe(before);
  });
});
