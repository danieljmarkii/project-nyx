// The capture path's web entry (CUL-1895): index.ts imports 'expo-router/entry', which
// metroWebCapture.js points here on web when NYX_WEB_CAPTURE=1. It runs the text-size
// setup before any screen module loads, then starts the app exactly as index.ts does.
import './fontScale';
import 'expo-router/entry.js';
