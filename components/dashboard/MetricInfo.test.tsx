import { render, fireEvent } from '@testing-library/react-native';
import { MetricInfoButton, MetricDefinition } from './MetricInfo';

// MetricInfo is pure presentation (theme + lucide only) — no db/analytics, so no mocks.

describe('MetricInfoButton (B-100)', () => {
  it('calls onToggle when pressed (the tap-to-reveal trigger)', () => {
    const onToggle = jest.fn();
    const { getByTestId } = render(
      <MetricInfoButton open={false} onToggle={onToggle} metricLabel="Meals finished" />,
    );
    fireEvent.press(getByTestId('metric-info-button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('names the metric in its a11y label and reflects the expanded state', () => {
    const { getByTestId, rerender } = render(
      <MetricInfoButton open={false} onToggle={() => {}} metricLabel="Meals finished" />,
    );
    const btn = getByTestId('metric-info-button');
    expect(btn.props.accessibilityRole).toBe('button');
    expect(btn.props.accessibilityLabel).toBe('What "Meals finished" means');
    expect(btn.props.accessibilityState).toEqual({ expanded: false });

    rerender(<MetricInfoButton open onToggle={() => {}} metricLabel="Meals finished" />);
    expect(getByTestId('metric-info-button').props.accessibilityState).toEqual({ expanded: true });
  });
});

describe('MetricDefinition (B-100)', () => {
  it('renders the one-line definition text', () => {
    const { getByText, getByTestId } = render(
      <MetricDefinition text="The share of meals you marked as most or all eaten." />,
    );
    expect(getByTestId('metric-definition')).toBeTruthy();
    expect(getByText('The share of meals you marked as most or all eaten.')).toBeTruthy();
  });
});
