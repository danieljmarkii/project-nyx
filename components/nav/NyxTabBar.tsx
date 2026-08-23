import { View, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { PetAvatar } from '../pet/PetAvatar';
import { usePetStore } from '../../store/petStore';
import { type Glyph } from '../glyphs/GlyphSvg';
import { HomeGlyph, HistoryGlyph, FoodsGlyph } from './navGlyphs';
import {
  petTabAccessibilityLabel,
  resolvePetTabLabel,
  tabLabelBudget,
  TAB_LABEL_SIDE_PADDING,
} from '../../lib/petTabLabel';

// The tab bar (CUL-599; app-polish spec §1 DP-1, rulings D1 + D2).
//
// It replaced four grey words — text-as-icon, chosen by the original comment to
// dodge a clipping issue in the default Expo tab container, with a colour swap as
// the only active state. That is the most-seen chrome in the app, so the ruling gave
// it a face: house-line glyphs + labels, and the Pet tab IS the pet — their avatar
// and their name, which in a multi-pet household also answers Sam's "whose data am
// I looking at" for free, in the chrome, at all times.
//
// Owning the whole bar (rather than configuring Expo's) is inherited, not new: the
// clipping constraint that forced it still holds. What is new is that the bar lives
// here instead of inside app/(tabs)/_layout.tsx, so the ladder's rungs and the a11y
// contract are pinned by tests rather than by whoever last looked at a phone.
//
// No flag: chrome replaced outright (spec §8 — the beta two-gate ceremony is for
// features with a server cost or a reversible surface, not for the nav bar).

/**
 * The structural shape of what expo-router hands a custom `tabBar`. Declared here
 * rather than imported from react-navigation so this file renders in a test with a
 * plain object — the alternative is a navigation container per assertion.
 */
export interface TabBarProps {
  state: {
    routes: { key: string; name: string }[];
    index: number;
  };
  descriptors: Record<
    string,
    {
      options: { title?: string; tabBarAccessibilityLabel?: string };
    }
  >;
  navigation: {
    emit: (event: { type: string; target: string; canPreventDefault: boolean }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: string) => void;
  };
}

/**
 * Route → glyph. The Pet tab is deliberately absent: it renders the pet, not a
 * glyph, so `undefined` here is the signal to take the avatar branch rather than a
 * gap to fill. A route with no entry falls back to label-only — a new tab should
 * look unfinished, never crash the bar.
 */
const ROUTE_GLYPHS: Record<string, Glyph> = {
  index: HomeGlyph,
  history: HistoryGlyph,
  foods: FoodsGlyph,
};

/** The route whose label is the pet's name (spec §1: "Pet tab = PetAvatar mini"). */
export const PET_ROUTE_NAME = 'profile';

// The icon slot is a fixed height that BOTH branches centre inside, so the glyph
// tabs and the avatar tab put their labels on the same baseline. The avatar's ring
// is drawn as a border on a slot-sized box (RN has no outset shadow), which is why
// the avatar is the slot minus two ring widths: ringed and unringed occupy exactly
// the same space, and the bar cannot shift as you navigate.
const ICON_SLOT = 26;
const GLYPH_SIZE = 22;
const RING_WIDTH = 2;
const AVATAR_SIZE = ICON_SLOT - RING_WIDTH * 2;

// The 4pt teal tick under the active tab. Always laid out, tinted only when
// focused — the same no-shift reasoning as the ring.
const TICK_SIZE = theme.space0_5;

// An explicit label leading, not RN's font-derived default. Load-bearing for the
// ladder: the pet tab's label changes SIZE between rungs, and a size-derived line
// box would change the row's height with it, walking the tick up and down as you
// switch pets. Fixed leading makes every rung the same height.
const LABEL_LINE_HEIGHT = 14;
const GLYPH_LABEL_GAP = 3;
const LABEL_TICK_GAP = 2;

// Derived, not asserted: the bar must be tall enough to hold what it draws, and a
// stated total is a number that goes stale the first time a part moves. The bar it
// replaces held 46pt of content (one 13pt label); this holds 49, so the bar grew —
// the bottom padding is untouched, being the home-indicator allowance, not content.
const TAB_CONTENT_HEIGHT =
  ICON_SLOT + GLYPH_LABEL_GAP + LABEL_LINE_HEIGHT + LABEL_TICK_GAP + TICK_SIZE;
const TAB_TOP_PAD = theme.space1;
const TAB_BOTTOM_PAD = Platform.OS === 'ios' ? theme.space3 : theme.space1;

/**
 * The bar's total height, INCLUDING the home-indicator allowance.
 *
 * Exported because three surfaces have to clear this bar — the meal and medication
 * completion cards and the Snackbar — and each of them used to carry its own
 * `Platform.OS === 'ios' ? 80 : 60`, commented "tab bar height from
 * app/(tabs)/_layout.tsx". That was already a copy of a copy; changing the bar here
 * made all three silently wrong at once, which is the same staleness the derivation
 * above exists to prevent, one file out. One definition, four consumers.
 */
export const TAB_HEIGHT = TAB_CONTENT_HEIGHT + TAB_TOP_PAD + TAB_BOTTOM_PAD;

export function NyxTabBar({ state, descriptors, navigation }: TabBarProps) {
  // Subscribed, not read once: switching pets must re-title the tab, and the
  // selector keeps that to the two fields the bar actually draws.
  const petName = usePetStore((s) => s.activePet?.name ?? null);
  const petPhotoPath = usePetStore((s) => s.activePet?.photo_path ?? null);

  // The ladder is a function of the tab's width, and the tab's width is the window
  // split between the routes — so it re-resolves on rotation and on a foldable,
  // rather than baking in the width the app happened to launch at.
  const { width } = useWindowDimensions();
  const labelBudget = tabLabelBudget(width, state.routes.length);
  const petLabel = resolvePetTabLabel(petName, labelBudget);

  return (
    <View style={styles.tabBar}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const isPetTab = route.name === PET_ROUTE_NAME;
        const Icon = ROUTE_GLYPHS[route.name];
        const tint = isFocused ? theme.colorNeutralDark : theme.colorTextTertiary;

        // The pet tab's label is the pet; every other tab keeps its route title.
        // A pet tab with no pet loaded yet still renders its configured title
        // ("Pet"), so the bar is never mid-boot with a blank slot.
        const label = isPetTab ? petLabel.text : options.title ?? route.name;
        const labelSize = isPetTab ? petLabel.fontSize : theme.textXS;

        // The full name rides the a11y label at EVERY rung — the half of the
        // ladder that makes falling back to "Pet" acceptable. VoiceOver never says
        // "Pet" when the pet is Schrodingers Cat.
        const accessibilityLabel = isPetTab
          ? petTabAccessibilityLabel(petName)
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
            <View style={styles.iconSlot}>
              {isPetTab ? (
                <View style={[styles.avatarRing, isFocused && styles.avatarRingActive]}>
                  <PetAvatar name={petName ?? label} photoPath={petPhotoPath} size={AVATAR_SIZE} />
                </View>
              ) : (
                Icon && <Icon size={GLYPH_SIZE} color={tint} strokeWidth={1.75} />
              )}
            </View>
            <ThemedText
              style={[
                styles.tabLabel,
                { fontSize: labelSize, color: tint },
                isFocused && styles.tabLabelActive,
              ]}
              // Belt and braces to the ladder: the ladder is what KEEPS a name
              // whole, and this is what guarantees a mis-estimate can only cost a
              // tail, never a second line that pushes the tick out of the bar.
              numberOfLines={1}
              // Spec §1: tab labels stay fixed-size under Dynamic Type — the
              // platform tab-bar convention, and the assumption the ladder rests
              // on (it measures against a known font size; a scaled label would
              // overflow the tab the ladder just fitted it to). The pet's name is
              // reachable at full size on the Pet tab and in the switcher sheet,
              // and VoiceOver speaks it from the label above at any setting.
              allowFontScaling={false}
            >
              {label}
            </ThemedText>
            <View style={[styles.tick, isFocused && styles.tickActive]} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.colorSurface,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    height: TAB_HEIGHT,
    paddingBottom: TAB_BOTTOM_PAD,
    paddingTop: TAB_TOP_PAD,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // The same 6pt the ladder's budget subtracts. It was missing here while the
    // budget assumed it, which meant the arithmetic was protected by a padding that
    // did not exist — two errors pointing opposite ways, not a working system. The
    // touchable still spans the full tab, so the 44pt tap floor is untouched.
    paddingHorizontal: TAB_LABEL_SIDE_PADDING,
  },
  iconSlot: {
    height: ICON_SLOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    width: ICON_SLOT,
    height: ICON_SLOT,
    borderRadius: theme.radiusFull,
    borderWidth: RING_WIDTH,
    // Transparent, not absent: the ring occupies its space in every state so the
    // avatar does not jump a pixel when the tab takes focus.
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarRingActive: {
    borderColor: theme.colorAccent,
  },
  tabLabel: {
    fontWeight: theme.weightMedium,
    lineHeight: LABEL_LINE_HEIGHT,
    letterSpacing: theme.trackingWide,
    marginTop: GLYPH_LABEL_GAP,
  },
  tabLabelActive: {
    fontWeight: theme.weightSemibold,
  },
  tick: {
    width: TICK_SIZE,
    height: TICK_SIZE,
    borderRadius: TICK_SIZE / 2,
    backgroundColor: 'transparent',
    marginTop: LABEL_TICK_GAP,
  },
  tickActive: {
    backgroundColor: theme.colorAccent,
  },
});
