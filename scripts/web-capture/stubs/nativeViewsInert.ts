// Web stand-in for native-view-only packages (CUL-1895 capture path only). The iOS
// widget's SwiftUI layout (`@expo/ui/swift-ui`, imported by widgets/CulpritWidget.tsx via
// lib/widgetBridge.ts) calls requireNativeView at module load, which throws on web and
// kills the boot before a single screen renders. The widget never draws inside the app,
// so every export here is an inert component or function: enough to load, never shown.
const inert = (): null => null;

const handler: ProxyHandler<Record<string, unknown>> = {
  get: (_target, key) => (key === '__esModule' ? true : inert),
};

module.exports = new Proxy({}, handler);
