// Native config for the 1.2.0 cut (CUL-1839): what app.json and its two plugins
// must leave in the binary. `npx expo config --type introspect` and a scratch
// prebuild are the real proof (the PR records both); this guard keeps the pieces
// that a later edit to app.json could silently undo.
//
// The load-bearing one is ORDER: config-plugin mods run in reverse registration
// order, so a plugin that edits what expo-widgets wrote must be registered BEFORE
// "expo-widgets". Moved after it, each still runs and still passes its own unit
// test, but expo-widgets then writes over its work.

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

type PluginEntry = string | [string, Record<string, unknown>];
interface AppJson {
  expo: {
    ios: { privacyManifests?: { NSPrivacyAccessedAPITypes?: AccessedApiType[] }; infoPlist?: Record<string, unknown> };
    plugins: PluginEntry[];
  };
}
interface AccessedApiType {
  NSPrivacyAccessedAPIType: string;
  NSPrivacyAccessedAPITypeReasons: string[];
}
interface ModConfig {
  modResults: Record<string, unknown>;
}
type ModFn = (config: ModConfig) => Promise<ModConfig> | ModConfig;
interface ConfigWithMods {
  mods?: { ios?: Record<string, ModFn> };
}
type Plugin = (config: Record<string, unknown>) => ConfigWithMods;

const app = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')) as AppJson;
const pluginNames = app.expo.plugins.map((p) => (typeof p === 'string' ? p : p[0]));
const pluginOptions = (name: string): Record<string, unknown> | undefined => {
  const entry = app.expo.plugins.find((p) => (typeof p === 'string' ? p : p[0]) === name);
  return Array.isArray(entry) ? entry[1] : undefined;
};

const USER_DEFAULTS = 'NSPrivacyAccessedAPICategoryUserDefaults';
const APP_GROUP_REASONS = ['1C8F.1', 'CA92.1'];

describe('plugins that edit what expo-widgets wrote run after it', () => {
  const widgets = pluginNames.indexOf('expo-widgets');
  it.each(['./plugins/withoutPushEntitlement', './plugins/withWidgetIphoneOnly', './plugins/withoutLiveActivities', './plugins/withWidgetPrivacyManifest'])(
    '%s is registered before expo-widgets',
    (name) => {
      expect(widgets).toBeGreaterThan(-1);
      const at = pluginNames.indexOf(name);
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeLessThan(widgets);
    },
  );
});

describe('app.json', () => {
  it('turns off the Face ID string expo-secure-store adds by default', () => {
    expect(pluginOptions('expo-secure-store')).toEqual(expect.objectContaining({ faceIDPermission: false }));
  });

  it("declares the App Group UserDefaults reasons in the app's privacy manifest", () => {
    const types = app.expo.ios.privacyManifests?.NSPrivacyAccessedAPITypes ?? [];
    const userDefaults = types.find((t) => t.NSPrivacyAccessedAPIType === USER_DEFAULTS);
    expect(userDefaults?.NSPrivacyAccessedAPITypeReasons).toEqual(expect.arrayContaining(APP_GROUP_REASONS));
  });

  it('declares no Live Activities key by hand', () => {
    expect(Object.keys(app.expo.ios.infoPlist ?? {}).filter((k) => k.startsWith('NSSupportsLiveActivities'))).toEqual([]);
  });
});

describe('withoutLiveActivities', () => {
  it('removes both keys expo-widgets sets and leaves the rest', async () => {
    const plugin = jest.requireActual<Plugin>('../plugins/withoutLiveActivities');
    const config = plugin({ name: 'Culprit', slug: 'project-nyx' });
    const mod = config.mods?.ios?.infoPlist;
    expect(mod).toBeDefined();
    const out = await (mod as ModFn)({
      modResults: { NSSupportsLiveActivities: true, NSSupportsLiveActivitiesFrequentUpdates: false, ExpoWidgetsAppGroupIdentifier: 'group.com.projectnyx.app' },
    });
    expect(out.modResults).toEqual({ ExpoWidgetsAppGroupIdentifier: 'group.com.projectnyx.app' });
  });
});

