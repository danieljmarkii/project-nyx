import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { theme } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { NightGround } from '../brand/NightGround';
import { WhorlSpinner } from '../brand/WhorlSpinner';

// The Home pull-to-refresh sky (B-284 §5): while a manual refresh runs, a night band
// slides down over the top of the feed — stars + a small night WhorlSpinner + one
// muted line — then retracts on settle. The RefreshControl owns the pull gesture (its
// native indicator is hidden so this band is the only feedback); this band is driven
// by the `active` (refreshing) flag, so it's fully controlled and cross-platform
// rather than depending on iOS overscroll math.
//
// Sits BELOW the pinned HomeHeader (which owns the top safe-area inset), so the band
// is already clear of the notch (AC-N3). Reduced-motion: instant show/hide + the
// WhorlSpinner's static frame. The copy is the §9 string; ZERO_TEXT flips to the
// pre-approved text-free fallback without a code round-trip.

const BAND_HEIGHT = 112;
const ZERO_TEXT = false; // pre-approved fallback: set true to drop the line (§9)

export function PullToRefreshSky({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const [mounted, setMounted] = useState(active);
  const p = useRef(new Animated.Value(active ? 1 : 0)).current;
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    if (active) {
      setMounted(true);
      Animated.timing(p, {
        toValue: 1,
        duration: reduced ? 0 : theme.durationMedium,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(p, {
        toValue: 0,
        duration: reduced ? 0 : theme.durationMedium,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && alive.current) setMounted(false);
      });
    }
  }, [active, reduced, p]);

  if (!mounted && !active) return null;

  const translateY = p.interpolate({ inputRange: [0, 1], outputRange: [-BAND_HEIGHT, 0] });

  return (
    <Animated.View
      style={[styles.band, { transform: [{ translateY }], opacity: p }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <NightGround width={width} height={BAND_HEIGHT} maxStars={6} />
      <Animated.View style={styles.inner}>
        <WhorlSpinner size="sm" ground="night" />
        {!ZERO_TEXT && <Text style={styles.msg}>Checking for anything new…</Text>}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: BAND_HEIGHT,
    overflow: 'hidden',
    zIndex: 5,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space1,
  },
  msg: {
    fontSize: theme.textSM,
    color: theme.colorTextOnNightMuted,
  },
});
