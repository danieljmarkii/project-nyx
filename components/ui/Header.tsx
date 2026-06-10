import { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronLeft, MoreHorizontal, X } from 'lucide-react-native';
import { theme } from '../../constants/theme';

// Shared navigation header (B-075) — one bar for every full screen: a leading
// slot (back ‹ / close ✕ / none), a centered title, and a trailing slot
// (overflow ⋯ menu, or an arbitrary node). Replaces the six hand-rolled headers
// the app grew. The leading action is ALWAYS caller-controlled (onLeadingPress)
// — never a hardcoded router.back(), because some screens (log's multi-step
// flow, food-capture) need back to mean "previous step", not "pop the screen".
// This is NOT the Home identity strip (HomeHeader) — that's the top-level-tab
// variant; this is the back/title/overflow bar for pushed + modal screens.

type LeadingKind = 'back' | 'close' | 'none';

interface HeaderProps {
  title?: string;
  leading?: LeadingKind;
  onLeadingPress?: () => void;
  // When provided, renders the standard ⋯ button wired to this handler
  // (typically opening showOverflowMenu). Ignored if `right` is given.
  onOverflow?: () => void;
  // Arbitrary trailing content (e.g. a "Save" text button) — overrides ⋯.
  right?: ReactNode;
}

// 24–26px glyphs + 12pt hitSlop ⇒ ~48–50pt tap target, clears the 44pt
// 3am-stumbling minimum without inflating the visual size.
const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

export function Header({
  title,
  leading = 'none',
  onLeadingPress,
  onOverflow,
  right,
}: HeaderProps) {
  return (
    <View style={styles.bar}>
      <View style={styles.side}>
        {leading !== 'none' ? (
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

      <View style={[styles.side, styles.sideRight]}>
        {right ??
          (onOverflow ? (
            <TouchableOpacity
              onPress={onOverflow}
              hitSlop={HIT}
              accessibilityRole="button"
              accessibilityLabel="More options"
            >
              <MoreHorizontal size={24} color={theme.colorTextSecondary} />
            </TouchableOpacity>
          ) : null)}
      </View>
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
