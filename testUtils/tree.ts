// Shared readers over a rendered test tree — CUL-710.
//
// `owningTouchable` is load-bearing, not a convenience: it is the ONLY thing in
// this codebase that discriminates the CUL-613 / CUL-579 defect class. RTL's
// `fireEvent.press` does not simply bubble — given a node with no handler above
// it, it can still reach one by DESCENDING from an enclosing composite element.
// So a press on an inert label fires a sibling's touchable, and a test written
// that way passes unchanged against the unfixed tree: green over the exact defect
// it exists for (met the hard way in `TimeConfidenceField.test.tsx`). Node
// identity cannot be reached that way — two texts share a button only if they
// really are inside one. To assert tappability, walk UP to the responder host
// and compare identity: `owningTouchable(label) === owningTouchable(value)`, or
// `!== null`.
//
// Three test files carried this walk verbatim. One copy means a future correction
// (a React Native change to which props mark a responder host) lands once,
// instead of leaving a file that missed it green while proving nothing.
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

/** The minimum a rendered node exposes for these walks. `ReactTestInstance`
 *  satisfies it structurally, so a `getByText(…)` result passes straight in. */
export interface TreeNode {
  parent: TreeNode | null;
  props: Record<string, unknown>;
}

/** The nearest responder host at or above `node` — a touchable is `accessible` and
 *  owns `onStartShouldSetResponder`; a plain View has no responder — or null if the
 *  node sits in no button at all. */
export function owningTouchable(node: TreeNode | null | undefined): TreeNode | null {
  let n: TreeNode | null | undefined = node;
  while (n) {
    if (n.props?.accessible && typeof n.props?.onStartShouldSetResponder === 'function') return n;
    n = n.parent;
  }
  return null;
}

/** The nearest ancestor containing BOTH nodes — whichever element the two are
 *  siblings in, derived from the tree rather than reached by a fixed number of
 *  `.parent` hops, so it does not quietly start measuring some other element
 *  after a refactor. */
export function commonAncestor(a: TreeNode | null, b: TreeNode | null): TreeNode | null {
  const chain = new Set<TreeNode>();
  for (let n: TreeNode | null = a; n; n = n.parent) chain.add(n);
  for (let n: TreeNode | null = b; n; n = n.parent) if (chain.has(n)) return n;
  return null;
}

/** Facing reach toward a neighbour, from a rendered `hitSlop` prop — the CUL-612
 *  arithmetic is `gap >= facing(a) + facing(b)`. A number is reach on all four
 *  edges; an object yields per-edge; absent is no reach at all. */
export function facing(node: TreeNode | null, edge: 'top' | 'bottom' | 'left' | 'right'): number {
  const slop = node?.props?.hitSlop;
  if (slop == null) return 0;
  if (typeof slop === 'number') return slop;
  return (slop as Partial<Record<typeof edge, number>>)[edge] ?? 0;
}

/** The node's RENDERED style, flattened. Geometry is asserted off this, never off
 *  tokens restated in the test (CUL-621). */
export function flat(node: TreeNode | null): Record<string, number | undefined> {
  const style = node?.props?.style as StyleProp<ViewStyle>;
  return (StyleSheet.flatten(style) ?? {}) as Record<string, number | undefined>;
}
