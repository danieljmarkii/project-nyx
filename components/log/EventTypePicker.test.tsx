import { render, fireEvent, within } from '@testing-library/react-native';
import { EventTypePicker } from './EventTypePicker';
import { EVENT_TYPES, EventTypeKey } from '../../constants/eventTypes';

// EventTypePicker is a pure props component (no store/hook), which is exactly what
// lets the flag-off grid be snapshot-pinned directly (FL-1: flag-off renders
// byte-identical). The flag lives in app/log.tsx; here we render both variants.

// The shipped flat grid's tiles, in EVENT_TYPES order with diarrhea filtered to its
// sub-step, NO photo tile (photo-first entry retired, R4), and NO v2Only tile
// (CUL-675: the taxonomy leaves live only on the EXPANDED grouped grid — the flat
// grid is the pre-expansion picker, frozen at eight tiles until FL-4 retires it).
// If this list changes, the flag-off path is no longer today's picker — the point
// of pinning it. This is the §12 pin, deliberately on the PICKER SURFACE, not the
// constant: EVENT_TYPES grew by two in W1-PR-2 and this grid did not.
const FLAT_LABELS_IN_ORDER = [
  'Meal', 'Vomit', 'Stool', 'Lethargy', 'Itch/Scratch', 'Medication', 'Weight', 'Other',
];

