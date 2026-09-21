import { parseSignalRouteParams, signalScreenHref } from './signalRoute';

describe('the Signal route (D2-3 · CUL-1065)', () => {
  it('builds an href with the identity and the pet encoded, which the router hands back decoded', () => {
    const href = signalScreenHref('pet-1', 'food_symptom_correlation:chicken+duck');
    expect(href).toBe('/signal/food_symptom_correlation%3Achicken%2Bduck?pet=pet-1');
    // `useLocalSearchParams` decodes once; the parser must not decode again.
    expect(parseSignalRouteParams({ id: 'food_symptom_correlation:chicken+duck', pet: 'pet-1' })).toEqual({
      identity: 'food_symptom_correlation:chicken+duck',
      petId: 'pet-1',
    });
    expect(parseSignalRouteParams({ id: 'a%20b', pet: 'pet-1' })?.identity).toBe('a%20b');
  });

  it('takes the first of an array', () => {
    expect(parseSignalRouteParams({ id: 'symptom_chronicity:vomit', pet: ['pet-1', 'pet-2'] })).toEqual({
      identity: 'symptom_chronicity:vomit',
      petId: 'pet-1',
    });
  });

  it('a malformed deep link parses to null — never a guessed pet (C-9)', () => {
    expect(parseSignalRouteParams({ id: 'symptom_chronicity:vomit' })).toBeNull();
    expect(parseSignalRouteParams({ pet: 'pet-1' })).toBeNull();
    expect(parseSignalRouteParams({ id: '', pet: 'pet-1' })).toBeNull();
    expect(parseSignalRouteParams({})).toBeNull();
  });
});
