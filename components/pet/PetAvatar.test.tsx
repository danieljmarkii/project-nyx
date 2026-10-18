import { render, fireEvent, act, screen } from '@testing-library/react-native';
import { PetAvatar } from './PetAvatar';
import {
  clearPetPhotoLinks, markPetPhotoChanged, PET_PHOTO_LINK_MIN_REMAINING_MS, PET_PHOTO_LINK_TTL_SEC,
} from '../../lib/storage';

// CUL-1856 — the REAL lib/storage.ts runs here, cache and all; only the network
// edge is stubbed. So every test below proves the disc renders what the signing
// cache hands it, and that cache is what the private bucket will depend on.
// mock-prefixed for jest's hoist-out-of-scope rule.
let mockSignCount = 0;
const mockSign = jest.fn((path: string, _ttl: number) => {
  mockSignCount += 1;
  return Promise.resolve({
    data: { signedUrl: `https://signed.test/object/sign/nyx-pet-photos/${path}?token=${mockSignCount}` },
    error: null,
  });
});
const mockGetPublicUrl = jest.fn();
let mockAuthListener: ((event: string, session: unknown) => void) | null = null;
jest.mock('../../lib/supabase', () => ({
  supabase: {
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: (path: string, ttl: number) => {
          if (bucket !== 'nyx-pet-photos') throw new Error(`unexpected bucket ${bucket}`);
          return mockSign(path, ttl);
        },
        getPublicUrl: (...args: unknown[]) => mockGetPublicUrl(...args),
      }),
    },
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        mockAuthListener = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
}));
jest.mock('expo-image-manipulator', () => ({ manipulateAsync: jest.fn(), SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('../../lib/transientFiles', () => ({ transientDirectory: jest.fn() }));

const SIGNED = /^https:\/\/signed\.test\/object\/sign\/nyx-pet-photos\/p\/biscuit\.jpg\?token=\d+$/;
const photoUri = () => screen.getByTestId('pet-avatar-photo', INSIDE).props.source.uri as string;
// Let the signing promise settle inside act, as it does between frames on device.
const settle = () => act(async () => {});
// A real failure: the first error earns one re-sign, the second is believed.
async function failTwice(): Promise<void> {
  await settle();
  fireEvent(screen.getByTestId('pet-avatar-photo', INSIDE), 'error');
  await settle();
  fireEvent(screen.getByTestId('pet-avatar-photo', INSIDE), 'error');
  await settle();
}

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

beforeEach(() => {
  clearPetPhotoLinks();
  mockSign.mockClear();
  mockGetPublicUrl.mockClear();
});

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
  it('keeps the initial underneath while the photo is in flight', async () => {
    const { getByText, getByTestId, queryByTestId } = render(
      <PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />,
    );
    // While the link signs there is no photo layer yet, and the initial holds
    // the disc (CUL-1856 adds this wait; CUL-617 made the initial its answer).
    expect(queryByTestId('pet-avatar-photo', INSIDE)).toBeNull();
    expect(getByText('B', INSIDE)).toBeTruthy();
    await settle();
    // Both, at once: RN paints nothing for an image in flight, so the initial IS
    // the loading state. Without it the disc is empty until the bytes land.
    expect(getByText('B', INSIDE)).toBeTruthy();
    expect(getByTestId('pet-avatar-photo', INSIDE)).toBeTruthy();
  });

  it('falls back to the initial when the photo fails to load', async () => {
    const { getByText, queryByTestId } = render(
      <PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />,
    );
    await failTwice();
    expect(queryByTestId('pet-avatar-photo', INSIDE)).toBeNull();
    expect(getByText('B', INSIDE)).toBeTruthy();
  });

  it('retries a failed photo when a new path arrives', async () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />,
    );
    await failTwice();
    expect(queryByTestId('pet-avatar-photo', INSIDE)).toBeNull();

    rerender(<PetAvatar name="Biscuit" photoPath="p/biscuit-v2.jpg" size={38} />);
    await settle();
    expect(getByTestId('pet-avatar-photo', INSIDE)).toBeTruthy();
  });

  it('retries a failed photo when the device comes back online', async () => {
    // The scenario the issue names first: launched offline, so every avatar
    // failed. The tab bar mounts once per session — without this the disc stays
    // an initial until the app is relaunched.
    const { getByTestId, queryByTestId } = render(
      <PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />,
    );
    await failTwice();
    expect(queryByTestId('pet-avatar-photo', INSIDE)).toBeNull();

    goOffline();
    goOnline();
    await settle();
    expect(getByTestId('pet-avatar-photo', INSIDE)).toBeTruthy();
  });

  it('does not re-mount a working photo on an ordinary network event', async () => {
    const { getByTestId } = render(
      <PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />,
    );
    await settle();
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
    const { queryByTestId, getByTestId } = render(
      <PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />,
    );
    await settle(); // let the baseline read and the signing settle
    await failTwice();
    expect(queryByTestId('pet-avatar-photo', INSIDE)).toBeNull();

    goOnline(); // no preceding goOffline() — the device was never seen online
    await settle();
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

// ── CUL-1856: signed links only ────────────────────────────────────────────
describe('PetAvatar reads a signed link, never a public URL', () => {
  it('renders the signed link and never asks for a public one', async () => {
    render(<PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />);
    await settle();
    expect(photoUri()).toMatch(SIGNED);
    expect(mockSign).toHaveBeenCalledWith('p/biscuit.jpg', PET_PHOTO_LINK_TTL_SEC);
    expect(mockGetPublicUrl).not.toHaveBeenCalled();
  });

  it('shows the initial, never an image, when signing fails', async () => {
    mockSign.mockImplementationOnce(() =>
      Promise.resolve({ data: null, error: { message: 'Object not found' } }) as never);
    const { getByText, queryByTestId } = render(
      <PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />,
    );
    await settle();
    expect(queryByTestId('pet-avatar-photo', INSIDE)).toBeNull();
    expect(getByText('B', INSIDE)).toBeTruthy();
  });

  it('shows the initial when signing throws (offline)', async () => {
    mockSign.mockImplementationOnce(() => Promise.reject(new Error('Network request failed')));
    const { getByText, queryByTestId } = render(
      <PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />,
    );
    await settle();
    expect(queryByTestId('pet-avatar-photo', INSIDE)).toBeNull();
    expect(getByText('B', INSIDE)).toBeTruthy();
  });

  it('re-signs once when a link fails to load, and shows the fresh one', async () => {
    // The tab bar outlives an hour; its link expires under it.
    render(<PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />);
    await settle();
    const stale = photoUri();
    fireEvent(screen.getByTestId('pet-avatar-photo', INSIDE), 'error');
    await settle();
    expect(mockSign).toHaveBeenCalledTimes(2);
    expect(photoUri()).toMatch(SIGNED);
    expect(photoUri()).not.toBe(stale);
  });

  it('re-signs a cached link that is about to expire instead of handing it out', async () => {
    const t0 = Date.now();
    const now = jest.spyOn(Date, 'now').mockReturnValue(t0);
    try {
      const first = render(<PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />);
      await settle();
      const early = photoUri();
      first.unmount();

      // Inside the window: a fresh mount reuses the cached link, no request.
      now.mockReturnValue(t0 + 10 * 60 * 1000);
      const second = render(<PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />);
      expect(photoUri()).toBe(early);
      expect(mockSign).toHaveBeenCalledTimes(1);
      second.unmount();

      // Under the floor: the cache refuses it, and the disc signs again.
      now.mockReturnValue(t0 + PET_PHOTO_LINK_TTL_SEC * 1000 - PET_PHOTO_LINK_MIN_REMAINING_MS + 1);
      render(<PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />);
      await settle();
      expect(mockSign).toHaveBeenCalledTimes(2);
      expect(photoUri()).not.toBe(early);
    } finally {
      now.mockRestore();
    }
  });

  it('signs once for many discs of one pet', async () => {
    render(
      <>
        <PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={22} />
        <PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />
        <PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={44} />
      </>,
    );
    await settle();
    expect(mockSign).toHaveBeenCalledTimes(1);
  });

  it('a new photo at the same path re-signs every mounted disc', async () => {
    render(<PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />);
    await settle();
    const old = photoUri();
    act(() => markPetPhotoChanged('p/biscuit.jpg'));
    await settle();
    expect(photoUri()).toMatch(SIGNED);
    expect(photoUri()).not.toBe(old);
  });

  it('a change of account drops every cached link', async () => {
    const first = render(<PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />);
    await settle();
    first.unmount();
    act(() => mockAuthListener?.('INITIAL_SESSION', { user: { id: 'user-a' } }));
    act(() => mockAuthListener?.('SIGNED_OUT', null));
    render(<PetAvatar name="Biscuit" photoPath="p/biscuit.jpg" size={38} />);
    await settle();
    expect(mockSign).toHaveBeenCalledTimes(2);
  });
});
