// Strip the Live Activities keys expo-widgets writes into the APP's Info.plist.
//
// expo-widgets@57.0.6's `withAppInfoPlist` sets `NSSupportsLiveActivities: true`
// and `NSSupportsLiveActivitiesFrequentUpdates` on every run, with no option to
// turn them off (plugin/src/ios/withAppInfoPlist.ts). Culprit starts no Live
// Activity: nothing in the app calls ActivityKit, and the widget bundle's
// generated `WidgetLiveActivity()` has nothing to show. A capability key with
// nothing behind it is a question App Review can ask and we cannot answer
// (CUL-1839), so this removes both. Without the key, ActivityKit refuses a
// request, so nothing can start one by accident either.
//
// Delete this plugin the day Culprit ships a real Live Activity.
//
// ORDERING IS LOAD-BEARING (the rule withoutPushEntitlement.js documents): base
// mods run in REVERSE registration order, so this must sit BEFORE "expo-widgets"
// in app.json's `plugins` array to run AFTER its `withInfoPlist` mod. Registered
// after, it runs first and the keys come straight back. Verify with
// `npx expo config --type introspect`: `ios.infoPlist` must carry neither key.

const { withInfoPlist } = require('expo/config-plugins');

const LIVE_ACTIVITY_KEYS = ['NSSupportsLiveActivities', 'NSSupportsLiveActivitiesFrequentUpdates'];

module.exports = function withoutLiveActivities(config) {
  return withInfoPlist(config, (mod) => {
    for (const key of LIVE_ACTIVITY_KEYS) delete mod.modResults[key];
    return mod;
  });
};

module.exports.LIVE_ACTIVITY_KEYS = LIVE_ACTIVITY_KEYS;
