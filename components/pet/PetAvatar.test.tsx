import { render, fireEvent, act } from '@testing-library/react-native';
import { PetAvatar } from './PetAvatar';

// The disc resolves a Storage URL; the real helper needs a live supabase client.
jest.mock('../../lib/storage', () => ({
  getPublicUrl: (bucket: string, path: string) => `https://example.test/${bucket}/${path}`,
}));

// Captured so a test can drive an offline→online transition by hand.
let emit: ((state: { isConnected: boolean; isInternetReachable: boolean }) => void) | null = null;
let mockNetworkNow = { isConnected: true, isInternetReachable: true };
jest.mock('expo-network', () => ({
  addNetworkStateListener: (cb: (state: unknown) => void) => {
    emit = cb as typeof emit;
    return { remove: () => { emit = null; } };
  },
  getNetworkStateAsync: () => Promise.resolve(mockNetworkNow),
}));

// `act` because the real listener is a native event: it lands outside React's
// own scheduling, exactly as it does on device.
const goOffline = () =>
  act(() => { emit?.({ isConnected: false, isInternetReachable: false }); });
const goOnline = () =>
  act(() => { emit?.({ isConnected: true, isInternetReachable: true }); });

// The whole disc is deliberately hidden from assistive tech (it is decoration —
// every consumer names the pet on its own touchable), and RTL's queries skip an
// accessibility-hidden subtree the same way VoiceOver does. So every query INTO
// the disc has to opt in, which doubles as a standing proof that the containment
// asserted in the last test is real: drop it and these queries start passing on
// their own.
const INSIDE = { includeHiddenElements: true } as const;

describe('PetAvatar', () => {
  it('renders the tinted initial when the pet has no photo', () => {
    const { getByText } = render(<PetAvatar name="Biscuit" photoPath={null} size={38} />);
    expect(getByText('B', INSIDE)).toBeTruthy();
  });

  it('indexes the initial by code point, not code unit', () => {
    // A surrogate pair taken half-way renders the replacement glyph (CUL-599).
    const { getByText } = render(<PetAvatar name="🐈 Mochi" photoPath={null} size={38} />);
    expect(getByText('🐈', INSIDE)).toBeTruthy();
  });

  // ── The defect CUL-617 filed ───────────────────────────────────────────────
  it('keeps the initial underneath while the photo is in flight', () => {
    const { getByText, getByTestId } = render(
      <PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />,
    );
    // Both, at once: RN paints nothing for an image in flight, so the initial IS
    // the loading state. Without it the disc is empty until the bytes land.
    expect(getByText('B', INSIDE)).toBeTruthy();
    expect(getByTestId('pet-avatar-photo', INSIDE)).toBeTruthy();
  });

  it('falls back to the initial when the photo fails to load', () => {
    const { getByText, getByTestId, queryByTestId } = render(
      <PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />,
    );
    fireEvent(getByTestId('pet-avatar-photo', INSIDE), 'error');
    expect(queryByTestId('pet-avatar-photo', INSIDE)).toBeNull();
    expect(getByText('B', INSIDE)).toBeTruthy();
  });

  it('retries a failed photo when a new path arrives', () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />,
    );
    fireEvent(getByTestId('pet-avatar-photo', INSIDE), 'error');
    expect(queryByTestId('pet-avatar-photo', INSIDE)).toBeNull();

    rerender(<PetAvatar name="Biscuit" photoPath="p/biscuit-v2.jpg" size={38} />);
    expect(getByTestId('pet-avatar-photo', INSIDE)).toBeTruthy();
  });

  it('retries a failed photo when the device comes back online', () => {
    // The scenario the issue names first: launched offline, so every avatar
    // failed. The tab bar mounts once per session — without this the disc stays
    // an initial until the app is relaunched.
    const { getByTestId, queryByTestId } = render(
      <PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />,
    );
    fireEvent(getByTestId('pet-avatar-photo', INSIDE), 'error');
    expect(queryByTestId('pet-avatar-photo', INSIDE)).toBeNull();

    goOffline();
    goOnline();
    expect(getByTestId('pet-avatar-photo', INSIDE)).toBeTruthy();
  });

  it('does not re-mount a working photo on an ordinary network event', () => {
    const { getByTestId } = render(
      <PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />,
    );
    const before = getByTestId('pet-avatar-photo', INSIDE).props.source;
    goOnline(); // already online — no offline→online EDGE
    expect(getByTestId('pet-avatar-photo', INSIDE).props.source).toEqual(before);
  });

  it('retries after a launch that was already offline', async () => {
    // The listener reports CHANGES, so a cold launch with no connectivity may
    // never emit an offline event. Without a real baseline read the reconnect
    // that follows looks like no transition at all, and the disc stays an
    // initial for the whole session — the exact scenario CUL-617 names first.
    mockNetworkNow = { isConnected: false, isInternetReachable: false };
    const { getByTestId, queryByTestId } = render(
      <PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />,
    );
    await act(async () => {}); // let the baseline read settle
    fireEvent(getByTestId('pet-avatar-photo', INSIDE), 'error');
    expect(queryByTestId('pet-avatar-photo', INSIDE)).toBeNull();

    goOnline(); // no preceding goOffline() — the device was never seen online
    expect(getByTestId('pet-avatar-photo', INSIDE)).toBeTruthy();
    mockNetworkNow = { isConnected: true, isInternetReachable: true };
  });

  it('hides the disc from assistive tech', () => {
    // The initial is now always mounted, so an exposed disc would make VoiceOver
    // read "B, Biscuit" on every switcher row. Every consumer already names the
    // pet on its own touchable.
    const { getByTestId } = render(
      <PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />,
    );
    const disc = getByTestId('pet-avatar', INSIDE);
    expect(disc.props.accessibilityElementsHidden).toBe(true);
    expect(disc.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
