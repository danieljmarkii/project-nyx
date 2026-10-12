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
  return { total: 1, photographedCount: 1, weeks: 1, countLine: '1, one photographed', tiles: [tile], photoless: [], tracksPattern: false };
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

describe('EN-3: the tile speaks the tier-word map', () => {
  it('a call now tile shows the short chip, in the ink, and its sentence says the full phrase', () => {
    const { verdictWord, tileA11yLabel } = jest.requireActual('./EpisodeGallery') as typeof import('./EpisodeGallery');
    expect(verdictWord('call_now', false)).toBe('Call now');
    expect(verdictWord('call_today', false)).toBe('Call today');
    // An earlier-rule call says exactly what it said before.
    expect(verdictWord('worth_a_call', false)).toBe('Worth a call');
    const tile = { eventId: 'e', dateWord: 'Oct 22', timeWord: '1:30 AM', verdict: 'call_now' } as unknown as GalleryTile;
    expect(tileA11yLabel(tile, false)).toBe('Oct 22, 1:30 AM, photographed, read as Call your vet now');
  });
});

describe('the read words: a calm read draws none (CUL-1233), an unclear one says its record\'s (CUL-1234)', () => {
  const { verdictWord, tileA11yLabel } = jest.requireActual('./EpisodeGallery') as typeof import('./EpisodeGallery');
  const at = (verdict: GalleryTile['verdict']) =>
    ({ eventId: 'e', dateWord: 'Oct 22', timeWord: '1:30 AM', verdict }) as unknown as GalleryTile;

  it('a calm read, under either rule, draws no word and speaks none', () => {
    for (const calm of ['logged', 'monitor'] as const) {
      expect(verdictWord(calm, false)).toBeNull();
      expect(tileA11yLabel(at(calm), false)).toBe('Oct 22, 1:30 AM, photographed');
    }
  });

  it('an unclear read says "Not enough to say yet"; no completed read says "No read yet"', () => {
    expect(verdictWord('not_enough_to_say', false)).toBe('Not enough to say yet');
    expect(tileA11yLabel(at('not_enough_to_say'), false)).toBe('Oct 22, 1:30 AM, photographed, read as Not enough to say yet');
    expect(verdictWord(null, false)).toBe('No read yet');
    expect(tileA11yLabel(at(null), false)).toBe('Oct 22, 1:30 AM, photographed, no read yet');
  });

  it('a rendered calm tile carries its photo and date and no verdict node', () => {
    const calm: SignalScreenEpisodes = {
      ...episodes('file:///cache/a.jpg'),
      tiles: [{ ...episodes('file:///cache/a.jpg').tiles[0], verdict: 'monitor' }],
    };
    const view = render(<EpisodeGallery episodes={calm} />);
    expect(view.getByTestId('episode-photo-ev-1')).toBeTruthy();
    expect(view.getByText('Sep 22')).toBeTruthy();
    expect(view.queryByTestId('episode-verdict-ev-1')).toBeNull();
    expect(view.queryByText('Keep an eye out')).toBeNull();
  });
});

describe('CUL-1224 (BRK-27): a tile never cuts its words', () => {
  it('the date and the verdict wrap at any text size; neither carries a line cap', () => {
    const view = render(<EpisodeGallery episodes={episodes('file:///cache/a.jpg')} />);
    expect(view.getByTestId('episode-verdict-ev-1').props.numberOfLines).toBeUndefined();
    expect(view.getByText('Sep 22').props.numberOfLines).toBeUndefined();
  });
});

// K2 (CUL-1389), CUL-1515: a new-rule calm read under a finding Home is tracking.
describe('"Part of a pattern" on a calm read in a tracked finding (K2)', () => {
  const { verdictWord, tileA11yLabel } = jest.requireActual('./EpisodeGallery') as typeof import('./EpisodeGallery');
  const at = (verdict: GalleryTile['verdict']) =>
    ({ eventId: 'e', dateWord: 'Oct 22', timeWord: '1:30 AM', verdict }) as unknown as GalleryTile;

  it('a new-rule logged read takes the word, and its sentence says it', () => {
    expect(verdictWord('logged', true)).toBe('Part of a pattern');
    expect(tileA11yLabel(at('logged'), true)).toBe('Oct 22, 1:30 AM, photographed, read as Part of a pattern');
  });

  it('an earlier-rule monitor keeps its silence: K2 names `logged` only', () => {
    expect(verdictWord('monitor', true)).toBeNull();
    expect(tileA11yLabel(at('monitor'), true)).toBe('Oct 22, 1:30 AM, photographed');
  });

  it('a call, an unclear read and no read keep their own words', () => {
    expect(verdictWord('call_now', true)).toBe('Call now');
    expect(verdictWord('call_today', true)).toBe('Call today');
    expect(verdictWord('worth_a_call', true)).toBe('Worth a call');
    expect(verdictWord('not_enough_to_say', true)).toBe('Not enough to say yet');
    expect(verdictWord(null, true)).toBe('No read yet');
  });

  it('renders the word on the tile, in the secondary ink and never the rose', () => {
    const base = episodes('file:///cache/a.jpg');
    const view = render(
      <EpisodeGallery episodes={{ ...base, tracksPattern: true, tiles: [{ ...base.tiles[0], verdict: 'logged' }] }} />,
    );
    const word = view.getByTestId('episode-verdict-ev-1');
    expect(word.props.children).toBe('Part of a pattern');
    const flat = Object.assign({}, ...[word.props.style].flat(3).filter(Boolean));
    expect(flat.color).not.toBe(require('../../../constants/theme').theme.colorEventSymptomInk);
    expect(view.getByTestId('episode-tile-ev-1').props.accessibilityLabel).toBe(
      'Sep 22, 10:00 AM, photographed, read as Part of a pattern',
    );
  });

  it('a finding Home is not tracking draws the calm tile as before', () => {
    const base = episodes('file:///cache/a.jpg');
    const view = render(<EpisodeGallery episodes={{ ...base, tiles: [{ ...base.tiles[0], verdict: 'logged' }] }} />);
    expect(view.queryByTestId('episode-verdict-ev-1')).toBeNull();
  });
});
