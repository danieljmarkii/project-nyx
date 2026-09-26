import { useEffect } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

// The iOS half of an `accessibilityLiveRegion` (CUL-1275).
//
// `accessibilityLiveRegion` is ANDROID-ONLY. On iOS the prop does nothing, so a node that
// relies on it alone is silent to VoiceOver — and Nyx ships iOS-first. That is how every
// completion surface in the app shipped: the save was confirmed on screen, confirmed to
// TalkBack, and never spoken on an iPhone. `TextField` and `SignalZone`'s ack line found
// the same gap first and closed it inline; this is that fix, lifted, so a new live region
// has one thing to reach for (and `guards/liveRegion.test.ts` fails the build on a live
// region with no iOS half).
//
// iOS ONLY, deliberately. Every caller pairs this with a node carrying the live region,
// which already speaks on Android — announcing there too would double-speak. A surface
// with NO live region (SignalZone's arrival is the precedent) is not a caller of this
// hook: it announces on both platforms itself.
//
// WHEN IT SPEAKS. Each time `message` changes to a new non-null value, or `key` changes
// while a message is up. `null` is silence and re-arms: a card that hides and comes back
// with the same sentence speaks again. `key` exists for the case the message alone cannot
// see — a second save that produces a byte-identical sentence while the first card is
// still on screen (the same vomit type, the same minute) is a new confirmation, and the
// payload's id says so when the string cannot.
//
// WHAT THIS CANNOT PROMISE. Whether the utterance lands is a DEVICE question: an
// announcement posted in the same instant as a screen change (a sheet dismissing, a route
// popping) can be cut off by VoiceOver reading the newly focused element. If the device
// pass finds that, `announceForAccessibilityWithOptions` (`queue` / `priority`) is the
// knob, and it is turned here, once, for every caller.
export function useLiveRegionAnnouncement(message: string | null, key?: string | null): void {
  useEffect(() => {
    if (message && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [message, key]);
}
