// The lines between day cards (CUL-1164 / HV-7; spec §3.5, §3.12).
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { theme } from '../../constants/theme';
import { GapLine, ItemsLine, RecordStartLine } from './GapLine';
import type { DateOnlyItem } from '../../lib/historyDays';

const outlineOf = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);

describe('GapLine', () => {
  it('one day is a plain line; a run is boxed; the words are read as one sentence, the dot a pause', () => {
    render(<GapLine text="Sun, Sep 20 · nothing logged" boxed={false} landed={false} testID="g1" />);
    // HV-10's focus pass: the drawn " · " is said as a comma, never read aloud as a word.
    expect(screen.getByTestId('g1').props.accessibilityLabel).toBe('Sun, Sep 20, nothing logged');
    expect(outlineOf('g1').borderColor).toBe('transparent');
  });

  it('landed: the teal-ink outline, the same width as a card\'s, so nothing moves', () => {
    const view = render(<GapLine text="nothing logged · Sep 13 – 16" boxed landed={false} testID="g2" />);
    const before = outlineOf('g2');
    view.rerender(<GapLine text="nothing logged · Sep 13 – 16" boxed landed testID="g2" />);
    const after = outlineOf('g2');
    expect(after.borderColor).toBe(theme.colorAccentInk);
    expect(after.borderWidth).toBe(before.borderWidth);
  });
});

describe('ItemsLine', () => {
  const visit: DateOnlyItem = { kind: 'visit', day: '2026-09-16', id: 'visit-1', reason: 'Recheck', where: '' };
  const start: DateOnlyItem = { kind: 'course-start', day: '2026-09-16', courseKey: 'reg', name: 'Prednisone' };

  it('a line holding a visit opens the visit, with the 44pt floor', () => {
    const open = jest.fn();
    render(<ItemsLine text="Wed, Sep 16 · Vet visit, Recheck · no vomit logged" items={[visit]} landed={false} onOpenVisit={open} testID="i1" />);
    fireEvent.press(screen.getByTestId('i1'));
    expect(open).toHaveBeenCalledWith('visit-1');
    expect(outlineOf('i1').minHeight).toBeGreaterThanOrEqual(44);
  });

  it('a line with no visit is not a control', () => {
    render(<ItemsLine text="Wed, Sep 16 · Prednisone started" items={[start]} landed={false} onOpenVisit={jest.fn()} testID="i2" />);
    expect(screen.getByTestId('i2').props.accessibilityRole).toBeUndefined();
  });
});

describe('RecordStartLine', () => {
  it('names where the record starts', () => {
    render(<RecordStartLine text="Nyx's record starts here · Thu, May 14" />);
    expect(screen.getByTestId('history-record-start').props.accessibilityLabel).toBe("Nyx's record starts here, Thu, May 14");
  });
});
