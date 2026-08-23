import { useWindowDimensions, View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { PetAvatar } from '../pet/PetAvatar';
import { usePetStore } from '../../store/petStore';
import { resolvePetTabLabel, PET_TAB_FALLBACK_LABEL } from '../../lib/petTabLabel';
import { HomeGlyph, HistoryGlyph, FoodsGlyph, type TabGlyph } from './tabGlyphs';

// The tab bar (CUL-599; spec §1 / mock round 1 §01 option B+C, round 2 §01 for the
// ladder). It replaces four grey words — text-as-icon, chosen by the old comment to
// dodge a clipping issue, with a colour swap as the only active state — with glyphs
// on the house line, and makes the fourth tab the pet themself (D1).
//
// It lives here rather than inside app/(tabs)/_layout.tsx so it can be rendered in a
// test without standing up expo-router: the layout keeps routing and the recovery
// gate, this file keeps the bar.

// The routes that carry a drawn glyph. The Pet tab is deliberately absent — D1 ruled
// it IS the pet (avatar + name), so it has no glyph to look up.
const TAB_GLYPHS: Record<string, TabGlyph> = {
  index: HomeGlyph,
  history: HistoryGlyph,
  foods: FoodsGlyph,
};

const PET_ROUTE = 'profile';

export interface TabBarProps {
  state: {
    routes: { key: string; name: string }[];
    index: number;
  };
  descriptors: Record<string, {
    options: { title?: string; tabBarAccessibilityLabel?: string };
  }>;
  navigation: {
    emit: (event: { type: string; target: string; canPreventDefault: boolean }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
}

export function NyxTabBar({ state, descriptors, navigation }: TabBarProps) {
  // Subscribed, not read once: switching pets has to re-draw the fourth tab, which is
  // the free answer to Sam's "whose data am I looking at" that made D1 worth doing.
  const activePet = usePetStore((s) => s.activePet);

  // Tabs are flex:1 in a bar that spans the full window, so the window width divided
  // by the tab count IS the tab width — no layout pass, no first-paint settle, and it
  // re-resolves on rotation or an iPad split because the hook re-renders.
  const { width } = useWindowDimensions();
  const tabWidth = width / Math.max(state.routes.length, 1);

  // Resolved once per render, not once per tab — the ladder is a function of the pet
  // and the width, neither of which varies across the four routes.
  // A pet with no name, and the brief window before the store has loaded one, both
  // land on the generic word rather than an empty label.
  const petLabel = resolvePetTabLabel(activePet?.name ?? '', tabWidth);

  return (
    <View style={styles.tabBar}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const isPetTab = route.name === PET_ROUTE;
        const Glyph = TAB_GLYPHS[route.name];
        const tint = isFocused ? theme.colorTextPrimary : theme.colorTextTertiary;

        const label = isPetTab ? petLabel.text : options.title ?? route.name;

        // The full name ALWAYS rides the accessibility label, at every rung — the
        // ladder is a visual accommodation, and VoiceOver has no width to run out of.
        const accessibilityLabel = isPetTab
          ? activePet?.name
            ? `${activePet.name} — pet profile`
            : PET_TAB_FALLBACK_LABEL
          : options.tabBarAccessibilityLabel ?? label;

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.tab}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={accessibilityLabel}
          >
            <View style={styles.iconRow}>
              {isPetTab ? (
                // The ring is a border on a wrapper sized for it, transparent when
                // inactive, so the avatar never moves between states.
                <View style={[styles.avatarRing, isFocused && styles.avatarRingActive]}>
                  <PetAvatar
                    name={activePet?.name ?? PET_TAB_FALLBACK_LABEL}
                    photoPath={activePet?.photo_path ?? null}
                    size={TAB_AVATAR_SIZE}
                  />
                </View>
              ) : (
                Glyph && <Glyph size={TAB_GLYPH_SIZE} color={tint} strokeWidth={1.75} />
              )}
            </View>

            <ThemedText
              // Platform tab-bar convention: labels hold their size under Dynamic
              // Type. The ladder is the accommodation for a long name; letting the
              // system scale on top of it would put the row back in the clipping
              // business the ladder exists to end.
              allowFontScaling={false}
              numberOfLines={1}
              style={[
                styles.tabLabel,
                isFocused && styles.tabLabelActive,
                // A pet's name is a proper noun, not a tracked nav word — so it drops
                // the 0.4pt tracking the three fixed labels keep. That is also what
                // gives the ladder's load-bearing boundary (the real name vs. the word
                // "Pet") its headroom: at 320pt a fixed 0.4pt per character costs the
                // same 4.4pt at both rungs, which is most of what the 10pt rung has.
                isPetTab && { fontSize: petLabel.fontSize, letterSpacing: 0 },
              ]}
            >
              {label}
            </ThemedText>

            {/* Fixed footprint, tinted only when active, so selecting a tab never
                nudges the row above it. */}
            <View style={[styles.tick, isFocused && styles.tickActive]} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Geometry, derived rather than magic. The icon row is sized by its tallest occupant —
// the pet avatar plus its 2pt ring — so a glyph tab and the pet tab share one baseline.
const TAB_GLYPH_SIZE = 22;
const TAB_AVATAR_SIZE = 22;
const TAB_RING_WIDTH = 2;
const TAB_ICON_ROW = TAB_AVATAR_SIZE + TAB_RING_WIDTH * 2; // 26
const TAB_LABEL_LINE = 14;
const TAB_TICK_SIZE = 4;
const TAB_GAP = 2;

const TAB_CONTENT_HEIGHT = TAB_ICON_ROW + TAB_GAP + TAB_LABEL_LINE + TAB_GAP + TAB_TICK_SIZE; // 48
const TAB_TOP_PAD = 6;
// iOS reserves the home-indicator inset; Android just needs breathing room.
const TAB_BOTTOM_PAD = Platform.OS === 'ios' ? 24 : 8;
const TAB_BAR_HEIGHT = TAB_CONTENT_HEIGHT + TAB_TOP_PAD + TAB_BOTTOM_PAD; // 78 / 62

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.colorSurface,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    height: TAB_BAR_HEIGHT,
    paddingBottom: TAB_BOTTOM_PAD,
    paddingTop: TAB_TOP_PAD,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  iconRow: {
    height: TAB_ICON_ROW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    borderWidth: TAB_RING_WIDTH,
    borderColor: 'transparent',
    // RN borders are drawn inside the view's own box and the wrapper is sized by its
    // content, so the ring reads as an outer ring: 22pt avatar + 2pt each side = 26.
    borderRadius: theme.radiusFull,
  },
  avatarRingActive: {
    borderColor: theme.colorAccent,
  },
  tabLabel: {
    marginTop: TAB_GAP,
    fontSize: theme.textXS,
    lineHeight: TAB_LABEL_LINE,
    fontWeight: theme.weightMedium,
    color: theme.colorTextTertiary,
    letterSpacing: theme.trackingWide,
  },
  tabLabelActive: {
    color: theme.colorTextPrimary,
    fontWeight: theme.weightSemibold,
  },
  tick: {
    marginTop: TAB_GAP,
    width: TAB_TICK_SIZE,
    height: TAB_TICK_SIZE,
    borderRadius: TAB_TICK_SIZE / 2,
    backgroundColor: 'transparent',
  },
  tickActive: {
    backgroundColor: theme.colorAccent,
  },
});
