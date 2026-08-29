import { useState, useSyncExternalStore } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import * as Network from 'expo-network';
import { ThemedText } from '../ui/ThemedText';
import { theme } from '../../constants/theme';
import { getPublicUrl } from '../../lib/storage';
import { isOnlineFromState } from '../../lib/network';

// Same bucket the Pet tab uploads to — every avatar surface reads from it.
const PET_PHOTO_BUCKET = 'nyx-pet-photos';

// ── The reconnect epoch (CUL-617) ───────────────────────────────────────────
// A photo that failed has to be able to come BACK. The tab bar mounts once for
// the whole session, so "launched offline" would otherwise strand every disc on
// its initial until the app is relaunched — the first scenario the issue names.
// The only trigger that actually fixes that is an offline→online transition.
//
// Module-level ON PURPOSE, rather than a `useIsOnline()` per instance: the
// switcher sheet and the archived list render one avatar per pet, so a
// per-instance hook would open a native listener per disc. One subscription
// serves every mounted avatar, opened lazily by the first and released by the
// last, so a screen with no avatars pays nothing.
let reconnectEpoch = 0;
// Seeded from a REAL read on first subscribe, not left optimistically `true`.
// The listener reports network CHANGES, so an app launched already-offline may
// never see an offline event — and then the one online event that follows would
// find `wasOnline` still true, read as "no edge", and strand every disc on its
// initial for the session. That is precisely the launched-offline case this
// whole mechanism exists for, so the baseline has to come from the device rather
// than from an assumption. (`useIsOnline` seeds the other way on purpose: it
// GUARDS an action, where a wrong optimistic read costs a blocked user; here a
// wrong optimistic read costs a missed retry, so the safe default is inverted.)
let wasOnline = true;
const epochListeners = new Set<() => void>();
let networkSub: { remove: () => void } | null = null;

function subscribeToReconnect(onChange: () => void): () => void {
  const first = epochListeners.size === 0;
  epochListeners.add(onChange);
  if (first) {
    Network.getNetworkStateAsync()
      .then((state) => { wasOnline = isOnlineFromState(state); })
      // Keep the optimistic baseline: a disc that misses one retry is the same
      // designed initial it was already showing, so this must never throw into a
      // render path over a cosmetic layer.
      .catch(() => {});
  }
  networkSub ??= Network.addNetworkStateListener((state) => {
    const online = isOnlineFromState(state);
    // Only the offline→online EDGE advances the epoch. Advancing on every
    // network event would re-mount a perfectly good photo on any state change,
    // which costs a fetch and a flicker to fix nothing.
    if (online && !wasOnline) {
      reconnectEpoch += 1;
      epochListeners.forEach((listener) => listener());
    }
    wasOnline = online;
  });

  return () => {
    epochListeners.delete(onChange);
    if (epochListeners.size === 0) {
      networkSub?.remove();
      networkSub = null;
    }
  };
}

const readEpoch = () => reconnectEpoch;

interface PetAvatarProps {
  name: string;
  photoPath: string | null;
  size: number;
}

// One avatar for every pet-identity surface (home header, switcher sheet, tab
// bar, archived list): the pet's photo when present, over the soft tinted-disc
// initial from the PM-approved multi-pet mock. Shared so the switcher rows can
// never drift from the header's rendering of the same pet.
//
// The initial is the FLOOR, not a rival branch (CUL-617). It used to be the
// `no-path` fallback only, so a pet WITH a photo had nothing to render while the
// bytes were in flight or if they never arrived — an empty circle on first
// launch offline, on a slow cold start, or against a 404ing storage object. That
// became load-bearing when the disc turned into the Pet tab's identity anchor on
// every screen (CUL-599): a blank circle labelled "Pet" is total identity loss
// in the chrome whose whole pitch is identity at all times.
//
// So the chip always renders and the photo layers over it. RN paints nothing for
// an image in flight, which means the initial IS the loading state with no
// opacity juggling and no flash — and `onError` drops the photo layer, which
// means the initial is also the failed state. Deliberately the SAME answer for
// both: at 22pt in the tab bar this disc's whole job is identity, and "B" says
// who this is while a shimmer would only say that something is coming. An owner
// cannot act on "the CDN 404'd" from chrome either, so a broken-photo mark here
// would erode trust in the app rather than in the photo. That question is
// answerable on the Pet profile's hero, where "Change photo" sits underneath it.
export function PetAvatar({ name, photoPath, size }: PetAvatarProps) {
  const photoUri = photoPath ? getPublicUrl(PET_PHOTO_BUCKET, photoPath) : null;
  const round = { width: size, height: size, borderRadius: theme.radiusFull };
  const epoch = useSyncExternalStore(subscribeToReconnect, readEpoch, readEpoch);

  // The failure is remembered against the ATTEMPT it belongs to, not as a bare
  // boolean, so both retry triggers fall out of the derivation instead of
  // needing a reset effect: a new photo path (pet switch, re-upload) or a
  // reconnect changes the key, which makes `failed` false again on the very same
  // render. Keying the <Image> on it is what makes RN actually re-fetch rather
  // than hold its own failed state.
  const attempt = `${photoUri ?? ''}#${epoch}`;
  const [failedAttempt, setFailedAttempt] = useState<string | null>(null);
  const showPhoto = photoUri !== null && failedAttempt !== attempt;

  return (
    <View
      testID="pet-avatar"
      style={[styles.disc, round]}
      // Decoration, not content: every consumer already names the pet on its own
      // touchable (the tab's a11y label, the switcher row's "Switch to Biscuit",
      // the header cluster's). Hiding it matters MORE now that the initial is
      // always mounted — before this change the letter reached the a11y tree
      // only for a pet with no photo, so leaving it exposed would newly make
      // VoiceOver read "B, Biscuit" on every row of the switcher.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Initial scales with the disc (0.4 ratio ≈ textMD at the header's
          38pt) rather than a fixed token, so smaller switcher-row discs don't
          render an oversized letter.

          Indexed by CODE POINT, not by `charAt(0)`: a name beginning with an emoji
          or an astral character (🐈 Mochi) has a surrogate pair as its first two
          code units, and taking one of them alone renders the replacement glyph —
          a broken-looking disc where the pet's identity should be. Newly
          load-bearing now that this disc is the Pet tab's anchor on every screen
          (CUL-599). */}
      <ThemedText style={[styles.initial, { fontSize: Math.round(size * 0.4) }]}>
        {[...name][0]?.toUpperCase() ?? ''}
      </ThemedText>

      {showPhoto && (
        <Image
          testID="pet-avatar-photo"
          key={attempt}
          source={{ uri: photoUri }}
          // Radius on the image as well as the clipping container: Android's
          // overflow clipping on a rounded parent has historically been the less
          // reliable half, and a square photo in a round slot is exactly the
          // broken-looking disc this file exists to prevent.
          style={[StyleSheet.absoluteFill, { borderRadius: theme.radiusFull }]}
          resizeMode="cover"
          onError={() => setFailedAttempt(attempt)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    backgroundColor: theme.colorAccentLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Geist face, not bare fontWeight — RN doesn't synthesize weights for custom
  // fonts (see lib/fonts.ts). Header-scoped face reused here so the switcher's
  // discs match the strip's exactly.
  initial: {
    fontFamily: theme.fontBodySemibold,
    color: theme.colorTextPrimary,
  },
});
