import { render } from '@testing-library/react-native';
import { AppointmentBlock } from './AppointmentBlock';
import type { AppointmentView } from '../../lib/vetVisits';
import { flat, type TreeNode } from '../../testUtils/tree';

// The module object itself, so a spy reaches the component's own read (a namespace import is a copy).
const RN = require('react-native') as typeof import('react-native');

// CUL-2265: at the largest text the day in the date block drew under the time beside it
// ("17 3:00 pm"). At the accessibility sizes the block now sits above the time.
const appointment: AppointmentView = {
  id: 'a1',
  petId: 'p1',
  scheduledAt: '2026-10-17T15:00:00Z',
  stamp: { day: '17', month: 'Oct' },
  when: 'Saturday · 3:00 pm',
  day: 'Saturday',
  where: 'Northside Animal Clinic',
  isToday: false,
};

function rowOf(fontScale: number): Record<string, unknown> {
  jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({ width: 320, height: 568, fontScale, scale: 2 });
  const { getByRole } = render(<AppointmentBlock appointment={appointment} onPress={jest.fn()} />);
  // The row is the touchable holding both the date block and the time.
  return flat(getByRole('button', { name: 'Saturday · 3:00 pm, Northside Animal Clinic' }) as unknown as TreeNode);
}

afterEach(() => jest.restoreAllMocks());

describe('AppointmentBlock — the date block at large text', () => {
  it('sits beside the time at the standard sizes, the largest Settings size included', () => {
    expect(rowOf(1).flexDirection).toBe('row');
    expect(rowOf(1.353).flexDirection).toBe('row');
  });

  it('sits above the time at the accessibility sizes', () => {
    expect(rowOf(1.786).flexDirection).toBe('column');
    expect(rowOf(3.571).flexDirection).toBe('column');
  });
});

describe('AppointmentBlock — the date block width', () => {
  const stampAt = (fontScale: number) => {
    jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({ width: 320, height: 568, fontScale, scale: 2 });
    const { getByRole } = render(<AppointmentBlock appointment={appointment} onPress={jest.fn()} />);
    const row = getByRole('button', { name: 'Saturday · 3:00 pm, Northside Animal Clinic' }) as unknown as { children: TreeNode[] };
    return flat(row.children[0]);
  };

  it('keeps its 38pt column beside the time', () => {
    expect(stampAt(1).width).toBe(38);
  });

  it('grows with its numerals when stacked, never narrower than 38', () => {
    const stamp = stampAt(3.571);
    expect(stamp.width).toBeUndefined();
    expect(stamp.minWidth).toBe(38);
  });
});
