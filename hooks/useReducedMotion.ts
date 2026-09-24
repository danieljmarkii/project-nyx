import { stillWhenUnknown, useReducedMotionStore } from '../store/reducedMotionStore';

// Shared reduced-motion read (B-284 §1.5 motion budget: every animated component
// defines a static frame and must respect the OS setting). Single source so
// CulpritMark (N2), WhorlSpinner (N3), and any future ambient loop read one value
// instead of each hand-rolling AccessibilityInfo wiring.
//
// CUL-1123: this is a selector over `store/reducedMotionStore.ts`, which reads the OS
// once at app start, and the root layout renders nothing until that read has answered.
// So the value is right on a component's FIRST render: nothing triggered on mount can
// start with the wrong answer and snap when the right one lands. While the setting is
// still unknown it reads as reduced (`stillWhenUnknown`). An event handler that needs
// the value at the moment of a tap uses `reducedMotionNow()` from the store instead.
export function useReducedMotion(): boolean {
  return useReducedMotionStore((s) => stillWhenUnknown(s.reduceMotion));
}
