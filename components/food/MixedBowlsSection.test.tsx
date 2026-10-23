import { render, fireEvent } from '@testing-library/react-native';
import { MixedBowlsSection } from './MixedBowlsSection';
import type { FoodMixLine } from '../../lib/foodMixedBowls';

// CUL-2085 (spec §7.4). The section is absent unless the food was mixed, and a failed
// read is never that silence (C-12): absence would say "never mixed".

const LINE: FoodMixLine = {
  key: 'k',
  bowlCount: 8,
  partnerNames: ['Rabbit Pâté'],
  lastDayKey: '2026-10-22',
  text: '8 bowls with Rabbit Pâté · last Oct 22',
  accessibilityLabel: '8 bowls with Rabbit Pâté, last on Oct 22. Opens Oct 22 in History.',
};

describe('MixedBowlsSection', () => {
  it('renders nothing while the read is in flight, or for a food never mixed', () => {
    const noop = () => {};
    expect(render(<MixedBowlsSection state={{ status: 'loading' }} onOpenDay={noop} onRetry={noop} />).toJSON()).toBeNull();
    expect(render(<MixedBowlsSection state={{ status: 'ready', lines: [] }} onOpenDay={noop} onRetry={noop} />).toJSON()).toBeNull();
  });

  it('says a failed read and offers it again, rather than going silent', () => {
    const onRetry = jest.fn();
    const { getByText, getByTestId } = render(
      <MixedBowlsSection state={{ status: 'error' }} onOpenDay={() => {}} onRetry={onRetry} />,
    );
    expect(getByText('In mixed bowls')).toBeTruthy();
    fireEvent.press(getByTestId('food-mixed-bowls-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('opens each line on its newest bowl\'s day', () => {
    const onOpenDay = jest.fn();
    const { getByText, getByLabelText } = render(
      <MixedBowlsSection state={{ status: 'ready', lines: [LINE] }} onOpenDay={onOpenDay} onRetry={() => {}} />,
    );
    expect(getByText(LINE.text)).toBeTruthy();
    fireEvent.press(getByLabelText(LINE.accessibilityLabel));
    expect(onOpenDay).toHaveBeenCalledTimes(1);
    expect(onOpenDay).toHaveBeenCalledWith('2026-10-22');
  });
});
