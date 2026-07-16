import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { theme } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { WhorlSpinner } from '../brand/WhorlSpinner';

// The Home pull-to-refresh strip (B-284 §5, REVISED 2026-07-12 after on-device QA). A
// light, quiet band slides down over the top of the feed while a manual refresh runs —
// the brand's teal WhorlSpinner (day ground) over a soft elevated surface + one muted
// line — then retracts on settle.
//
// Revised from the original dark "night sky" band (NightGround aurora + starfield + a
// night whorl). On device that treatment failed three ways for a *routine* refresh: the
// near-black band dropping over the light Home was a jarring contrast whiplash, the aurora
// glow read as unpolished, and the animated starfield dropped frames (janky). This light
// strip fixes all three by construction — minimal contrast against the light Home, no
// glow, and nothing heavy to render (the WhorlSpinner is the only motion, already
// native-driver + reduced-motion aware). Revises the §5 "night band" treatment (Tier-2
// doc edit flagged for the PM).
//
// The RefreshControl owns the pull gesture (its native indicator is hidden so this band is
// the only feedback); the band is driven by the `active` (refreshing) flag, so it's fully
// controlled and cross-platform rather than depending on iOS overscroll math. Sits BELOW
// the pinned HomeHeader (which owns the top safe-area inset), so the band is already clear
// of the notch. Reduced motion: instant show/hide + the WhorlSpinner's own static frame.
// The copy is the §9 string; ZERO_TEXT flips to the pre-approved text-free fallback.

const BAND_HEIGHT = 96;
const ZERO_TEXT = false; // pre-approved fallback: set true to drop the line (§9)

export function PullToRefreshSky({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
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
      <WhorlSpinner size="sm" ground="day" />
      {!ZERO_TEXT && <Text style={styles.msg}>Checking for anything new…</Text>}
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
    // A soft elevated surface (the "pulled-down" strip), not a dark sky — a hairline
    // bottom edge crisps it against the white feed without a heavy shadow.
    backgroundColor: theme.colorSurfaceSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colorBorder,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space1,
    overflow: 'hidden',
    zIndex: 5,
  },
  msg: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
});
