import { render } from '@testing-library/react-native';
import { RundownTileRow } from './RundownTileRow';
import type { RundownTile } from '../../lib/rundown';

// ── CUL-728 item 1 — a row that does not tap must not ANNOUNCE a control ─────
//
// The row was one TouchableOpacity carrying `disabled={!tappable}` beside
// `accessibilityRole={tappable ? 'button' : 'text'}`. The role switch states the
// author's intent exactly — when it does not tap, it is text — and `disabled`
// contradicts it on the same element: RN copies `disabled` into
// `accessibilityState.disabled` (TouchableOpacity.js) and iOS maps that to
// UIAccessibilityTraitNotEnabled (RCTViewComponentView.mm), which VoiceOver
// speaks as "dimmed". So the row announced "…, text, dimmed" — an unavailable
// control, on a screen whose whole job is being read aloud in a consult room.
//
// Asserted on the STATE and on responder-ness, never through `fireEvent.press`:
// a press on a disabled touchable is silent whether the defect is present or
// not, so it cannot tell "inert" from "inert and announced as unavailable", and
// the announcement IS the defect (the CUL-579 lesson, one layer over).
describe('RundownTileRow', () => {
  const tile = (over: Partial<RundownTile> = {}): RundownTile => ({
    key: 'weight',
    label: 'Weight',
    value: '12.4 lbs',
    tap: null,
    ...over,
  });

  const ancestors = (node: any) => {
    const out: any[] = [];
    let n = node;
    while (n) { out.push(n); n = n.parent; }
    return out;
  };

  it('an untappable row carries no disabled state to announce', () => {
    const view = render(<RundownTileRow tile={tile()} />);
    const chain = ancestors(view.getByText('12.4 lbs'));
    expect(chain.some((n) => n.props?.accessibilityState?.disabled)).toBe(false);
    // And not a phantom control either: the rival fix — keep the touchable, drop
    // only `disabled` — leaves a row that focuses and responds while doing
    // nothing, which is the same lie with the trait filed off.
    expect(chain.some((n) => typeof n.props?.onStartShouldSetResponder === 'function')).toBe(false);
  });

  // A tile can be untappable in two ways — no `tap` target, or no `onPress` from
  // the host. `tappable` is the AND of them, so both branches are pinned: the
  // rundown screen passes `onPress` only when `tile.tap` is set, and a future
  // host that passes a handler for every row must not resurrect the trait.
  it('is inert with a handler but no tap target', () => {
    const view = render(<RundownTileRow tile={tile()} onPress={jest.fn()} />);
    const chain = ancestors(view.getByText('12.4 lbs'));
    expect(chain.some((n) => n.props?.accessibilityState?.disabled)).toBe(false);
    expect(chain.some((n) => typeof n.props?.onStartShouldSetResponder === 'function')).toBe(false);
  });

  // The label is load-bearing, not decoration. The row is two or three separate
  // Text nodes that only merge into one announcement because the touchable was
  // `accessible` by default — so a plain View without `accessible` splits them
  // back into "Weight", "12.4 lbs", "over 30 days": three stops, no relationship.
  it('an untappable row is one accessible node carrying the whole line', () => {
    const view = render(
      <RundownTileRow tile={tile({ detail: 'over 30 days' })} />,
    );
    const labelled = view.getByLabelText('Weight: 12.4 lbs, over 30 days');
    expect(labelled.props.accessible).toBe(true);
    expect(ancestors(view.getByText('over 30 days'))).toContain(labelled);
  });

  // A designed-empty tile (Principle 5) is styled quieter but is still an
  // ordinary row here — `empty` never decided tappability, and must not start.
  it('an empty tile that still taps keeps its button', () => {
    const view = render(
      <RundownTileRow
        tile={tile({ value: 'None logged', empty: true, tap: { kind: 'log-visit' } })}
        onPress={jest.fn()}
      />,
    );
    const row = view.getByLabelText('Weight: None logged');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityState?.disabled).toBeFalsy();
  });

  // The tappable branch keeps every announcement it had. Pinned because the fix
  // touches this branch too (it lost the `disabled` prop and the conditional
  // role), and a regression here is a real control that stops saying it is one.
  it('a tappable row still announces a real, enabled button', () => {
    const onPress = jest.fn();
    const view = render(
      <RundownTileRow tile={tile({ tap: { kind: 'weight' } })} onPress={onPress} />,
    );
    const row = view.getByLabelText('Weight: 12.4 lbs');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityState?.disabled).toBeFalsy();
  });
});
