import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { GalleryTile, SignalScreenEpisodes } from '../../../lib/signalScreen';

// CUL-1269: the PM saw grey squares on the Signal screen where the record screen showed
// the same photos. Each case below is one way a tile used to end grey; each was run red
// against the pre-fix tile (which trusted any non-empty `localUri`, signed only the
// transform, had no `onError`, and swallowed a signing failure).

let mockFileExists = true;
jest.mock('expo-file-system', () => ({
  File: class {
    constructor(_uri: string) {}
    get exists() {
      return mockFileExists;
    }
  },
}));

jest.mock('../../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const mockGetSignedUrl = jest.fn();
jest.mock('../../../lib/storage', () => ({ getSignedUrl: (...a: unknown[]) => mockGetSignedUrl(...a) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import { EpisodeGallery } from './EpisodeGallery';

const TRANSFORM = 'https://signed.example/tile.jpg?width=320';
const RAW = 'https://signed.example/tile.jpg';

function episodes(localUri: string | null): SignalScreenEpisodes {
  const tile: GalleryTile = {
    eventId: 'ev-1',
    occurredAt: '2026-09-22T15:00:00.000Z',
    dateWord: 'Sep 22',
    timeWord: '10:00 AM',
    verdict: 'worth_a_call',
    photo: { localUri, storagePath: 'pet/ev-1/photo.jpg' },
  };
  return { total: 1, photographedCount: 1, countLine: '1, one photographed', tiles: [tile] };
}

function photoUri(view: ReturnType<typeof render>): string | undefined {
  return (view.queryByTestId('episode-photo-ev-1')?.props.source as { uri?: string } | undefined)?.uri;
}

beforeEach(() => {
  mockFileExists = true;
  mockGetSignedUrl.mockReset();
  // The transform is signed with a transform argument; the raw original without one.
  mockGetSignedUrl.mockImplementation(async (_b: string, _p: string, _ttl: number, transform?: unknown) => (transform ? TRANSFORM : RAW));
});

describe('EpisodeGallery tile photo (CUL-1269)', () => {
  it('shows the on-device file when it is still there, without signing', () => {
    const view = render(<EpisodeGallery episodes={episodes('file:///cache/a.jpg')} />);
    expect(photoUri(view)).toBe('file:///cache/a.jpg');
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it('a stale cache path (iOS evicted the file) falls back to the signed transform', async () => {
    mockFileExists = false;
    const view = render(<EpisodeGallery episodes={episodes('file:///cache/evicted.jpg')} />);
    await waitFor(() => expect(photoUri(view)).toBe(TRANSFORM));
  });

  it('a local file that fails to load falls back to the signed transform', async () => {
    const view = render(<EpisodeGallery episodes={episodes('file:///cache/a.jpg')} />);
    act(() => {
      view.getByTestId('episode-photo-ev-1').props.onError();
    });
    await waitFor(() => expect(photoUri(view)).toBe(TRANSFORM));
  });

  it('a transform that fails to load swaps to the raw original (B-207)', async () => {
    const view = render(<EpisodeGallery episodes={episodes(null)} />);
    await waitFor(() => expect(photoUri(view)).toBe(TRANSFORM));
    act(() => {
      view.getByTestId('episode-photo-ev-1').props.onError();
    });
    await waitFor(() => expect(photoUri(view)).toBe(RAW));
  });

  it('says the photo did not load when every source fails, and stays a door', async () => {
    mockGetSignedUrl.mockRejectedValue(new Error('offline'));
    const view = render(<EpisodeGallery episodes={episodes(null)} />);
    await waitFor(() => expect(view.getByTestId('episode-photo-failed-ev-1')).toBeTruthy());
    expect(view.getByText("Photo didn't load")).toBeTruthy();
    expect(view.queryByTestId('episode-photo-ev-1')).toBeNull();
    const tile = view.getByTestId('episode-tile-ev-1');
    expect(tile.props.accessibilityLabel).toMatch(/photo didn't load$/);
    fireEvent.press(tile);
    expect(jest.requireMock('expo-router').router.push).toHaveBeenCalledWith('/event/ev-1');
  });
});
