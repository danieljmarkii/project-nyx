import { renderHook } from '@testing-library/react-native';
import { useAiConsentPreload } from './useAiConsentPreload';
import { useAuthStore } from '../store/authStore';

const mockLoad = jest.fn();
let mockActive = true;
jest.mock('../store/aiConsentStore', () => ({ loadAiConsent: (...a: unknown[]) => mockLoad(...a) }));
jest.mock('./useAppActive', () => ({ useAppActive: () => mockActive }));
jest.mock('../lib/supabase', () => ({ supabase: {} }));

// CUL-1174: the one consent read Home's and History's rows draw by.
describe('useAiConsentPreload', () => {
  beforeEach(() => {
    mockLoad.mockReset().mockResolvedValue({ status: 'ok', row: null });
    mockActive = true;
  });

  it('reads once for the signed-in account, and again when the app returns to the front', () => {
    useAuthStore.setState({ user: { id: 'u1' } } as never);
    const view = renderHook(() => useAiConsentPreload());
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(mockLoad).toHaveBeenCalledWith('u1');
    view.rerender({});
    expect(mockLoad).toHaveBeenCalledTimes(1);
    mockActive = false;
    view.rerender({});
    expect(mockLoad).toHaveBeenCalledTimes(1);
    mockActive = true;
    view.rerender({});
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });

  it('reads nothing while signed out', () => {
    useAuthStore.setState({ user: null } as never);
    renderHook(() => useAiConsentPreload());
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('a failed read only warns', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockLoad.mockRejectedValue(new Error('network'));
    useAuthStore.setState({ user: { id: 'u1' } } as never);
    renderHook(() => useAiConsentPreload());
    await new Promise((r) => setTimeout(r, 0));
    expect(warn).toHaveBeenCalledWith('[useAiConsentPreload] consent read failed:', expect.any(Error));
    warn.mockRestore();
  });
});
