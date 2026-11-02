// The confirmation's one rule worth its own test: the check is drawn only when the screen says
// the send was quiet, never inferred from a missing card (code review on CUL-2298).
import { render } from '@testing-library/react-native';
import { SendConfirmation } from './SendConfirmation';
import { useReducedMotionStore } from '../../store/reducedMotionStore';

const copy = { title: 'Nyx’s report', line: 'Sep 16 to Oct 31 · shared' };
const card = { title: 'Nyx’s record has a flag worth a call to your vet', body: 'Blood in vomit.', rows: [{ id: 'clinic' as const, text: 'Call your vet today.' }] };

beforeEach(() => useReducedMotionStore.setState({ reduceMotion: true }));

it('quiet: the check, and no call card', () => {
  const r = render(<SendConfirmation copy={copy} quiet card={null} onDone={jest.fn()} />);
  expect(r.getByTestId('send-confirmation-check')).toBeTruthy();
  expect(r.queryByTestId('send-confirmation-call-card')).toBeNull();
});

it('not quiet: no check, and the call card above Done', () => {
  const r = render(<SendConfirmation copy={copy} quiet={false} card={card} onDone={jest.fn()} />);
  expect(r.queryByTestId('send-confirmation-check')).toBeNull();
  expect(r.getByTestId('send-confirmation-call-card')).toBeTruthy();
});

it('not quiet with no card to repeat still draws no check', () => {
  const r = render(<SendConfirmation copy={copy} quiet={false} card={null} onDone={jest.fn()} />);
  expect(r.queryByTestId('send-confirmation-check')).toBeNull();
});
