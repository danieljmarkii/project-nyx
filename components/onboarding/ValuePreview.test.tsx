import { render } from '@testing-library/react-native';
import { ValuePreview } from './ValuePreview';

// A light render smoke test (spec §9 PR 5 — "pure UI, or a light render smoke
// test"). Locks the copy that the nyx-voice pass signs off (the value message and
// the "Free, always" Pets > $ line) and the single-image a11y treatment, so a
// later edit can't silently drop them.

describe('ValuePreview', () => {
  it('leads with the Signal — renders its value copy', () => {
    const { getByText, getByTestId } = render(<ValuePreview variant="signal" />);
    expect(getByText("Patterns you can't see.")).toBeTruthy();
    expect(getByText(/Nyx tells you what the data means/)).toBeTruthy();
    expect(getByTestId('value-preview-signal')).toBeTruthy();
  });

  it('renders the quick-log value copy', () => {
    const { getByText } = render(<ValuePreview variant="log" />);
    expect(getByText(/A couple of taps today/)).toBeTruthy();
    expect(getByText(/Log a meal or a symptom in seconds/)).toBeTruthy();
  });

  it('closes on the free vet report — keeps the "Free, always" (Pets > $) line', () => {
    const { getByText } = render(<ValuePreview variant="report" />);
    expect(getByText('Ready for the vet.')).toBeTruthy();
    expect(getByText(/Free, always/)).toBeTruthy();
  });

  it('exposes each mock as one described image, not cell-by-cell sample data', () => {
    const { getByLabelText } = render(<ValuePreview variant="report" />);
    expect(getByLabelText(/Preview of a Nyx vet summary/)).toBeTruthy();
  });
});
