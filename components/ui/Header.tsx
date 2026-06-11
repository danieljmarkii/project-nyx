import { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronLeft, X } from 'lucide-react-native';
import { theme } from '../../constants/theme';

// Shared navigation header (B-075) — one bar for every full screen: a leading
// slot (back ‹ / close ✕ / none), a centered title, and an optional trailing
// slot. Replaces the six hand-rolled headers the app grew. The leading action
// is ALWAYS caller-controlled (onLeadingPress) — never a hardcoded
// router.back(), because some screens (log's multi-step flow, food-capture)
// need back to mean "previous step", not "pop the screen".
// This is NOT the Home identity strip (HomeHeader) — that's the top-level-tab
// variant; this is the back/title bar for pushed + modal screens.
//
// No built-in overflow (⋯) menu: a single secondary action belongs inline on
// the screen, not hidden behind a tap-to-reveal menu (PM call, B-075). A screen
// that genuinely has *several* secondary actions can pass its own trigger via
// `right`.
//
// `left` is the leading-slot escape hatch, mirroring `right`: pass arbitrary
// content when a screen's existing leading affordance isn't a plain back/close
// icon — e.g. a form modal that already had a literal "Cancel" text button and
// shouldn't be downgraded to a ✕ just to fit the component. When `left` is set
// it overrides `leading`. Reach for `leading="back" | "close"` first; `left` is
// only for the genuine exceptions.

type LeadingKind = 'back' | 'close' | 'none';

interface HeaderProps {
  title?: string;
  leading?: LeadingKind;
  onLeadingPress?: () => void;
  // Arbitrary leading content (e.g. a "Cancel" text button). Overrides `leading`.
  left?: ReactNode;
  // Arbitrary trailing content (e.g. a "Save" text button).
  right?: ReactNode;
}

// 24–26px glyphs + 12pt hitSlop ⇒ ~48–50pt tap target, clears the 44pt
// 3am-stumbling minimum without inflating the visual size.
const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

export function Header({ title, leading = 'none', onLeadingPress, left, right }: HeaderProps) {
  return (
    <View style={styles.bar}>
      <View style={styles.side}>
        {left !== undefined ? (
          left
        ) : leading !== 'none' ? (
          <TouchableOpacity
            onPress={onLeadingPress}
            hitSlop={HIT}
            accessibilityRole="button"
            accessibilityLabel={leading === 'back' ? 'Back' : 'Close'}
          >
            {leading === 'back' ? (
              <ChevronLeft size={26} color={theme.colorTextPrimary} />
            ) : (
              <X size={24} color={theme.colorTextSecondary} />
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Equal-width sides (below) guarantee the flex title sits truly centered
          regardless of which slots are filled. */}
      {title ? (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={styles.title} />
      )}

      <View style={[styles.side, styles.sideRight]}>{right}</View>
    </View>
  );
}

const SIDE = 56;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: theme.space2,
    backgroundColor: theme.colorSurface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  side: {
    width: SIDE,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  sideRight: {
    alignItems: 'flex-end',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
});
