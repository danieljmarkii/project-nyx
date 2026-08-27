import { UtensilsCrossed, BatteryLow, Scale, Ellipsis, PawPrint, Pill, CircleHelp, AudioLines, Wind } from 'lucide-react-native';
import { iconForType } from './EventIcon';
import { VomitGlyph, StoolFormedGlyph, StoolLooseGlyph } from './eventGlyphs';
import { EVENT_TYPES, EventTypeKey } from '../../constants/eventTypes';

// Pure (render-free) coverage of the type→glyph resolver. The render path is a
// trivial pass-through to the glyph component, so we test the only branch that
// carries logic: the unknown-type fallback — plus the exact B-745 mapping, so a
// glyph can never silently drift from the type it names.
describe('iconForType', () => {
  it('maps a known event type to its glyph', () => {
    // B-745 — the first three custom-family glyphs replace the weakest Lucide
    // literal matches (Droplet/Circle/Droplets); the rest stay Lucide substitutes.
    expect(iconForType('meal')).toBe(UtensilsCrossed);
    expect(iconForType('vomit')).toBe(VomitGlyph);
    expect(iconForType('stool_normal')).toBe(StoolFormedGlyph);
    expect(iconForType('diarrhea')).toBe(StoolLooseGlyph);
    expect(iconForType('itch')).toBe(PawPrint);
    expect(iconForType('medication')).toBe(Pill);
    // lethargy = BatteryLow (Moon retired to the brand crescent, R2); other =
    // Ellipsis (Plus is reserved for add/create).
    expect(iconForType('lethargy')).toBe(BatteryLow);
    expect(iconForType('other')).toBe(Ellipsis);
    // weight_check graduated from UI-unexposed to a real quick-log type (B-186).
    expect(iconForType('weight_check')).toBe(Scale);
    // W1 respiratory pair (CUL-675) — the round-3-mock-drawn Lucide substitutes;
    // B-746 commissions custom family marks later (checklist item 4).
    expect(iconForType('cough')).toBe(AudioLines);
    expect(iconForType('sneeze')).toBe(Wind);
  });

  it('resolves every EVENT_TYPES key to the ref declared on the type', () => {
    (Object.keys(EVENT_TYPES) as EventTypeKey[]).forEach((key) => {
      expect(iconForType(key)).toBe(EVENT_TYPES[key].icon);
    });
  });

  it('falls back to CircleHelp for an unknown / UI-unexposed event type', () => {
    expect(iconForType('skin_reaction')).toBe(CircleHelp);
    expect(iconForType('')).toBe(CircleHelp);
  });

  it('does NOT fall back to the stool_normal glyph (the collision guard)', () => {
    // StoolFormedGlyph is the real glyph for stool_normal; an unknown type must not
    // render the same swirl and masquerade as a stool.
    expect(iconForType('bogus_type')).not.toBe(iconForType('stool_normal'));
  });
});
