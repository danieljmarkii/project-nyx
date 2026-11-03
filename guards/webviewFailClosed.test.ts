// Android report WebViews fail CLOSED (CUL-2486).
//
// react-native-webview 14 asks JS whether a navigation may load and, past 250 ms with no answer
// (or on an interrupt), loads it anyway. `RNCWebView`'s constructor sets the messaging module for
// every WebView, so every frame with `onShouldStartLoadWithRequest` took that path: an injected
// script could keep the JS thread busy while looping `location=` and walk the record out of a
// report frame past `isPreviewLoadAllowed`. `patches/react-native-webview+<version>.patch` makes
// both branches block. This guard reads the INSTALLED source (what a build compiles, after
// `postinstall` applied the patch) and the patch's version against package.json, so a version bump
// that drops the patch, or a patch that stops applying, reds here instead of shipping fail-open.

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const CLIENT = join(
  ROOT,
  'node_modules/react-native-webview/android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java',
);

/** The body of `shouldOverrideUrlLoading(WebView view, String url)`, the one that waits on JS. */
function blockingMethod(src: string): string {
  const start = src.indexOf('public boolean shouldOverrideUrlLoading(WebView view, String url)');
  const end = src.indexOf('public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request)');
  if (start < 0 || end < start) throw new Error('RNCWebViewClient.java no longer has the expected shape');
  return src.slice(start, end);
}

/** The statements from `marker` to the end of its branch (the next `}`), with comments stripped. */
function branchAfter(body: string, marker: string): string {
  const at = body.indexOf(marker);
  if (at < 0) throw new Error(`branch not found: ${marker}`);
  return body
    .slice(at, body.indexOf('}', at))
    .replace(/\/\/[^\n]*/g, '');
}

describe('react-native-webview Android navigation check fails closed (CUL-2486)', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  it('the patch exists for the pinned version and runs on install', () => {
    const version = pkg.dependencies['react-native-webview'];
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(existsSync(join(ROOT, 'patches', `react-native-webview+${version}.patch`))).toBe(true);
    expect(pkg.scripts.postinstall).toMatch(/\bpatch-package\b/);
    expect(pkg.devDependencies['patch-package']).toBeDefined();
  });

  it('the installed client blocks on the timeout and on an interrupt', () => {
    const body = blockingMethod(readFileSync(CLIENT, 'utf8'));
    const timeout = branchAfter(body, 'SHOULD_OVERRIDE_URL_LOADING_TIMEOUT) {');
    const interrupted = branchAfter(body, 'catch (InterruptedException e) {');
    for (const branch of [timeout, interrupted]) {
      expect(branch).toMatch(/return true;/);
      expect(branch).not.toMatch(/return false;/);
    }
    expect(body).not.toMatch(/defaulting to allow loading/);
  });
});
