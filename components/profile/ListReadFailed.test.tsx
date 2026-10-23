import { fireEvent, render } from '@testing-library/react-native';
import { ListReadFailed } from './ListReadFailed';

// CUL-1911 — the failed read sits in the quiet band, and its Try again stays reachable:
// a grouped (accessible) band would hide the button from VoiceOver on iOS.
it('the band is not one grouped stop, so Try again is its own button', () => {
  const onRetry = jest.fn();
  const { getByTestId, getByLabelText } = render(
    <ListReadFailed testID="f" line="Mochi’s conditions could not be read just now." onRetry={onRetry} />,
  );
  expect(getByTestId('f').props.accessible).toBe(false);
  fireEvent.press(getByLabelText('Try again'));
  expect(onRetry).toHaveBeenCalledTimes(1);
});
