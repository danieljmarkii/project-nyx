import { FORMAT_LABEL, foodFormatTag, foodFormatWord } from './foodFormat';

// B-556. The defect this module closes: "Royal Canin · Selected Protein PR" is ONE
// brand and ONE product name stocked in BOTH wet and dry, so every event surface
// rendered two genuinely different foods as the same string. These tests pin the
// naming rule the five surfaces share.

describe('foodFormatTag', () => {
  it('names the two variants of one product distinguishably — the B-556 case', () => {
    // The whole point: same brand, same product, different tag.
    expect(foodFormatTag('dry_kibble')).toBe('DRY');
    expect(foodFormatTag('wet_canned')).toBe('WET');
    expect(foodFormatTag('dry_kibble')).not.toBe(foodFormatTag('wet_canned'));
  });

  it('covers every mapped format so a new enum value cannot silently render blank', () => {
    for (const [value, label] of Object.entries(FORMAT_LABEL)) {
      expect(foodFormatTag(value)).toBe(label.toUpperCase());
    }
  });

  it('adds nothing when the format is unspecified, unknown, or missing', () => {
    // 'other' is deliberately absent from the map — an unspecified form has nothing
    // honest to say, and a future enum value degrades to no tag rather than to a raw
    // SCREAMING_SNAKE token on screen.
    expect(foodFormatTag('other')).toBeNull();
    expect(foodFormatTag('some_future_format')).toBeNull();
    expect(foodFormatTag(null)).toBeNull();
    expect(foodFormatTag(undefined)).toBeNull();
    expect(foodFormatTag('')).toBeNull();
  });

  it('suppresses a tag that would only echo the row label', () => {
    // A treat-format treat renders row label "Treat"; tagging it "TREAT" is noise.
    expect(foodFormatTag('treat', 'Treat')).toBeNull();
    expect(foodFormatTag('treat', 'treat')).toBeNull();
    expect(foodFormatTag('treat', ' Treat ')).toBeNull();
  });

  it('keeps a tag that says something the row label does not', () => {
    // A treat logged as a Meal-labelled row, and a treat-typed row of dry kibble, both
    // still carry information — suppression is per-value, never blanket.
    expect(foodFormatTag('treat', 'Meal')).toBe('TREAT');
    expect(foodFormatTag('dry_kibble', 'Treat')).toBe('DRY');
    expect(foodFormatTag('human_food', 'Treat')).toBe('HUMAN FOOD');
  });
});

describe('foodFormatWord', () => {
  it('returns the sentence-register form for prose surfaces', () => {
    // The completion card ("Logged · X (Dry)") and the vet report read as sentences,
    // so they take the title-case word rather than the scannable caps tag.
    expect(foodFormatWord('dry_kibble')).toBe('Dry');
    expect(foodFormatWord('wet_canned')).toBe('Wet');
    expect(foodFormatWord('freeze_dried')).toBe('Freeze-dried');
  });

  it('inherits the same suppression rules as the tag', () => {
    expect(foodFormatWord('other')).toBeNull();
    expect(foodFormatWord(null)).toBeNull();
    expect(foodFormatWord('treat', 'Treat')).toBeNull();
  });
});
