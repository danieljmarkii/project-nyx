import { UtensilsCrossed, Wind, Circle, CircleHelp } from 'lucide-react-native';
import { iconForType } from './EventIcon';
import { EVENT_TYPES, EventTypeKey } from '../../constants/eventTypes';

// Pure (render-free) coverage of the type→glyph resolver. The render path is a
// trivial pass-through to a Lucide component, so we test the only branch that
// carries logic: the unknown-type fallback.
describe('iconForType', () => {
  it('maps a known event type to its Lucide glyph', () => {
    expect(iconForType('meal')).toBe(UtensilsCrossed);
    expect(iconForType('vomit')).toBe(Wind);
    expect(iconForType('stool_normal')).toBe(Circle);
  });

  it('resolves every EVENT_TYPES key to the ref declared on the type', () => {
    (Object.keys(EVENT_TYPES) as EventTypeKey[]).forEach((key) => {
      expect(iconForType(key)).toBe(EVENT_TYPES[key].icon);
    });
  });

  it('falls back to CircleHelp for an unknown / UI-unexposed event type', () => {
    expect(iconForType('skin_reaction')).toBe(CircleHelp);
    expect(iconForType('weight_check')).toBe(CircleHelp);
    expect(iconForType('')).toBe(CircleHelp);
  });

  it('does NOT fall back to the stool_normal glyph (the collision guard)', () => {
    // Circle is the real glyph for stool_normal; an unknown type must not
    // render an identical Circle and masquerade as a stool.
    expect(iconForType('bogus_type')).not.toBe(iconForType('stool_normal'));
  });
});
