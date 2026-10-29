// The shared pieces at a phone and at the unfolded Duo (CUL-2238). At compact each keeps
// main's style exactly: the same object, never an array carrying a null cap. At regular
// each carries its cap from `lib/layoutCaps.ts`. Jest's own window is 750pt wide, which is
// regular, so the window is mocked here for both halves.
//
// MonthInstrument and WeekStrip apply the same `squareRowCap` through `withCap`; their
// stores make them costly to mount here, and the layout captures photograph both at every
// size (phone widths pixel identical to main).

import { configure, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { theme } from '../constants/theme';
import { compareWindows } from '../lib/chartModels';
import { CompareBars } from './charts/CompareBars';
import { DayMarkFace } from './charts/DayMark';
import { PhotoSlots } from './food/PhotoSlots';

configure({ defaultIncludeHiddenElements: true });

let mockWindow = { width: 390, height: 844 };
jest.mock('../hooks/useLayoutClass', () => {
  const actual = jest.requireActual('../hooks/useLayoutClass');
  return {
    ...actual,
    useLayoutClass: () => actual.layoutClassFor(mockWindow.width, mockWindow.height),
    useColumnWidth: () => actual.columnFor(mockWindow.width).width,
  };
});
jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('../hooks/useAppActive', () => ({ useAppActive: () => true }));

const PHONE = { width: 390, height: 844 };
const DUO = { width: 890, height: 626 };

const SLOTS = [
  { label: 'Front · needed', uri: null },
  { label: 'Back · optional', uri: null },
  { label: 'Barcode · optional', uri: null },
];

const model = compareWindows(
  { label: 'The 10 days before', startDay: '2026-07-01', days: 10, episodeDays: ['2026-07-02'], loggedDays: ['2026-07-01', '2026-07-02'] },
  { label: "The trial's 10 days", startDay: '2026-07-11', days: 10, episodeDays: [], loggedDays: ['2026-07-11'] },
);

/** The label column: the nearest ancestor of the window's label holding the 36% share. */
function compareLabelStyle(at: typeof PHONE) {
  mockWindow = at;
  const { getAllByText } = render(<CompareBars model={model} noun="vomiting" />);
  let node = getAllByText('The 10 days before')[0].parent;
  while (node && StyleSheet.flatten(node.props.style)?.width !== '36%') node = node.parent;
  if (!node) throw new Error('no label column found');
  return node.props.style;
}

function photoRowStyle(at: typeof PHONE) {
  mockWindow = at;
  return render(<PhotoSlots slots={SLOTS} testID="slots" />).getByTestId('slots').props.style;
}

function dayBoxStyle(at: typeof PHONE) {
  mockWindow = at;
  return render(<DayMarkFace dayOfMonth={4} box="white" line="solid" label="4 October" />).getByTestId('daymark').props.style;
}

afterEach(() => {
  mockWindow = PHONE;
});

describe('a phone keeps main’s style tree', () => {
  it('PhotoSlots passes its row style itself', () => {
    expect(Array.isArray(photoRowStyle(PHONE))).toBe(false);
    expect(StyleSheet.flatten(photoRowStyle(PHONE)).maxWidth).toBeUndefined();
  });

  it('DayMark adds nothing to its box array', () => {
    const style = dayBoxStyle(PHONE) as unknown[];
    expect(style.some((s) => s !== null && typeof s === 'object' && 'maxWidth' in (s as object))).toBe(false);
    expect(style).not.toContain(null);
  });

  it('CompareBars passes its label style itself', () => {
    const style = compareLabelStyle(PHONE);
    expect(Array.isArray(style)).toBe(false);
    expect(StyleSheet.flatten(style).width).toBe('36%');
  });
});

describe('the unfolded Duo caps each piece', () => {
  it('PhotoSlots centres three tiles at most', () => {
    expect(StyleSheet.flatten(photoRowStyle(DUO))).toMatchObject({
      maxWidth: 3 * theme.layoutTileMax + 2 * theme.space2,
      alignSelf: 'center',
    });
  });

  it('DayMark caps its square', () => {
    expect(StyleSheet.flatten(dayBoxStyle(DUO)).maxWidth).toBe(theme.layoutDayCellMax);
  });

  it('CompareBars caps its label column', () => {
    expect(StyleSheet.flatten(compareLabelStyle(DUO))).toMatchObject({ width: '36%', maxWidth: theme.layoutCompareLabelMax });
  });
});
