import { Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { copySupportAddress, showNoMailFallback } from './supportFallback';
import { useSnackbarStore } from '../store/snackbarStore';

// Pins the shared no-mail-client fallback (B-298, spec §4.5). The point of the
// row was that the address was readable but not *copyable*, so the load-bearing
// assertions here are: the alert offers a Copy address action, that action writes
// the exact address to the clipboard, and a failed write is surfaced honestly
// rather than leaving the owner believing they have it.

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

const mockSetString = Clipboard.setStringAsync as jest.Mock;

// Alert.alert's third parameter is optional in the RN types, so reading buttons
// off a recorded call needs a narrowing step (same helper shape as login.test).
type AlertButtonCall = { text: string; style?: string; onPress?: () => void };
function alertCall(spy: jest.SpyInstance, index = 0) {
  const [title, message, buttons] = spy.mock.calls[index] as unknown as [
    string,
    string,
    AlertButtonCall[] | undefined,
  ];
  return { title, message, buttons: buttons ?? [] };
}

const EMAIL = 'support@getculprit.app';

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockSetString.mockResolvedValue(undefined);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  useSnackbarStore.getState().hide();
  useSnackbarStore.setState({ payload: null });
});

afterEach(() => {
  alertSpy.mockRestore();
  jest.useRealTimers();
});

describe('showNoMailFallback', () => {
  it('shows the address and offers a Copy address action', () => {
    showNoMailFallback(EMAIL);

    const { title, message, buttons } = alertCall(alertSpy);
    expect(title).toBe('No mail app found');
    expect(message).toContain(EMAIL);

    const copy = buttons.find((b) => b.text === 'Copy address');
    expect(copy).toBeDefined();
    expect(buttons.some((b) => b.style === 'cancel')).toBe(true);
  });

  it('writes the address to the clipboard when Copy address is pressed', async () => {
    showNoMailFallback(EMAIL);
    const { buttons } = alertCall(alertSpy);

    buttons.find((b) => b.text === 'Copy address')?.onPress?.();
    // The handler is sync and fires the async copy without awaiting it.
    await Promise.resolve();

    expect(mockSetString).toHaveBeenCalledWith(EMAIL);
  });
});

describe('copySupportAddress', () => {
  it('confirms the copy with a snackbar naming the address', async () => {
    await expect(copySupportAddress(EMAIL)).resolves.toBe(true);

    // Armed with a delay so the alert's dismiss animation clears first.
    expect(useSnackbarStore.getState().visible).toBe(false);
    jest.advanceTimersByTime(250);

    const { visible, payload } = useSnackbarStore.getState();
    expect(visible).toBe(true);
    expect(payload?.message).toBe(`Copied ${EMAIL}`);
    // A neutral confirmation, not a reversible action — no Undo to reach for.
    expect(payload?.actionLabel).toBeUndefined();
  });

  it('surfaces a failed clipboard write instead of failing silently', async () => {
    mockSetString.mockRejectedValue(new Error('no clipboard'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(copySupportAddress(EMAIL)).resolves.toBe(false);

    const { title, message } = alertCall(alertSpy);
    expect(title).toBe("Couldn't copy");
    // The fallback still has to end with a way to reach us.
    expect(message).toContain(EMAIL);

    jest.advanceTimersByTime(250);
    expect(useSnackbarStore.getState().visible).toBe(false);
  });

  it('never claims success on a failed write', async () => {
    mockSetString.mockRejectedValue(new Error('no clipboard'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    await copySupportAddress(EMAIL);

    jest.advanceTimersByTime(5000);
    expect(useSnackbarStore.getState().payload).toBeNull();
  });
});
