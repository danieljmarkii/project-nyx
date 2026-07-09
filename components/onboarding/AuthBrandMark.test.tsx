import { render } from '@testing-library/react-native';
import { AuthBrandMark } from './AuthBrandMark';

// The shared Culprit brand mark for the login + signup forms. Small surface, but
// it's the thing that keeps the auth forms reading as part of the branded Landing
// flow — pin that it renders the wordmark and exposes one grouped "Culprit" label.

describe('AuthBrandMark', () => {
  it('renders the Culprit wordmark', () => {
    const { getByText } = render(<AuthBrandMark />);
    expect(getByText('Culprit')).toBeTruthy();
  });

  it('exposes a single grouped accessibility label for the mark', () => {
    const { getByLabelText } = render(<AuthBrandMark />);
    expect(getByLabelText('Culprit')).toBeTruthy();
  });

  it('renders the wordmark at hero scale too (the Landing lockup)', () => {
    const { getByText } = render(<AuthBrandMark size="hero" />);
    expect(getByText('Culprit')).toBeTruthy();
  });
});