describe('EventTypePicker — flag-off (flat grid, byte-identical)', () => {
  it('renders the shipped flat grid unchanged', () => {
    const { toJSON } = render(<EventTypePicker grouped={false} onSelectType={jest.fn()} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders exactly the eight top-level tiles in EVENT_TYPES order, no photo tile', () => {
    const { getAllByText } = render(<EventTypePicker grouped={false} onSelectType={jest.fn()} />);
    // Every expected label present…
    FLAT_LABELS_IN_ORDER.forEach((label) => {
      expect(getAllByText(label)).toHaveLength(1);
    });
    // …and no "Attach photo" tile (the removed photo-first entry) and no raw
    // "Loose stool" tile (diarrhea is reached through Stool's sub-step).
    const { queryByText } = render(<EventTypePicker grouped={false} onSelectType={jest.fn()} />);
    expect(queryByText('Attach photo')).toBeNull();
    expect(queryByText('Loose stool')).toBeNull();
  });

  it('never renders a v2Only tile — the flat grid is structurally pre-expansion, at any flag state', () => {
    // No `expanded` prop can reach the flat grid: the filter is on v2Only itself,
    // so the taxonomy tiles cannot leak here even if a host passed expanded=true.
    const { queryByText } = render(
      <EventTypePicker grouped={false} expanded species="cat" onSelectType={jest.fn()} />,
    );
    expect(queryByText('Cough')).toBeNull();
    expect(queryByText('Sneeze')).toBeNull();
  });

  it('routes each tile to its event type (Stool → the stool_normal sub-step)', () => {
    const onSelectType = jest.fn();
    const { getByText } = render(<EventTypePicker grouped={false} onSelectType={onSelectType} />);
    fireEvent.press(getByText('Vomit'));
    expect(onSelectType).toHaveBeenLastCalledWith<[EventTypeKey]>('vomit');
    fireEvent.press(getByText('Stool'));
    expect(onSelectType).toHaveBeenLastCalledWith<[EventTypeKey]>('stool_normal');
    fireEvent.press(getByText('Other'));
    expect(onSelectType).toHaveBeenLastCalledWith<[EventTypeKey]>('other');
  });
});

describe('EventTypePicker — flag-on (grouped grid)', () => {
  it('renders the grouped grid', () => {
    const { toJSON } = render(<EventTypePicker grouped onSelectType={jest.fn()} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders the three category groups', () => {
    const { getByText } = render(<EventTypePicker grouped onSelectType={jest.fn()} />);
    // SectionLabel uppercases via style, not the string, so match the source text.
    expect(getByText('Symptoms')).toBeTruthy();
    expect(getByText('Food & care')).toBeTruthy();
    expect(getByText('Body & more')).toBeTruthy();
  });

  it('splits Stool inline (Normal → stool_normal, Loose → diarrhea) and keeps every other route', () => {
    const onSelectType = jest.fn();
    const { getByText } = render(<EventTypePicker grouped onSelectType={onSelectType} />);
    // PR 2 deletes the Normal/Loose sub-step: the split tile's two segments route
    // straight to the two event types (the same routes the sub-step used).
    fireEvent.press(getByText('Normal'));
    expect(onSelectType).toHaveBeenLastCalledWith<[EventTypeKey]>('stool_normal');
    fireEvent.press(getByText('Loose'));
    expect(onSelectType).toHaveBeenLastCalledWith<[EventTypeKey]>('diarrhea');
    // A regular tile still routes by its own key.
    fireEvent.press(getByText('Meal'));
    expect(onSelectType).toHaveBeenLastCalledWith<[EventTypeKey]>('meal');
    fireEvent.press(getByText('Vomit'));
    expect(onSelectType).toHaveBeenLastCalledWith<[EventTypeKey]>('vomit');
  });

  it('surfaces the loose-stool route as the split "Loose" segment, never a top-level "Loose stool" tile', () => {
    const { queryByText, getByText } = render(<EventTypePicker grouped onSelectType={jest.fn()} />);
    // The short "Loose" segment lives on the split tile…
    expect(getByText('Loose')).toBeTruthy();
    // …but diarrhea's full EVENT_TYPES label is never a top-level tile (the flat
    // grid filters it out; the grouped grid names it "Loose" on the split tile).
    expect(queryByText('Loose stool')).toBeNull();
  });

  it('surfaces every top-level pre-expansion type exactly once (no type silently vanishes)', () => {
    // Completeness guard, derived from EVENT_TYPES rather than a hand-list: the flat
    // grid iterates EVENT_TYPES directly, but the UNEXPANDED grouped grid is a
    // hand-maintained PICKER_GROUPS. A future type that gets a CATEGORY_TINT
    // (compile-checked) but is forgotten in PICKER_GROUPS would show in flat and
    // silently disappear here — so assert each non-diarrhea, non-v2Only label renders
    // exactly once (getByText throws on 0 OR >1, so this catches both a missing type
    // and one placed in two groups). v2Only tiles belong to the EXPANDED grid — their
    // completeness guard lives in the expanded describe below.
    const { getByText } = render(<EventTypePicker grouped onSelectType={jest.fn()} />);
    (Object.keys(EVENT_TYPES) as EventTypeKey[])
      .filter((key) => key !== 'diarrhea' && !EVENT_TYPES[key].v2Only)
      .forEach((key) => {
        const label = key === 'stool_normal' ? 'Stool' : EVENT_TYPES[key].label;
        expect(getByText(label)).toBeTruthy();
      });
  });

  it('unexpanded (event_types_v2 off) is the pre-taxonomy grid: no Breathing group, no Cough/Sneeze (FL-1)', () => {
    const { queryByText } = render(<EventTypePicker grouped onSelectType={jest.fn()} />);
    expect(queryByText('Breathing')).toBeNull();
    expect(queryByText('Cough')).toBeNull();
    expect(queryByText('Sneeze')).toBeNull();
    // …and the regroup rides the flag too: today's three headers, verbatim.
    expect(queryByText('Symptoms')).toBeTruthy();
    expect(queryByText('Digestion')).toBeNull();
  });

  it('places each type in its category group (tint follows the group)', () => {
    // Pin membership structurally so a regroup can't silently move a glyph to the
    // wrong category tint (the CATEGORY_TINT keying rationale).
    const { getByTestId } = render(<EventTypePicker grouped onSelectType={jest.fn()} />);
    const symptoms = within(getByTestId('event-group-Symptoms'));
    const foodCare = within(getByTestId('event-group-Food & care'));
    const bodyMore = within(getByTestId('event-group-Body & more'));

    // Stool's split segments live inside the Symptoms group alongside the tiles.
    ['Vomit', 'Lethargy', 'Stool', 'Itch/Scratch', 'Normal', 'Loose'].forEach((l) =>
      expect(symptoms.getByText(l)).toBeTruthy());
    ['Meal', 'Medication'].forEach((l) => expect(foodCare.getByText(l)).toBeTruthy());
    ['Weight', 'Other'].forEach((l) => expect(bodyMore.getByText(l)).toBeTruthy());

    // …and not cross-contaminated: Meal is not a symptom, Vomit is not food & care,
    // and the stool split segments stay in Symptoms.
    expect(symptoms.queryByText('Meal')).toBeNull();
    expect(foodCare.queryByText('Vomit')).toBeNull();
    expect(foodCare.queryByText('Loose')).toBeNull();
  });
});

// ── The taxonomy grid (event_types_v2, W1 — CUL-675) ─────────────────────────
// The confirmed round-3 W1 frame is the design authority: ten tiles, seven groups,
// the ruled regroup (Digestion — never "Tummy"; Lethargy under Energy & behavior;
// Other alone under More), Cough + Sneeze in a Breathing group directly under
// Digestion. The exact group→keys structure is pinned in
// constants/eventTypes.membership.test.ts against expandedPickerGroups; this block
// pins the RENDERED surface + its routes.
describe('EventTypePicker — flag-on + expanded (the W1 taxonomy grid)', () => {
  it('renders the expanded grid', () => {
    const { toJSON } = render(<EventTypePicker grouped expanded onSelectType={jest.fn()} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders the seven family groups of the confirmed W1 frame, in order', () => {
    const { getByText } = render(<EventTypePicker grouped expanded onSelectType={jest.fn()} />);
    ['Digestion', 'Breathing', 'Skin & coat', 'Energy & behavior', 'Measurements', 'Food & care', 'More']
      .forEach((label) => expect(getByText(label)).toBeTruthy());
  });

  it('Cough and Sneeze render in the Breathing group and route by their own keys', () => {
    const onSelectType = jest.fn();
    const { getByText, getByTestId } = render(
      <EventTypePicker grouped expanded onSelectType={onSelectType} />,
    );
    const breathing = within(getByTestId('event-group-Breathing'));
    expect(breathing.getByText('Cough')).toBeTruthy();
    expect(breathing.getByText('Sneeze')).toBeTruthy();
    fireEvent.press(getByText('Cough'));
    expect(onSelectType).toHaveBeenLastCalledWith<[EventTypeKey]>('cough');
    fireEvent.press(getByText('Sneeze'));
    expect(onSelectType).toHaveBeenLastCalledWith<[EventTypeKey]>('sneeze');
  });

  it('surfaces EVERY type exactly once — v2Only tiles included (the expanded completeness guard)', () => {
    const { getByText } = render(<EventTypePicker grouped expanded onSelectType={jest.fn()} />);
    (Object.keys(EVENT_TYPES) as EventTypeKey[])
      .filter((key) => key !== 'diarrhea')
      .forEach((key) => {
        const label = key === 'stool_normal' ? 'Stool' : EVENT_TYPES[key].label;
        expect(getByText(label)).toBeTruthy();
      });
  });

  it('the split Stool tile survives the regroup — Normal/Loose still route inside Digestion', () => {
    const onSelectType = jest.fn();
    const { getByTestId } = render(
      <EventTypePicker grouped expanded onSelectType={onSelectType} />,
    );
    const digestion = within(getByTestId('event-group-Digestion'));
    fireEvent.press(digestion.getByText('Normal'));
    expect(onSelectType).toHaveBeenLastCalledWith<[EventTypeKey]>('stool_normal');
    fireEvent.press(digestion.getByText('Loose'));
    expect(onSelectType).toHaveBeenLastCalledWith<[EventTypeKey]>('diarrhea');
  });

  it('accepts the active pet species without changing the W1 grid (no W1 leaf is species-conditional)', () => {
    // The MECHANISM (a cat never sees a dog-only leaf) is unit-tested against
    // hypothetical entries in the membership test; here we pin that passing a real
    // species renders the same ten tiles — the dog grid at W1 is this frame with
    // the dog's name (mock capnote).
    const cat = render(<EventTypePicker grouped expanded species="cat" onSelectType={jest.fn()} />);
    const dog = render(<EventTypePicker grouped expanded species="dog" onSelectType={jest.fn()} />);
    for (const view of [cat, dog]) {
      expect(view.getByText('Cough')).toBeTruthy();
      expect(view.getByText('Sneeze')).toBeTruthy();
      expect(view.getByText('Meal')).toBeTruthy();
    }
  });
});
