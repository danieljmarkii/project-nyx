import { render } from '@testing-library/react-native';
import { DocumentHero } from './DocumentHero';

// B-591 — the PDF unreachable state was a hole. `isPdf` was tested before
// reachability, so a never-opened remote PDF (uri == null) rendered the glyph +
// "PDF" badge with no Open pill and no explanation, and AC 12's honest sentence
// was structurally unreachable for the PDF case. These tests pin the branch order:
// the honest line must fire for a PDF exactly as it does for an image, and the
// openable-looking PDF tile must only render when there is actually a URI to open.

const base = { pageCount: 1, pageIndex: 0, onOpen: () => {} };

describe('DocumentHero — reachable states', () => {
  it('shows the PDF glyph and Open only when the PDF is actually reachable', () => {
    const { queryByText } = render(
      <DocumentHero {...base} uri="file:///a.pdf" isPdf loading={false} />,
    );
    expect(queryByText('PDF')).toBeTruthy();
    expect(queryByText('Open')).toBeTruthy();
    expect(queryByText(/Needs a connection/)).toBeNull();
  });

  it('offers Open on a rendered image page', () => {
    const { queryByText } = render(
      <DocumentHero {...base} uri="file:///a.jpg" isPdf={false} loading={false} />,
    );
    expect(queryByText('Open')).toBeTruthy();
    expect(queryByText(/Needs a connection/)).toBeNull();
  });
});

describe('DocumentHero — unreachable states (§8 AC 12)', () => {
  it('renders the honest PDF sentence — not the openable-looking glyph — for a never-opened remote PDF', () => {
    const { getByText, queryByText, getByRole } = render(
      <DocumentHero {...base} uri={null} isPdf loading={false} />,
    );
    // The sentence AC 12 requires, worded for a PDF (opened, never "shown").
    expect(getByText('Needs a connection to open this PDF')).toBeTruthy();
    // The openable-looking tile is gone: no "PDF" badge, no Open pill.
    expect(queryByText('PDF')).toBeNull();
    expect(queryByText('Open')).toBeNull();
    // And the tile is not tappable — a tap that does nothing is the symptom.
    expect(getByRole('button').props.accessibilityState.disabled).toBe(true);
  });

  it('renders the honest image sentence for a never-opened remote image', () => {
    const { getByText, queryByText } = render(
      <DocumentHero {...base} uri={null} isPdf={false} loading={false} />,
    );
    expect(getByText('Needs a connection to show this page')).toBeTruthy();
    expect(queryByText('Open')).toBeNull();
  });
});

describe('DocumentHero — pending (a URL is still in flight)', () => {
  it('claims nothing while a signed URL is resolving — no glyph, no sentence, no Open', () => {
    // The difference between "resolving" and "unreachable": loading is true, so the
    // honest line must NOT fire yet (it would flash then be replaced by the page).
    const { queryByText } = render(
      <DocumentHero {...base} uri={null} isPdf loading />,
    );
    expect(queryByText(/Needs a connection/)).toBeNull();
    expect(queryByText('PDF')).toBeNull();
    expect(queryByText('Open')).toBeNull();
  });
});
