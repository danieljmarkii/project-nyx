import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { CrashBoundary } from './CrashBoundary';
import { CRASH_COPY } from './CrashScreen';
import { installCrashHandlers, resetCrashHandlersForTest } from '../lib/crashHandlers';
import { useCrashStore } from '../store/crashStore';

// CUL-1841: each of the three doors lands on the one designed screen, and "Try again"
// brings the tree back.

jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(() => Promise.resolve()) }));

let shouldThrow = false;
function Child() {
  if (shouldThrow) throw new Error('render failed');
  // geist-ok: test fixture, not owner-facing
  return <Text>the app</Text>;
}

beforeEach(() => {
  shouldThrow = false;
  resetCrashHandlersForTest();
  useCrashStore.getState().clearCrash();
});

it('renders the tree when nothing has failed', () => {
  render(
    <CrashBoundary>
      <Child />
    </CrashBoundary>,
  );
  expect(screen.getByText('the app')).toBeTruthy();
  expect(screen.queryByTestId('crash-screen')).toBeNull();
});

it('a thrown render error lands on the designed screen, and Try again remounts the tree', () => {
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  shouldThrow = true;
  render(
    <CrashBoundary>
      <Child />
    </CrashBoundary>,
  );
  expect(screen.getByTestId('crash-screen')).toBeTruthy();
  expect(screen.getByText(CRASH_COPY.title)).toBeTruthy();
  expect(screen.getByText(CRASH_COPY.vet)).toBeTruthy();
  expect(useCrashStore.getState().crashed).toBe(true);

  shouldThrow = false;
  fireEvent.press(screen.getByTestId('crash-screen-retry'));
  expect(screen.getByText('the app')).toBeTruthy();
  expect(useCrashStore.getState().crashed).toBe(false);
  consoleError.mockRestore();
});

it('a fatal global error lands on the same screen', () => {
  let handler: (e: unknown, f?: boolean) => void = () => {};
  installCrashHandlers({
    errorUtils: { getGlobalHandler: () => jest.fn(), setGlobalHandler: (h) => (handler = h) },
    isDev: false,
  });
  render(
    <CrashBoundary>
      <Child />
    </CrashBoundary>,
  );
  act(() => handler(new Error('timer threw'), true));
  expect(screen.getByTestId('crash-screen')).toBeTruthy();

  fireEvent.press(screen.getByTestId('crash-screen-retry'));
  expect(screen.getByText('the app')).toBeTruthy();
});

it('an unhandled rejection lands on the same screen', () => {
  let onUnhandled: (id: number, r: unknown) => void = () => {};
  installCrashHandlers({
    hermes: { enablePromiseRejectionTracker: (o) => (onUnhandled = o.onUnhandled) },
    isDev: false,
  });
  render(
    <CrashBoundary>
      <Child />
    </CrashBoundary>,
  );
  act(() => onUnhandled(7, new Error('nobody caught me')));
  expect(screen.getByTestId('crash-screen')).toBeTruthy();
});

it('the screen shows no part of the error', () => {
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  shouldThrow = true;
  render(
    <CrashBoundary>
      <Child />
    </CrashBoundary>,
  );
  expect(screen.queryByText(/render failed/)).toBeNull();
  consoleError.mockRestore();
});
