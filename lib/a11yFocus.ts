// Move the screen reader's focus to a mounted node (D2-3 · CUL-1065 — the Signal screen
// lands VoiceOver on its title when the model arrives; §06: "a route gives … VoiceOver
// focus for free", and this is the one line that says where).
//
// `findNodeHandle` answers null off-device (the test renderer has no native tags), so the
// helper reports whether it could ask; a caller's suite asserts the CALL (the wiring), and
// the device pass (D2-9) is where the focus itself is verified. Never a throw: a missing
// tag is a no-op, and a screen never fails to render because assistive focus could not
// be placed.

import { AccessibilityInfo, findNodeHandle } from 'react-native';
import type { Component } from 'react';

/** Ask the platform to focus `node` for assistive tech. True when a native tag existed. */
export function focusAccessibility(node: Component | null | undefined): boolean {
  if (!node) return false;
  const tag = findNodeHandle(node);
  if (tag == null) return false;
  AccessibilityInfo.setAccessibilityFocus(tag);
  return true;
}
