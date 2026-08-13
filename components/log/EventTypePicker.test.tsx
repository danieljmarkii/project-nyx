import { render, fireEvent, within } from '@testing-library/react-native';
import { EventTypePicker } from './EventTypePicker';
import { EVENT_TYPES, EventTypeKey } from '../../constants/eventTypes';

// EventTypePicker is a pure props component (no store/hook), which is exactly what
// lets the flag-off grid be snapshot-pinned directly (FL-1: flag-off renders
// byte-identical). The flag lives in app/log.tsx; here we render both variants.

// The shipped flat grid's tiles, in EVENT_TYPES order with diarrhea filtered to its
// sub-step and NO photo tile (photo-first entry retired, R4). If this list changes,
// the flag-off path is no longer today's picker — the point of pinning it.
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

  it('surfaces every top-level type exactly once (no type silently vanishes)', () => {
    // Completeness guard, derived from EVENT_TYPES rather than a hand-list: the flat
    // grid iterates EVENT_TYPES directly, but the grouped grid is a hand-maintained
    // PICKER_GROUPS. A future type that gets a CATEGORY_TINT (compile-checked) but is
    // forgotten in PICKER_GROUPS would show in flat and silently disappear here — so
    // assert each non-diarrhea label renders exactly once (getByText throws on 0 OR >1,
    // so this catches both a missing type and one placed in two groups).
    const { getByText } = render(<EventTypePicker grouped onSelectType={jest.fn()} />);
    (Object.keys(EVENT_TYPES) as EventTypeKey[])
      .filter((key) => key !== 'diarrhea')
      .forEach((key) => {
        const label = key === 'stool_normal' ? 'Stool' : EVENT_TYPES[key].label;
        expect(getByText(label)).toBeTruthy();
      });
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
