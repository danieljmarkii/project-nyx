// Strip the `aps-environment` entitlement expo-widgets adds unconditionally.
//
// expo-widgets@57.0.6's `withPushNotifications` mod writes
// `aps-environment: 'development'` into the APP's entitlements on every run —
// its `enablePushNotifications` option only gates the Info.plist flag, not the
// entitlement (plugin/src/ios/withPushNotifications.ts). Culprit ships no push:
// the push-notification provider is still an open question in CLAUDE.md, and
// B-288's pilot is local notifications, which need no entitlement at all.
//
// Claiming a capability we do not use is not free — it forces the Push
// Notifications capability onto the App ID at signing time and puts an
// entitlement in front of App Review that nothing in the binary justifies. So
// this runs after expo-widgets and removes the key.
//
// Delete this plugin the day we genuinely adopt remote push (then the
// entitlement should come from the push module that needs it, deliberately).
//
// WHY expo-notifications IS NOT IN app.json's `plugins` ARRAY (B-661, notification
// foundation): the notification foundation is LOCAL-first by ruling (D2 — no push
// provider, no APNs entitlement in Part 1). The expo-notifications config plugin's
// only iOS effect is to add `aps-environment` UNCONDITIONALLY
// (withNotificationsIOS.js) — the exact key this plugin exists to remove, and one
// we do not need: iOS LOCAL notifications require a runtime permission, not a
// build entitlement. The native module is linked by its presence in `dependencies`
// alone; the config plugin is only for build-time customization (an Android icon,
// notification sounds) that Part 1 does not use, and iOS is the QA target. So we
// omit it rather than add-then-strip. If a later PR needs the Android icon,
// register "expo-notifications" BEFORE this plugin in the array (the reverse-order
// rule below) so this strip still removes the entitlement it re-adds.
//
// ORDERING IS LOAD-BEARING: base mods run in REVERSE registration order, so
// this must sit BEFORE "expo-widgets" in app.json's `plugins` array to run
// AFTER it. Registered after, it runs first and the entitlement comes straight
// back. Verified with `npx expo config --type introspect` — re-run that if the
// plugin list is ever reordered.

const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (mod) => {
    delete mod.modResults['aps-environment'];
    return mod;
  });
};
