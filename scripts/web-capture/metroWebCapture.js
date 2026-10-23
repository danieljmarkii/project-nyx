// The web capture path's Metro hook (CUL-1895). Loaded by metro.config.js only when
// NYX_WEB_CAPTURE=1, and every swap below applies to platform 'web' only, so no phone
// bundle can reach a stub.
const path = require('path');

const STUBS = path.join(__dirname, 'stubs');

// Module name → the web stub that stands in for it. Each stub says why in its header.
const WEB_STUBS = {
  'expo-secure-store': 'secureStore.ts',
  'expo-sqlite': 'sqlite.ts',
  'expo-router/entry': 'entry.ts',
  // babel-preset-expo rewrites app imports from react-native to these per-export paths.
  'react-native-web/dist/exports/findNodeHandle': 'findNodeHandle.ts',
  '@expo/ui/swift-ui': 'nativeViewsInert.ts',
  '@expo/ui/swift-ui/modifiers': 'nativeViewsInert.ts',
};

module.exports = function applyWebCapture(config) {
  // expo-sqlite's web build imports its wa-sqlite engine as a .wasm asset.
  if (!config.resolver.assetExts.includes('wasm')) {
    config.resolver.assetExts = [...config.resolver.assetExts, 'wasm'];
  }
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (platform === 'web' && WEB_STUBS[moduleName]) {
      return { type: 'sourceFile', filePath: path.join(STUBS, WEB_STUBS[moduleName]) };
    }
    // react-native-web re-exports findNodeHandle from inside its own entry, so the swap
    // keys on that relative import from that one file.
    if (
      platform === 'web' &&
      moduleName === './exports/findNodeHandle' &&
      /react-native-web[\\/]dist[\\/]index\.js$/.test(context.originModulePath)
    ) {
      return { type: 'sourceFile', filePath: path.join(STUBS, 'findNodeHandle.ts') };
    }
    return upstream
      ? upstream(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  };
  return config;
};
