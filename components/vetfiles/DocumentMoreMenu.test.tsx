import { render, fireEvent } from '@testing-library/react-native';

// useSafeAreaInsets needs a provider jest-expo doesn't stand up — stub it (the
// shipped convention across these component tests).
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

import { DocumentMoreMenu } from './DocumentMoreMenu';
import type { AlsoAddTarget } from './DocumentSavedMoment';

// The ⋯ menu grew two conditional actions: "Add another page" (B-549, image docs
// only) and D13's "Also add to {other pet}" (B-547, multi-pet only). Rename and
// Delete are always present; the two additive items appear only when their props
// are supplied, so a single-pet PDF sees exactly the original two-item menu.

const noop = () => {};

describe('DocumentMoreMenu — the always-present floor', () => {
  it('renders Rename and Delete with the 30-day recovery promise', () => {
    const { getByText } = render(
      <DocumentMoreMenu visible onClose={noop} onRename={noop} onDelete={noop} />,
    );
    expect(getByText('Rename')).toBeTruthy();
    expect(getByText('Delete')).toBeTruthy();
    // AC 5 — the window is named where the undo is.
    expect(getByText('Kept for 30 days — undo from the library')).toBeTruthy();
  });

  it('shows neither additive action when its prop is absent (single-pet PDF)', () => {
    const { queryByText } = render(
      <DocumentMoreMenu visible onClose={noop} onRename={noop} onDelete={noop} />,
    );
    expect(queryByText('Add another page')).toBeNull();
    expect(queryByText(/Also add to/)).toBeNull();
  });
});

describe('DocumentMoreMenu — Add another page (B-549)', () => {
  it('renders and fires only when onAddPage is supplied (an image document)', () => {
    const onAddPage = jest.fn();
    const { getByText } = render(
      <DocumentMoreMenu
        visible
        onClose={noop}
        onRename={noop}
        onDelete={noop}
        onAddPage={onAddPage}
      />,
    );
    fireEvent.press(getByText('Add another page'));
    expect(onAddPage).toHaveBeenCalledTimes(1);
  });
});

describe('DocumentMoreMenu — Also add to another pet (B-547 / D13)', () => {
  const targets: AlsoAddTarget[] = [
    { petId: 'p2', label: 'Also add to Juniper’s Vet Files', done: false },
  ];

  it('renders one line per other pet and fires with its id', () => {
    const onAlsoAdd = jest.fn();
    const { getByText } = render(
      <DocumentMoreMenu
        visible
        onClose={noop}
        onRename={noop}
        onDelete={noop}
        alsoAdd={targets}
        onAlsoAdd={onAlsoAdd}
      />,
    );
    fireEvent.press(getByText('Also add to Juniper’s Vet Files'));
    expect(onAlsoAdd).toHaveBeenCalledWith('p2');
  });

  it('shows the confirmed state and does not re-fire once filed', () => {
    const onAlsoAdd = jest.fn();
    const done: AlsoAddTarget[] = [
      { petId: 'p2', label: 'Added to Juniper’s Vet Files', done: true },
    ];
    const { getByText } = render(
      <DocumentMoreMenu
        visible
        onClose={noop}
        onRename={noop}
        onDelete={noop}
        alsoAdd={done}
        onAlsoAdd={onAlsoAdd}
      />,
    );
    const line = getByText('✓  Added to Juniper’s Vet Files');
    expect(line).toBeTruthy();
    fireEvent.press(line);
    // Disabled once done — a second tap can't file a third copy.
    expect(onAlsoAdd).not.toHaveBeenCalled();
  });

  it('renders nothing extra for a single-pet account (empty targets)', () => {
    const { queryByText } = render(
      <DocumentMoreMenu
        visible
        onClose={noop}
        onRename={noop}
        onDelete={noop}
        alsoAdd={[]}
        onAlsoAdd={noop}
      />,
    );
    expect(queryByText(/Also add to/)).toBeNull();
  });

  it('disables the additive items while a write is in flight (busy)', () => {
    const onAlsoAdd = jest.fn();
    const { getByText } = render(
      <DocumentMoreMenu
        visible
        onClose={noop}
        onRename={noop}
        onDelete={noop}
        alsoAdd={targets}
        onAlsoAdd={onAlsoAdd}
        busy
      />,
    );
    fireEvent.press(getByText('Also add to Juniper’s Vet Files'));
    expect(onAlsoAdd).not.toHaveBeenCalled();
  });
});
