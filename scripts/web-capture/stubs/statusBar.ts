// expo-status-bar for the capture path's web build (CUL-2703). Mapped in by
// metroWebCapture.js on web only, when NYX_WEB_CAPTURE=1.
//
// On a Duo, iOS stands its bars in a strip down one side when the phone is folded, on its
// side or in Split View, and the app follows the edge `useVerticalBarEdgeIOS` reports
// (`hooks/useLayoutClass.ts`). A browser has no such strip and the library's web build
// answers null, so every capture was of the bars lying flat: the pose the first device
// check did NOT fail in. The capture script sets `globalThis.__NYX_SYSTEM_BAR_EDGE` for a
// size written `WxH+right` or `WxH+left`; unset, the hook answers null as the library does.
//
// The rest is the library's own web build, restated: a browser has no status bar, so the
// component draws nothing and every setter is a no-op. The package exports only its
// entry, so this cannot re-export from a file inside it.

export type VerticalBarEdgeIOS = 'leading' | 'trailing';

export function useVerticalBarEdgeIOS(): VerticalBarEdgeIOS | null {
  const edge = (globalThis as { __NYX_SYSTEM_BAR_EDGE?: unknown }).__NYX_SYSTEM_BAR_EDGE;
  return edge === 'leading' || edge === 'trailing' ? edge : null;
}

export function StatusBar(): null {
  return null;
}
StatusBar.setStyle = (): void => {};
StatusBar.setHidden = (): void => {};
StatusBar.getVerticalBarEdgeIOS = (): VerticalBarEdgeIOS | null => null;
StatusBar.setVerticalBarBehaviorIOS = (): void => {};

export function setStatusBarStyle(): void {}
export function setStatusBarHidden(): void {}
