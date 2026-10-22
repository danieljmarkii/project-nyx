// How far a scroll must move to bring a node fully into its frame (CUL-2088).
//
// The trial heads-up line on a meal's screen spends the once-per-food ledger only once it
// is ON SCREEN, and "rendered" is not that: on a photo meal on a small phone the line
// mounts below the fold (adversarial pass 1). So the screen scrolls it into view first and
// the line measures again before spending. All four values are window coordinates
// (`measureInWindow`). Positive moves the content up (the node was below the frame),
// negative moves it down, zero means it is already wholly in view.
export function scrollDeltaToReveal(
  node: { top: number; bottom: number },
  frame: { top: number; bottom: number },
  margin: number,
): number {
  if (node.top >= frame.top && node.bottom <= frame.bottom) return 0;
  if (node.bottom > frame.bottom) {
    // Below: bring its bottom in, but never past its top (a node taller than the frame
    // shows its start).
    return Math.min(node.bottom - frame.bottom + margin, node.top - frame.top - margin);
  }
  return node.top - frame.top - margin;
}

/** Is the node wholly inside the frame? */
export function isWhollyInView(node: { top: number; bottom: number }, frame: { top: number; bottom: number }): boolean {
  return node.top >= frame.top && node.bottom <= frame.bottom;
}
