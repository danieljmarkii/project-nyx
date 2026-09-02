// PastMedicationsSection — the rows tap through to the medication (CUL-318), and the
// one that has nowhere to go is a plain row rather than a dimmed control (CUL-682).
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { PastMedicationsSection } from './PastMedicationsSection';
import type { PastCourseRow } from '../../lib/pastMedications';

function row(over: Partial<PastCourseRow> = {}): PastCourseRow {
  return {
    key: 'reg-1',
    name: 'Metronidazole',
    meta: '14 doses · Mar 3 – Mar 16',
    pill: { label: 'Ended', tone: 'ended' },
    medicationItemId: 'item-metro',
    ...over,
  };
}

// The `item:unspecified` bucket: doses logged with no medication on file.
const ORPHAN = row({
  key: 'item:unspecified',
  name: 'Medication',
  meta: '3 doses · last logged Apr 2',
  pill: { label: 'No end recorded', tone: 'open' },
  medicationItemId: null,
});

const METRO_LABEL = 'Metronidazole. Ended. 14 doses · Mar 3 – Mar 16';
const ORPHAN_LABEL = 'Medication. No end recorded. 3 doses · last logged Apr 2';

/** The nearest responder host at or above `node`. A touchable is `accessible` and owns
 *  `onStartShouldSetResponder`; a plain View has no responder. Walking UP and reading
 *  identity is what `fireEvent.press` cannot prove (CUL-579): a press on an inert
 *  label can still reach a handler by descent from an enclosing element. */
function owningTouchable(node: any): any {
  let n = node;
  while (n) {
    if (n.props?.accessible && typeof n.props?.onStartShouldSetResponder === 'function') return n;
    n = n.parent;
  }
  return null;
}

function expand(view: ReturnType<typeof render>) {
  fireEvent.press(view.getByLabelText(/^Past medications, /));
}

beforeEach(() => {
  (router.push as jest.Mock).mockClear();
});

describe('PastMedicationsSection', () => {
  it('renders nothing with no past courses — the Current card owns that empty state', () => {
    const view = render(<PastMedicationsSection rows={[]} />);
    expect(view.toJSON()).toBeNull();
  });

  it('is collapsed by default and opens on the header', () => {
    const view = render(<PastMedicationsSection rows={[row()]} />);
    expect(view.queryByLabelText(METRO_LABEL)).toBeNull();
    expand(view);
    view.getByLabelText(METRO_LABEL);
  });

  // CUL-318 — the destination exists now (PR 3 gave app/medication/[id] the
  // past-course facts), so a row with a catalog item lands on it.
  it('a row with a catalog item opens that medication', () => {
    const view = render(<PastMedicationsSection rows={[row()]} />);
    expand(view);
    const label = view.getByLabelText(METRO_LABEL);
    // Identity, not a synthetic press: the label's own responder host is a button.
    const host = owningTouchable(label);
    expect(host).not.toBeNull();
    expect(host.props.accessibilityRole).toBe('button');
    fireEvent.press(label);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/medication/item-metro');
  });

  // No screen to route to, so the row is a View — not a touchable carrying `disabled`,
  // which VoiceOver would speak as "dimmed" over a control that does not exist.
  it('a course with no catalog item is a plain row, never a dimmed control', () => {
    const view = render(<PastMedicationsSection rows={[ORPHAN]} />);
    expand(view);
    const label = view.getByLabelText(ORPHAN_LABEL);
    expect(owningTouchable(label)).toBeNull();
    expect(label.props.accessibilityState?.disabled).toBeUndefined();
    // Still ONE announcement: `accessible` groups the name, the pill and the meta.
    expect(label.props.accessible).toBe(true);
    fireEvent.press(label);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('draws the chevron only where there is somewhere to go', () => {
    const view = render(<PastMedicationsSection rows={[row(), ORPHAN]} />);
    expand(view);
    // By component type: lucide renders an Svg the testID does not survive in jest.
    expect(view.UNSAFE_getAllByType(ChevronRight as never)).toHaveLength(1);
  });
});
