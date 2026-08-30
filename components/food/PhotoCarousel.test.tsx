import { act, render, waitFor } from '@testing-library/react-native';
import { PhotoCarousel } from './PhotoCarousel';

jest.mock('../../lib/storage', () => ({
  getSignedUrl: jest.fn(async () => 'https://example.test/photo.jpg'),
}));

// ── CUL-728 item 2 — the empty hero is not a dimmed button ──────────────────
//
// The empty state was one TouchableOpacity with `disabled={!onAddPhoto}`, no
// role and no label. RN copies `disabled` into `accessibilityState.disabled`
// (TouchableOpacity.js), iOS maps that to UIAccessibilityTraitNotEnabled, and
// VoiceOver speaks it as "dimmed" — so a hero with nothing to tap announced an
// unavailable control. The copy had already swapped to the read-only line, which
// is the tell: one prop was picking the copy AND claiming a control exists.
//
// Worth knowing when reading this file, because it is not how the issue framed
// it: there is one caller (`app/food/[id].tsx`), and it drops `onAddPhoto` only
// while an upload is in flight. So the branch is reached transiently, not by a
// read-only host — and that does not change the fix, because from in here the
// two are the same absent prop. What makes it safe is that the caller renders
// its own "Adding photo…" row beside this hero, which is where that status
// honestly lives; a hero that stops being a control is not a control that is
// off.
describe('PhotoCarousel', () => {
  const ancestors = (node: any) => {
    const out: any[] = [];
    let n = node;
    while (n) { out.push(n); n = n.parent; }
    return out;
  };

  // The signed-URL effect resolves even with nothing to resolve, so every case
  // settles it before asserting — an act() warning in the floor is the noise that
  // later gets a real failure waved through (CUL-712).
  const settle = () => act(async () => {});

  it('the empty hero carries no disabled state to announce', async () => {
    const view = render(<PhotoCarousel photoPaths={[]} />);
    await settle();
    const chain = ancestors(view.getByText('No photos yet'));
    expect(chain.some((n) => n.props?.accessibilityState?.disabled)).toBe(false);
    // Nor a phantom control: dropping only `disabled` would leave a hero that
    // focuses and responds while doing nothing.
    expect(chain.some((n) => typeof n.props?.onStartShouldSetResponder === 'function')).toBe(false);
  });

  // One stop, not two. The hero is a Camera glyph plus a line of text; without
  // `accessible` the label is inert and the glyph can take a focus of its own.
  it('the empty hero is one accessible node', async () => {
    const view = render(<PhotoCarousel photoPaths={[]} />);
    await settle();
    const labelled = view.getByLabelText('No photos yet');
    expect(labelled.props.accessible).toBe(true);
    expect(ancestors(view.getByText('No photos yet'))).toContain(labelled);
  });

  // The add branch keeps its behaviour and gains the announcement it never had:
  // it was a real button that never said so (no role, no label), which is the
  // mirror of the defect above — a control that under-claims rather than one
  // that over-claims.
  it('the addable hero is an enabled button that says so', async () => {
    const view = render(<PhotoCarousel photoPaths={[]} onAddPhoto={jest.fn()} />);
    await settle();
    const row = view.getByRole('button');
    expect(row.props.accessibilityState?.disabled).toBeFalsy();
    // Announced by its own visible line — no invented label, so what VoiceOver
    // reads and what Voice Control can be told to tap are the same words.
    expect(row.props.accessibilityLabel).toBeUndefined();
    expect(view.getByText('Tap to add a photo')).toBeTruthy();
  });

  // The same affordance in the non-empty carousel — the trailing "Add another"
  // slide. Same fix, so that one screen does not announce its two add-photo
  // controls two different ways.
  it('the trailing add slide announces itself as a button', async () => {
    const view = render(<PhotoCarousel photoPaths={['a.jpg']} onAddPhoto={jest.fn()} />);
    const row = await waitFor(() => view.getByLabelText('Add another photo'));
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityState?.disabled).toBeFalsy();
  });
});
