// useSafeAreaInsets needs a provider jest-expo doesn't stand up — stub the
// module (the DayEventsSheet / app/insights test pattern).
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

import { render, fireEvent } from '@testing-library/react-native';
import { Pill } from 'lucide-react-native';
import { ScopeMenu, ScopeMenuOption } from './ScopeMenu';

const OPTIONS: ScopeMenuOption[] = [
  { key: null, label: 'All types' },
  { key: 'meal', label: 'Meal' },
  { key: 'medication', label: 'Medication', icon: Pill },
];

function renderMenu(over: Partial<React.ComponentProps<typeof ScopeMenu>> = {}) {
  const onChange = jest.fn();
  const utils = render(
    <ScopeMenu
      options={OPTIONS}
      value={null}
      onChange={onChange}
      sheetLabel="Show only"
      accessibilityPrefix="Event type"
      {...over}
    />,
  );
  return { ...utils, onChange };
}

describe('ScopeMenu', () => {
  it('shows the active option on the pill and every option in the sheet', () => {
    const { getByLabelText, getByText, queryByText } = renderMenu({ value: 'medication' });
    // Pill reads the selected option — the medication filter is never hidden.
    getByLabelText('Event type: Medication');
    expect(queryByText('Show only')).toBeNull();

    fireEvent.press(getByLabelText('Event type: Medication'));
    // Sheet lists ALL options as rows — the whole point vs the old h-scroll rail.
    getByText('Show only');
    getByText('All types');
    getByText('Meal');
    expect(getByLabelText('Medication').props.accessibilityState.selected).toBe(true);
    expect(getByLabelText('Meal').props.accessibilityState.selected).toBe(false);
  });

  it('selecting an option fires onChange with its key and closes the sheet', () => {
    const { getByLabelText, onChange, queryByText } = renderMenu();
    fireEvent.press(getByLabelText('Event type: All types'));
    fireEvent.press(getByLabelText('Medication'));
    expect(onChange).toHaveBeenCalledWith('medication');
    expect(queryByText('Show only')).toBeNull();
  });

  it('selecting the default option fires onChange(null)', () => {
    const { getByLabelText, onChange } = renderMenu({ value: 'meal' });
    fireEvent.press(getByLabelText('Event type: Meal'));
    fireEvent.press(getByLabelText('All types'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('an overrideLabel labels the pill and deselects every row (B-308 day drill-in)', () => {
    const { getByLabelText } = renderMenu({ overrideLabel: 'Jun 24' });
    fireEvent.press(getByLabelText('Event type: Jun 24'));
    // The override is a transient scope, not an option — no row reads selected.
    expect(getByLabelText('All types').props.accessibilityState.selected).toBe(false);
    expect(getByLabelText('Meal').props.accessibilityState.selected).toBe(false);
  });

  it('scrim press closes the sheet without changing the scope', () => {
    const { getByLabelText, onChange, queryByText } = renderMenu();
    fireEvent.press(getByLabelText('Event type: All types'));
    fireEvent.press(getByLabelText('Close'));
    expect(queryByText('Show only')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
