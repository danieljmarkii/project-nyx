import { act, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { CaptureReadCard } from './CaptureReadCard';
import { colorRoles, theme } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';

jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));

const hidden = { includeHiddenElements: true };
const FACTS = [
  { label: 'Brand', value: 'Hillside Kitchen' },
  { label: 'Format', value: 'Dry kibble' },
];

function railColour(view: ReturnType<typeof render>): unknown {
  return StyleSheet.flatten(view.getByTestId('capture-read-rail', hidden).props.style).backgroundColor;
}

describe('CaptureReadCard', () => {
  afterEach(() => jest.useRealTimers());

  it('waiting: names the request, shows no facts, and holds a grey tick at the rail', () => {
    const view = render(<CaptureReadCard reading facts={FACTS} identity="f1" />);
    expect(view.getByLabelText('Reading the label…').props.accessibilityRole).toBe('progressbar');
    expect(view.queryByLabelText('Brand, Hillside Kitchen')).toBeNull();
    expect(railColour(view)).toBe(theme.colorBorderStrong);
  });

  // THE ONE RAIL: the tick and the landed rail are the same element, so it can grow
  // rather than swap. The facts land in place under the heading.
  it('landed: the same rail turns the good-fact teal and the facts fill in', () => {
    jest.useFakeTimers();
    const view = render(<CaptureReadCard reading facts={FACTS} identity="f1" />);
    const rail = view.getByTestId('capture-read-rail', hidden);
    view.rerender(<CaptureReadCard reading={false} facts={FACTS} identity="f1" />);
    act(() => { jest.runAllTimers(); });
    expect(view.getByTestId('capture-read-rail', hidden)).toBe(rail);
    expect(railColour(view)).toBe(colorRoles.positive.glyphOnLight);
    expect(view.getByText('Read from your photo')).toBeTruthy();
    expect(view.getByLabelText('Brand, Hillside Kitchen')).toBeTruthy();
    expect(view.queryByLabelText('Reading the label…')).toBeNull();
  });

  it('reduced motion: the facts cross-fade in and the tick never breathes', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    jest.useFakeTimers();
    const view = render(<CaptureReadCard reading facts={FACTS} identity="f1" />);
    expect(StyleSheet.flatten(view.getByTestId('capture-read-rail', hidden).props.style).opacity).toBeUndefined();
    view.rerender(<CaptureReadCard reading={false} facts={FACTS} identity="f1" />);
    act(() => { jest.runAllTimers(); });
    expect(view.getByLabelText('Format, Dry kibble')).toBeTruthy();
  });
});
