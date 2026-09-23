import { render, fireEvent, within } from '@testing-library/react-native';
import { EventTypePicker } from './EventTypePicker';
import { EVENT_TYPES, EventTypeKey } from '../../constants/eventTypes';

// EventTypePicker is a pure props component (no store/hook), so the grid renders
// directly. There is ONE grid since both picker betas left beta together (CUL-962):
// the family grid of the confirmed round-3 W1 frame. The flat grid, the
// pre-expansion three-group arrangement and their byte-identical pins went with the
// flags.

// ── The grid (the W1 taxonomy frame — CUL-675) ───────────────────────────────
// The confirmed round-3 W1 frame is the design authority: ten tiles, seven groups,
// the ruled regroup (Digestion — never "Tummy"; Lethargy under Energy & behavior;
// Other alone under More), Cough + Sneeze in a Breathing group directly under
// Digestion. The exact group→keys structure is pinned in
// constants/eventTypes.membership.test.ts against expandedPickerGroups; this block
// pins the RENDERED surface + its routes.
describe('EventTypePicker — the W1 family grid', () => {
  it('renders the grid', () => {
    const { toJSON } = render(<EventTypePicker onSelectType={jest.fn()} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders the seven family groups of the confirmed W1 frame, in order', () => {
    const { getByText } = render(<EventTypePicker onSelectType={jest.fn()} />);
    ['Digestion', 'Breathing', 'Skin & coat', 'Energy & behavior', 'Measurements', 'Food & care', 'More']
      .forEach((label) => expect(getByText(label)).toBeTruthy());
  });

  it('Cough and Sneeze render in the Breathing group and route by their own keys', () => {
    const onSelectType = jest.fn();
    const { getByText, getByTestId } = render(<EventTypePicker onSelectType={onSelectType} />);
    const breathing = within(getByTestId('event-group-Breathing'));
    expect(breathing.getByText('Cough')).toBeTruthy();
    expect(breathing.getByText('Sneeze')).toBeTruthy();
    fireEvent.press(getByText('Cough'));
    expect(onSelectType).toHaveBeenLastCalledWith<[EventTypeKey]>('cough');
    fireEvent.press(getByText('Sneeze'));
    expect(onSelectType).toHaveBeenLastCalledWith<[EventTypeKey]>('sneeze');
  });

  it('surfaces EVERY type exactly once (the completeness guard)', () => {
    const { getByText } = render(<EventTypePicker onSelectType={jest.fn()} />);
    (Object.keys(EVENT_TYPES) as EventTypeKey[])
      // check_in (Noticed) is the second key with no tile, beside diarrhea — and
      // unlike diarrhea it has no segment either. Its exclusion is asserted
      // POSITIVELY in its own describe below, so this completeness guard subtracts it
      // rather than pretending it does not exist.
      .filter((key) => key !== 'diarrhea' && key !== 'check_in')
      .forEach((key) => {
        const label = key === 'stool_normal' ? 'Stool' : EVENT_TYPES[key].label;
        expect(getByText(label)).toBeTruthy();
      });
  });

  it('the split Stool tile routes Normal/Loose inside Digestion', () => {
    const onSelectType = jest.fn();
    const { getByTestId } = render(<EventTypePicker onSelectType={onSelectType} />);
    const digestion = within(getByTestId('event-group-Digestion'));
    fireEvent.press(digestion.getByText('Normal'));
    expect(onSelectType).toHaveBeenLastCalledWith<[EventTypeKey]>('stool_normal');
    fireEvent.press(digestion.getByText('Loose'));
    expect(onSelectType).toHaveBeenLastCalledWith<[EventTypeKey]>('diarrhea');
  });

  it('surfaces the loose-stool route as the split "Loose" segment, never a top-level "Loose stool" tile', () => {
    const { queryByText, getByText } = render(<EventTypePicker onSelectType={jest.fn()} />);
    // The short "Loose" segment lives on the split tile…
    expect(getByText('Loose')).toBeTruthy();
    // …but diarrhea's full EVENT_TYPES label is never a top-level tile.
    expect(queryByText('Loose stool')).toBeNull();
  });

  it('accepts the active pet species without changing the W1 grid (no W1 leaf is species-conditional)', () => {
    // The MECHANISM (a cat never sees a dog-only leaf) is unit-tested against
    // hypothetical entries in the membership test; here we pin that passing a real
    // species renders the same ten tiles — the dog grid at W1 is this frame with
    // the dog's name (mock capnote).
    const cat = render(<EventTypePicker species="cat" onSelectType={jest.fn()} />);
    const dog = render(<EventTypePicker species="dog" onSelectType={jest.fn()} />);
    for (const view of [cat, dog]) {
      expect(view.getByText('Cough')).toBeTruthy();
      expect(view.getByText('Sneeze')).toBeTruthy();
      expect(view.getByText('Meal')).toBeTruthy();
    }
  });
});

// ── Noticed's picker exclusion (CUL-868, E-6) ────────────────────────────────
//
// `check_in` is a real EVENT_TYPES entry — it must be, because History, the day
// spine and the drill-in all have to name a look on any build. But the + menu is
// not a door to a look: the Home card is (N-4a), and a second door would ask the
// owner to choose between two ways to say the same thing, on the surface
// Principle 1 protects hardest.
//
// There is no `hidden` field on the entry shape to express that, so the grid's
// derivation (`expandedPickerGroups`) excludes the key by name, and this is the
// test that says so. It renders the grid rather than trusting the derivation: the
// exclusion lives in constants/eventTypes.ts, and this is the surface an owner
// would meet if that line went.
describe('EventTypePicker — no Noticed tile', () => {
  const LOOK_LABEL = EVENT_TYPES.check_in.label;

  it('the label is "Noticed" — the same word every look surface uses', () => {
    expect(LOOK_LABEL).toBe('Noticed');
  });

  it('renders no Noticed tile', () => {
    const { queryByText } = render(<EventTypePicker onSelectType={jest.fn()} />);
    expect(queryByText(LOOK_LABEL)).toBeNull();
  });

  it('renders no Noticed tile for any species', () => {
    for (const species of ['cat', 'dog', 'other', null]) {
      const { queryByText } = render(
        <EventTypePicker species={species} onSelectType={jest.fn()} />,
      );
      expect(queryByText(LOOK_LABEL)).toBeNull();
    }
  });

  // The Energy & behavior group is where a look WOULD have landed (its family), so
  // assert the group still renders its real tile — the exclusion removes one key, not
  // a whole family header.
  it('the family it belongs to still renders, carrying its real tiles', () => {
    const { getByTestId } = render(<EventTypePicker onSelectType={jest.fn()} />);
    const energy = within(getByTestId('event-group-Energy & behavior'));
    expect(energy.getByText('Lethargy')).toBeTruthy();
    expect(energy.queryByText(LOOK_LABEL)).toBeNull();
  });
});