describe('withWidgetPrivacyManifest', () => {
  interface WidgetPluginModule {
    WIDGET_PRIVACY_MANIFEST: { NSPrivacyTracking: boolean; NSPrivacyAccessedAPITypes: AccessedApiType[] };
    WIDGET_PRIVACY_MANIFEST_XML: string;
    addManifestToWidgetTarget: (project: FakeProject) => FakeProject;
  }
  const widgetPlugin = jest.requireActual<WidgetPluginModule>('../plugins/withWidgetPrivacyManifest');

  it("declares the same UserDefaults reasons as the app, and no tracking", () => {
    const manifest = widgetPlugin.WIDGET_PRIVACY_MANIFEST;
    expect(manifest.NSPrivacyTracking).toBe(false);
    expect(manifest.NSPrivacyAccessedAPITypes).toEqual([
      { NSPrivacyAccessedAPIType: USER_DEFAULTS, NSPrivacyAccessedAPITypeReasons: APP_GROUP_REASONS },
    ]);
  });

  it('writes XML that parses to exactly that manifest', () => {
    // A test-only parse: the plugin itself carries no plist dependency.
    const plist = jest.requireActual<{ default: { parse: (xml: string) => unknown } }>('@expo/plist').default;
    expect(plist.parse(widgetPlugin.WIDGET_PRIVACY_MANIFEST_XML)).toEqual(widgetPlugin.WIDGET_PRIVACY_MANIFEST);
  });

  // The slice of the `xcode` project API the plugin touches.
  interface FakeObjects {
    PBXNativeTarget: Record<string, { buildPhases: { value: string; comment: string }[] }>;
    PBXFileReference: Record<string, unknown>;
    PBXBuildFile: Record<string, unknown>;
    PBXGroup: Record<string, { children: { value: string; comment: string }[] }>;
    PBXResourcesBuildPhase?: Record<string, { files: { value: string; comment: string }[] } | string>;
  }
  interface FakeProject {
    hash: { project: { objects: FakeObjects } };
    findTargetKey: (name: string) => string | null;
    findPBXGroupKey: (q: { name: string }) => string | undefined;
    generateUuid: () => string;
  }
  function fakeProject(withTarget: boolean): FakeProject {
    let n = 0;
    const objects: FakeObjects = {
      PBXNativeTarget: { APP: { buildPhases: [] }, ...(withTarget ? { WIDGET: { buildPhases: [{ value: 'SRC', comment: 'Sources' }] } } : {}) },
      PBXFileReference: {},
      PBXBuildFile: {},
      PBXGroup: withTarget ? { WGROUP: { children: [] } } : {},
    };
    return {
      hash: { project: { objects } },
      findTargetKey: (name) => (withTarget && name === 'ExpoWidgetsTarget' ? 'WIDGET' : null),
      findPBXGroupKey: (q) => (withTarget && q.name === 'ExpoWidgetsTarget' ? 'WGROUP' : undefined),
      generateUuid: () => `U${++n}`,
    };
  }

  it("gives the widget target a Resources phase holding its own manifest, once", () => {
    const project = fakeProject(true);
    widgetPlugin.addManifestToWidgetTarget(project);
    widgetPlugin.addManifestToWidgetTarget(project); // a re-run over an existing ios/
    const objects = project.hash.project.objects;
    const phases = objects.PBXNativeTarget.WIDGET.buildPhases.filter((p) => p.comment === 'Resources');
    expect(phases).toHaveLength(1);
    const phase = objects.PBXResourcesBuildPhase?.[phases[0].value];
    expect(typeof phase === 'object' && phase.files.map((f) => f.comment)).toEqual(['PrivacyInfo.xcprivacy in Resources']);
    expect(objects.PBXGroup.WGROUP.children.map((c) => c.comment)).toEqual(['PrivacyInfo.xcprivacy']);
    // The app target is untouched: its manifest comes from ios.privacyManifests.
    expect(objects.PBXNativeTarget.APP.buildPhases).toEqual([]);
  });

  it('throws rather than ship an extension with no manifest when the target is missing', () => {
    expect(() => widgetPlugin.addManifestToWidgetTarget(fakeProject(false))).toThrow(/ExpoWidgetsTarget/);
  });
});
