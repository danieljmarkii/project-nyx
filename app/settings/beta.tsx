import { ComponentType } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { FlaskConical, Info, LayoutGrid, Shapes, SquarePen } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { Card, Header } from '../../components/ui';
import { useAllowlistFlag } from '../../hooks/useAppConfig';
import { useBetaShelf } from '../../hooks/useBetaShelf';
import {
  BETA_REGISTRY,
  useBetaOptIn,
  useBetaOptInStore,
  type BetaFeature,
} from '../../lib/betaFeatures';
import type { AllowlistFlagKey } from '../../lib/appConfig';
import { ThemedText } from '../../components/ui/ThemedText';

// Beta features — the self-serve shelf (B-712 PR 3, spec §5 / §2). A cohort-gated
// page where an eligible owner opts into unfinished features, one at a time. The
// widget is the only beta in v1.
//
// TWO GATES, NEVER CONFLATED (spec §2):
//   • Gate 1 — eligibility (server allowlist, resolved by useAllowlistFlag). Owned
//     by us; it decides whether a card is even shown. A non-eligible owner can't
//     reach this screen — the Settings row that pushes it is itself eligibility-
//     gated — but each card ALSO self-gates, so a deep link can't surface a beta
//     the account isn't in the cohort for.
//   • Gate 2 — opt-in (the local Switch, useBetaOptIn). Owned by the owner; default
//     off. Being eligible turns nothing on.
// Keeping the two apart is the whole reason the future Premium swap is one line
// (it moves Gate 1 only) — so this screen reads eligibility for VISIBILITY and the
// opt-in store for STATE, and never entangles them.
//
// The card is deliberately NOT a shared component: one screen renders it, so it
// lives here (spec "no new component" = nothing added to components/). One card =
// one registry entry = one flag + one toggle, so the shelf grows by adding a
// BETA_REGISTRY row, never by hand-coding a card.

type IconComponent = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

// Per-beta PRESENTATION (icon + the on-state hint) lives here, not in the registry:
// BETA_REGISTRY is UI-free data (so it unit-tests in plain jest and useWidgetSnapshots
// can read the opt-in without a screen's import graph). A `switch` with a default
// keeps any future key renderable without an exhaustiveness burden.
function presentationFor(key: AllowlistFlagKey): { Icon: IconComponent; onHint?: string } {
  switch (key) {
    case 'widget_enabled':
      // The hint only makes sense on the widget: iOS makes the OWNER add a widget
      // from the home screen — the app can't place it — so the instruction is
      // useful exactly once, in the on state. Framed conditionally ("if it isn’t on
      // your home screen yet") so it never reads as a to-do to an owner who has
      // already added it: the switch is on either way, and the steps are for the
      // owner who hasn’t placed it yet. Carried to a PLACED widget ("find Culprit and
      // add it"), not left at the gallery search, so a first-timer isn't stranded
      // (pm-feature-review, nyx-voice PR 4 pass).
      return {
        Icon: LayoutGrid,
        onHint:
          'It’s on. If it isn’t on your home screen yet, touch and hold an empty area, tap +, then find Culprit and add it.',
      };
    case 'log_picker_v2':
      // No on-state hint: the new log picker takes effect the moment it's on — the owner
      // reaches it by tapping the FAB, nothing to place or do (unlike the widget). A
      // distinct "log an entry" glyph helps it read apart from the widget (grid) card.
      return { Icon: SquarePen };
    case 'event_types_v2':
      // No on-state hint either: once the capture PRs land, the new types simply
      // appear in the log picker — nothing to place or do. A "kinds of things" glyph
      // (Shapes), distinct from the widget grid and the picker pen; deliberately not
      // a "+" mark, which reads as a tappable add-affordance on a non-interactive
      // tile (the pm-feature-review finding on the hint glyph).
      return { Icon: Shapes };
    default:
      return { Icon: FlaskConical };
  }
}

function BetaFeatureCard({ feature }: { feature: BetaFeature }) {
  const eligible = useAllowlistFlag(feature.key);
  const optedIn = useBetaOptIn(feature.key);
  const setOptIn = useBetaOptInStore((s) => s.setOptIn);

  // Gate 1: no card for a beta the account isn't in the cohort for (belt-and-braces
  // with the eligibility-gated Settings row that pushes this screen).
  if (!eligible) return null;

  const { Icon, onHint } = presentationFor(feature.key);

  return (
    <Card style={styles.betaCard}>
      <View style={styles.head}>
        <View style={styles.iconTile}>
          <Icon size={21} color={theme.colorAccentInk} strokeWidth={1.9} />
        </View>
        <View style={styles.headLead}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{feature.title}</Text>
            {/* The "Beta" pill — the calm on-brand mark register (IntakeBadge's
                positive tint), not a tappable chip. Sets expectations without
                over-promising: unfinished, may change. */}
            <View style={styles.pill} pointerEvents="none">
              <ThemedText style={styles.pillText}>Beta</ThemedText>
            </View>
          </View>
        </View>
        <Switch
          value={optedIn}
          onValueChange={(next) => setOptIn(feature.key, next)}
          trackColor={{ true: theme.colorAccent, false: theme.colorBorderStrong }}
          ios_backgroundColor={theme.colorBorderStrong}
          // Fold "beta" into the control's own label so a screen-reader user toggling
          // it hears "Home screen widget, beta" — the pill is a separate Text, and the
          // switch shouldn't rely on adjacency to say what kind of feature it gates.
          accessibilityLabel={`${feature.title}, beta`}
        />
      </View>

      <Text style={styles.blurb}>{feature.blurb}</Text>

      {/* On-state instructional hint — the one moment the instruction is useful.
          Off state shows nothing (no dead affordance, Principle 5). The leading glyph
          is an INFO mark, not a "+": a plus in an accent tile reads as a tappable
          "add" affordance on a row whose whole job is "go do this yourself", and this
          View is non-interactive (pm-feature-review). The "+" step stays in the text,
          where it names the real iOS button. */}
      {optedIn && onHint ? (
        <View style={styles.hint}>
          <Info size={15} color={theme.colorAccentInk} strokeWidth={2} />
          <Text style={styles.hintText}>{onHint}</Text>
        </View>
      ) : null}
    </Card>
  );
}

