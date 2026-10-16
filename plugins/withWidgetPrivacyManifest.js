// Give the widget extension its own privacy manifest (CUL-1839).
//
// `ios.privacyManifests` in app.json reaches only the APP target: Expo's
// `withPrivacyInfo` writes `<Project>/PrivacyInfo.xcprivacy` and adds it to the
// first target's resources. The widget is a separate bundle (`.appex`) and Apple
// reads each bundle's manifest on its own, so an extension that touches a
// required-reason API needs its own file. Ours does: expo-widgets' generated
// Swift reads the layout and timeline through `WidgetsStorage`, which is
// `UserDefaults(suiteName:)` on the App Group. Hence the two UserDefaults
// reasons, the same pair the app declares (the build note asks for both):
//   1C8F.1 — read/write data shared with the app through the App Group, the
//            one WidgetsStorage needs;
//   CA92.1 — read/write data only this bundle uses, cover for the Expo and RN
//            modules linked into the extension that may touch standard defaults.
// React Native's CocoaPods privacy aggregation (expo-widgets' Podfile block for
// the target enables it) merges the pods' reasons INTO this file, since it is
// already in the target's resources, rather than adding a second one.
// No tracking, no tracking domains, and no collected data types: the extension
// sends nothing anywhere (the widget is informational only, never writes).
//
// Two mods, one per thing expo-widgets builds:
//   1. A dangerous mod writes `ios/ExpoWidgetsTarget/PrivacyInfo.xcprivacy`.
//      expo-widgets' own dangerous mod DELETES and recreates that directory
//      (withWidgetSourceFiles.ts: `fs.rmSync(targetDirectory)`), so ours must
//      run after it.
//   2. An xcodeproj mod gives the extension target a Resources build phase
//      holding that file, so it is copied into the `.appex`. expo-widgets
//      creates the target with Sources and Frameworks phases only.
// The objects are built by hand rather than with xcode's `addBuildPhase(paths)`
// because that helper reuses any build file whose path matches, and the app's
// own `PrivacyInfo.xcprivacy` could be the one it picks.
//
// ORDERING IS LOAD-BEARING (the rule withoutPushEntitlement.js documents): mods
// run in REVERSE registration order, so this must sit BEFORE "expo-widgets" in
// app.json's `plugins` array to run AFTER both of its mods. Registered after,
// the file is deleted and the target does not exist yet. The result is
// invisible to `expo config --type introspect`; a scratch prebuild shows it
// (the file, and a `PrivacyInfo.xcprivacy in Resources` line under the
// ExpoWidgetsTarget in project.pbxproj).
//
// The target name is hardcoded by expo-widgets (see withWidgetIphoneOnly.js). If
// a future version renames it, the xcodeproj mod finds no target and THROWS
// rather than shipping an extension with no manifest.

const fs = require('fs');
const path = require('path');
const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');

const WIDGET_TARGET_NAME = 'ExpoWidgetsTarget';
const MANIFEST_NAME = 'PrivacyInfo.xcprivacy';

// Written as fixed XML below, so the plugin needs no plist package of its own
// (`@expo/plist` is only a transitive dependency here). The guard checks the
// XML against this object.
const WIDGET_PRIVACY_MANIFEST = {
  NSPrivacyTracking: false,
  NSPrivacyTrackingDomains: [],
  NSPrivacyCollectedDataTypes: [],
  NSPrivacyAccessedAPITypes: [
    {
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
      NSPrivacyAccessedAPITypeReasons: ['1C8F.1', 'CA92.1'],
    },
  ],
};

const WIDGET_PRIVACY_MANIFEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSPrivacyTracking</key>
	<false/>
	<key>NSPrivacyTrackingDomains</key>
	<array/>
	<key>NSPrivacyCollectedDataTypes</key>
	<array/>
	<key>NSPrivacyAccessedAPITypes</key>
	<array>
		<dict>
			<key>NSPrivacyAccessedAPIType</key>
			<string>NSPrivacyAccessedAPICategoryUserDefaults</string>
			<key>NSPrivacyAccessedAPITypeReasons</key>
			<array>
				<string>1C8F.1</string>
				<string>CA92.1</string>
			</array>
		</dict>
	</array>
