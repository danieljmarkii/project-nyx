// Pin the expo-widgets extension target to iPhone-only (B-415).
//
// The app went iPhone-only (`ios.supportsTablet: false` → the APP target's
// TARGETED_DEVICE_FAMILY = "1"), but expo-widgets hardcodes the WIDGET extension
// target's build settings to `TARGETED_DEVICE_FAMILY = "1,2"` with no config
// passthrough (node_modules/expo-widgets/plugin/src/ios/xcode/addXCConfigurationList.ts:
// `commonBuildSettings.TARGETED_DEVICE_FAMILY = '"1,2"'`). So the extension
// advertises iPad support the container app doesn't have.
//
// Practical impact is probably nil — an app extension can't install where its
// container app can't — but a device-family SUPERSET in an extension is a known
// class of App Store upload-validation complaint, so we pin it rather than leave
// it to chance. This runs after expo-widgets creates the target's build
// configurations and rewrites the setting to "1" (iPhone only).
//
// WHY THIS IS INVISIBLE TO `expo config --type introspect`: it's a pbxproj build
// setting written at prebuild, not an app.json value — the only way to SEE the
// result is a real prebuild (grep the generated
// ios/*.xcodeproj/project.pbxproj for TARGETED_DEVICE_FAMILY), which is the
// verification step this patch's PR calls out.
//
// ORDERING IS LOAD-BEARING (same rule the sibling withoutPushEntitlement.js was
// verified against): base mods run in REVERSE registration order, so to run AFTER
// expo-widgets' own `withXcodeProject` mod (which CREATES the config list with
// "1,2") this plugin must sit BEFORE "expo-widgets" in app.json's `plugins`
// array. Registered after, it would run first — before the config list exists —
// and the "1,2" would come straight back. (This is an `xcodeproject` base mod;
// withoutPushEntitlement is an `entitlements` base mod, a different chain, so the
// two do not order against each other.)
//
// The target name 'ExpoWidgetsTarget' is hardcoded by expo-widgets
// (plugin/src/ios/withIosWidgets.ts: `const targetName = 'ExpoWidgetsTarget'`).
// If a future expo-widgets renames it, `pbxTargetByName` returns undefined and
// this no-ops (leaving the "1,2" default) rather than throwing — a silent revert
// the build-cut grep would catch. Delete this plugin the day expo-widgets grows a
// device-family config option, or the app re-adds iPad support.

const { withXcodeProject } = require('expo/config-plugins');

// Matches expo-widgets' hardcoded extension target name.
const WIDGET_TARGET_NAME = 'ExpoWidgetsTarget';
// Quoted to match the quoting style expo-widgets writes for this key ('"1,2"').
const IPHONE_ONLY = '"1"';

module.exports = function withWidgetIphoneOnly(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;

    // The widget extension target — the same lookup expo-widgets itself uses.
    // Absent (e.g. a non-widget prebuild, or a renamed target) → no-op.
    const target = project.pbxTargetByName(WIDGET_TARGET_NAME);
    const listUuid = target && target.buildConfigurationList;
    if (!listUuid) return cfg;

    const configList = project.pbxXCConfigurationList()[listUuid];
    if (!configList || !Array.isArray(configList.buildConfigurations)) return cfg;

    const buildConfigs = project.pbxXCBuildConfigurationSection();
    for (const ref of configList.buildConfigurations) {
      const bc = buildConfigs[ref.value];
      if (bc && bc.buildSettings) {
        // Overwrite (Debug + Release) — the extension follows the app: iPhone only.
        bc.buildSettings.TARGETED_DEVICE_FAMILY = IPHONE_ONLY;
      }
    }

    return cfg;
  });
};