export default function BetaFeaturesScreen() {
  // B-729 — the same derivation the Settings row gates on (useBetaShelf), read here
  // to pick between the card list and the designed zero-card state, so the two
  // surfaces can never disagree. The per-card self-gates below stay (belt-and-braces
  // for a deep link); they read the same stores, so they agree with this by
  // construction.
  const { eligible } = useBetaShelf();

  function handleBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Beta features" leading="back" onLeadingPress={handleBack} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {eligible.length === 0 ? (
          /* B-729 — the designed zero-card state (Principle 5). Reachable when
             eligibility is lost while the screen is open or on a stale back-nav /
             deep link: every card self-gates away, and without this block the intro
             would promise an action ("switch one on") with nothing to act on. Not a
             loading state to skeleton over (CUL-575 doesn't bite): eligibility is
             config the app resolved to REACH this screen, so zero-eligible here is
             an answered read — the cohort genuinely no longer includes this
             account. Honest and forward-looking, promising nothing. */
          <View style={styles.emptyState}>
            <View style={styles.emptyIconTile}>
              <FlaskConical size={22} color={theme.colorTextTertiary} strokeWidth={1.9} />
            </View>
            <ThemedText style={styles.emptyTitle}>Nothing to try right now</ThemedText>
            <ThemedText style={styles.emptyBody}>
              Beta features come and go while we build. When there’s one ready for your account,
              you’ll find it here.
            </ThemedText>
          </View>
        ) : (
          <>
            {/* State-independent framing (like the Notifications intro): names the deal
                — unfinished, opt-in, reversible — without asserting a current count that
                would read false the moment a beta is toggled. */}
            <Text style={styles.intro}>
              Features we’re still working on. Switch one on to try it early — you can switch it
              back off whenever you like.
            </Text>

            {/* One card per registry entry; each self-gates on eligibility. The set of
                children is stable (BETA_REGISTRY is a fixed module constant), so the
                per-card hook calls keep a stable order across renders. */}
            {BETA_REGISTRY.map((feature) => (
              <BetaFeatureCard key={feature.key} feature={feature} />
            ))}

            {/* The honesty line (D8 — no telemetry, records untouched). Warm, plain,
                reversible; the reason the opt-in is safe to try. "pulled" (the locked
                round-1 mock's word), not "switched off" — the intro already owns "switch
                it back off" for the owner's own control, so reusing it here for OUR
                retraction would double-duty the same phrase (nyx-voice PR 4 pass). */}
            <Text style={styles.note}>
              Beta features may change or be pulled while we keep working on them. Turning one on
              won’t affect your records.
            </Text>
          </>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  scroll: {
    padding: theme.space3,
    gap: theme.space2,
  },

  intro: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightSM,
    paddingHorizontal: theme.space1,
  },

  // ── Beta card ──
  betaCard: {
    gap: theme.space2,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorAccentLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headLead: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    flexWrap: 'wrap',
  },
  title: {
    fontFamily: theme.fontBodySemibold,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  // The pill mirrors IntakeBadge's calm "positive" mark: accent-light fill + darkened
  // teal small-caps ink — a status tag, never a teal-outlined tappable chip.
  pill: {
    paddingHorizontal: theme.space1,
    paddingVertical: theme.spaceMicro,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorAccentLight,
  },
  pillText: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWide,
    color: theme.colorAccentInk,
  },
  blurb: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
  },

  // ── On-state hint ──
  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space1,
    backgroundColor: theme.colorAccentLight,
    borderRadius: theme.radiusSmall,
    padding: theme.space2,
  },
  hintText: {
    flex: 1,
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorAccentInk,
    lineHeight: theme.lineHeightSM,
  },

  note: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightSM,
    paddingHorizontal: theme.space1,
    marginTop: theme.space1,
  },

  // ── B-729 zero-card state ──
  // Centered, quiet block — the muted flask (this screen's own subject glyph) in a
  // neutral tile, never the accent tile the live cards use: nothing here is on or
  // actionable, so nothing should carry the active register.
  emptyState: {
    alignItems: 'center',
    gap: theme.space1,
    paddingVertical: theme.space4,
    paddingHorizontal: theme.space2,
  },
  emptyIconTile: {
    width: 40,
    height: 40,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorSurfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.space1,
  },
  emptyTitle: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
    textAlign: 'center',
  },

  bottomPad: {
    height: theme.space4,
  },
});
