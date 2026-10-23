// The web capture path's Metro hook (CUL-1895). Loaded by metro.config.js only when
// NYX_WEB_CAPTURE=1, and every swap below applies to platform 'web' only, so no phone
// bundle can reach a stub.
const path = require('path');

const STUBS = path.join(__dirname, 'stubs');

// Module name → the web stub that stands in for it. Each stub says why in its header.
const WEB_STUBS = {
  'expo-secure-store': 'secureStore.ts',
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
    return upstream
      ? upstream(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  };
  return config;
};