</dict>
</plist>
`;

function withWidgetManifestFile(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const targetDirectory = path.join(cfg.modRequest.platformProjectRoot, WIDGET_TARGET_NAME);
      fs.mkdirSync(targetDirectory, { recursive: true });
      fs.writeFileSync(path.join(targetDirectory, MANIFEST_NAME), WIDGET_PRIVACY_MANIFEST_XML);
      return cfg;
    },
  ]);
}

function addManifestToWidgetTarget(project) {
  const targetUuid = project.findTargetKey(WIDGET_TARGET_NAME);
  if (!targetUuid) {
    throw new Error(
      `withWidgetPrivacyManifest: no "${WIDGET_TARGET_NAME}" target. Is the plugin registered before expo-widgets, and is the target still named that?`,
    );
  }
  const objects = project.hash.project.objects;
  const target = objects.PBXNativeTarget[targetUuid];
  const resourcePhases = objects.PBXResourcesBuildPhase || (objects.PBXResourcesBuildPhase = {});

  // A re-run over an existing ios/ (expo-widgets keeps its target) adds nothing twice.
  const existingPhase = target.buildPhases.find((p) => resourcePhases[p.value]);
  if (existingPhase) {
    const files = resourcePhases[existingPhase.value].files || [];
    if (files.some((f) => f.comment === `${MANIFEST_NAME} in Resources`)) return project;
  }

  const fileRefUuid = project.generateUuid();
  objects.PBXFileReference[fileRefUuid] = {
    isa: 'PBXFileReference',
    lastKnownFileType: 'text.xml',
    path: MANIFEST_NAME,
    sourceTree: '"<group>"',
  };
  objects.PBXFileReference[`${fileRefUuid}_comment`] = MANIFEST_NAME;

  const buildFileUuid = project.generateUuid();
  objects.PBXBuildFile[buildFileUuid] = {
    isa: 'PBXBuildFile',
    fileRef: fileRefUuid,
    fileRef_comment: MANIFEST_NAME,
  };
  objects.PBXBuildFile[`${buildFileUuid}_comment`] = `${MANIFEST_NAME} in Resources`;
  const buildPhaseFile = { value: buildFileUuid, comment: `${MANIFEST_NAME} in Resources` };

  if (existingPhase) {
    resourcePhases[existingPhase.value].files.push(buildPhaseFile);
  } else {
    const phaseUuid = project.generateUuid();
    resourcePhases[phaseUuid] = {
      isa: 'PBXResourcesBuildPhase',
      buildActionMask: 2147483647,
      files: [buildPhaseFile],
      runOnlyForDeploymentPostprocessing: 0,
    };
    resourcePhases[`${phaseUuid}_comment`] = 'Resources';
    target.buildPhases.push({ value: phaseUuid, comment: 'Resources' });
  }

  // The file sits in the target's group, whose path is the target directory,
  // so the "<group>"-relative path resolves to ios/ExpoWidgetsTarget/.
  const groupKey = project.findPBXGroupKey({ name: WIDGET_TARGET_NAME });
  if (!groupKey) {
    throw new Error(`withWidgetPrivacyManifest: no "${WIDGET_TARGET_NAME}" group to hold ${MANIFEST_NAME}.`);
  }
  objects.PBXGroup[groupKey].children.push({ value: fileRefUuid, comment: MANIFEST_NAME });
  return project;
}

function withWidgetManifestResource(config) {
  return withXcodeProject(config, (cfg) => {
    cfg.modResults = addManifestToWidgetTarget(cfg.modResults);
    return cfg;
  });
}

module.exports = function withWidgetPrivacyManifest(config) {
  return withWidgetManifestResource(withWidgetManifestFile(config));
};

module.exports.WIDGET_PRIVACY_MANIFEST = WIDGET_PRIVACY_MANIFEST;
module.exports.WIDGET_PRIVACY_MANIFEST_XML = WIDGET_PRIVACY_MANIFEST_XML;
module.exports.addManifestToWidgetTarget = addManifestToWidgetTarget;
