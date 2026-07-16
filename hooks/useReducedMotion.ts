import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Shared reduced-motion read (B-284 §1.5 motion budget: every animated component
// defines a static frame and must respect the OS setting). Single source so
// CulpritMark (N2), WhorlSpinner (N3), and any future ambient loop share one
// subscription pattern instead of each hand-rolling AccessibilityInfo wiring.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduced(enabled);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduced(enabled);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
