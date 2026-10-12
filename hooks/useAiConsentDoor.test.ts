import { act, renderHook } from '@testing-library/react-native';
import { useAiConsentDoor, type ConsentDoorOutcome } from './useAiConsentDoor';
import { useAuthStore } from '../store/authStore';
import { usePetStore } from '../store/petStore';
import { consentDoorState, saveAiConsent } from '../store/aiConsentStore';

jest.mock('../store/aiConsentStore', () => ({
  consentDoorState: jest.fn(),
  saveAiConsent: jest.fn(),
}));

const needsMock = consentDoorState as jest.Mock;
const saveMock = saveAiConsent as jest.Mock;

beforeEach(() => {
  needsMock.mockReset();
  saveMock.mockReset();
  useAuthStore.setState({ user: { id: 'u1' } as never });
  usePetStore.setState({ pets: [{ id: 'p1', name: 'Mochi' } as never] });
});

async function openDoor() {
  const hook = renderHook(() => useAiConsentDoor('label'));
  let outcome: Promise<ConsentDoorOutcome> = Promise.resolve('proceed');
  await act(async () => {
    outcome = hook.result.current.ask();
    await Promise.resolve();
  });
  return { hook, outcome };
}

describe('useAiConsentDoor', () => {
  it('proceeds without a sheet when an answer is on file (or the read failed)', async () => {
    needsMock.mockResolvedValue('proceed');
    const { hook, outcome } = await openDoor();
    await expect(outcome).resolves.toBe('proceed');
    expect(hook.result.current.sheetProps.visible).toBe(false);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('Not now writes nothing (D13) and resolves not_now once the sheet is gone', async () => {
    needsMock.mockResolvedValue('ask');
    const { hook, outcome } = await openDoor();
    expect(hook.result.current.sheetProps.visible).toBe(true);
    expect(hook.result.current.sheetProps.petName).toBe('Mochi');
    await act(async () => {
      hook.result.current.sheetProps.onNotNow();
      hook.result.current.sheetProps.onDismissed();
    });
    await expect(outcome).resolves.toBe('not_now');
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("Allow writes a yes from the 'backstop' source and resolves allowed", async () => {
    needsMock.mockResolvedValue('ask');
    saveMock.mockResolvedValue({ status: 'saved', row: {} });
    const { hook, outcome } = await openDoor();
    await act(async () => {
      await hook.result.current.sheetProps.onChoose('allow');
    });
    await act(async () => { hook.result.current.sheetProps.onDismissed(); });
    await expect(outcome).resolves.toBe('allowed');
    expect(saveMock).toHaveBeenCalledWith('u1', true, 'backstop');
  });

  it("Don't allow writes a no and resolves declined", async () => {
    needsMock.mockResolvedValue('ask');
    saveMock.mockResolvedValue({ status: 'saved', row: {} });
    const { hook, outcome } = await openDoor();
    await act(async () => {
      await hook.result.current.sheetProps.onChoose('dont_allow');
    });
    await act(async () => { hook.result.current.sheetProps.onDismissed(); });
    await expect(outcome).resolves.toBe('declined');
    expect(saveMock).toHaveBeenCalledWith('u1', false, 'backstop');
  });

  it('a failed write keeps the sheet up with an error, and resolves nothing', async () => {
    needsMock.mockResolvedValue('ask');
    saveMock.mockResolvedValue({ status: 'error' });
    const { hook, outcome } = await openDoor();
    let settled = false;
    outcome.then(() => { settled = true; });
    await act(async () => {
      await hook.result.current.sheetProps.onChoose('allow');
    });
    expect(hook.result.current.sheetProps.visible).toBe(true);
    expect(hook.result.current.sheetProps.error).toMatch(/didn't save/);
    expect(hook.result.current.sheetProps.saving).toBeNull();
    await act(async () => { await Promise.resolve(); });
    expect(settled).toBe(false);
  });

  it('never hangs when the sheet never reports its dismissal', async () => {
    jest.useFakeTimers();
    try {
      needsMock.mockResolvedValue('ask');
      const { hook, outcome } = await openDoor();
      await act(async () => { hook.result.current.sheetProps.onNotNow(); });
      await act(async () => { jest.advanceTimersByTime(1000); });
      await expect(outcome).resolves.toBe('not_now');
    } finally {
      jest.useRealTimers();
    }
  });

  it('a second ask while the sheet is up does not proceed', async () => {
    needsMock.mockResolvedValue('ask');
    const { hook } = await openDoor();
    let second: ConsentDoorOutcome | null = null;
    await act(async () => { second = await hook.result.current.ask(); });
    expect(second).toBe('not_now');
  });

  it('holds the screen while the answer is being read', async () => {
    let release: (v: string) => void = () => {};
    needsMock.mockReturnValue(new Promise<string>((r) => { release = r; }));
    const hook = renderHook(() => useAiConsentDoor('ask'));
    let outcome: Promise<ConsentDoorOutcome> = Promise.resolve('proceed');
    act(() => { outcome = hook.result.current.ask(); });
    expect(hook.result.current.settling).toBe(true);
    await act(async () => { release('proceed'); await outcome; });
    expect(hook.result.current.settling).toBe(false);
  });

  it('a double tap during the read starts one door, never an orphaned second', async () => {
    let release: (v: string) => void = () => {};
    needsMock.mockReturnValue(new Promise<string>((r) => { release = r; }));
    const hook = renderHook(() => useAiConsentDoor('label'));
    let first: Promise<ConsentDoorOutcome> = Promise.resolve('proceed');
    let second: ConsentDoorOutcome | null = null;
    await act(async () => {
      first = hook.result.current.ask();
      second = await hook.result.current.ask();
    });
    expect(second).toBe('not_now');
    expect(needsMock).toHaveBeenCalledTimes(1);
    await act(async () => { release('ask'); await Promise.resolve(); });
    await act(async () => {
      hook.result.current.sheetProps.onNotNow();
      hook.result.current.sheetProps.onDismissed();
    });
    await expect(first).resolves.toBe('not_now');
  });

  it('a double tap on Allow sends one answer', async () => {
    needsMock.mockResolvedValue('ask');
    let release: (v: unknown) => void = () => {};
    saveMock.mockReturnValue(new Promise((r) => { release = r; }));
    const { hook } = await openDoor();
    await act(async () => {
      void hook.result.current.sheetProps.onChoose('allow');
      void hook.result.current.sheetProps.onChoose('allow');
      release({ status: 'saved', row: {} });
    });
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it('a write that throws shows the error and frees the buttons', async () => {
    needsMock.mockResolvedValue('ask');
    saveMock.mockRejectedValue(new Error('network'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { hook } = await openDoor();
    await act(async () => { await hook.result.current.sheetProps.onChoose('allow'); });
    expect(hook.result.current.sheetProps.saving).toBeNull();
    expect(hook.result.current.sheetProps.error).toMatch(/didn't save/);
    (console.warn as jest.Mock).mockRestore();
  });

  it('a no already on file is honoured with no sheet and no write', async () => {
    needsMock.mockResolvedValue('declined');
    const { hook, outcome } = await openDoor();
    await expect(outcome).resolves.toBe('declined');
    expect(hook.result.current.sheetProps.visible).toBe(false);
    expect(saveMock).not.toHaveBeenCalled();
  });
});
