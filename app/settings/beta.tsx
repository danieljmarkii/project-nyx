import { ComponentType } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { FlaskConical, LayoutGrid, Plus } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { Card, Header } from '../../components/ui';
import { useAllowlistFlag } from '../../hooks/useAppConfig';
import {
  BETA_REGISTRY,
  useBetaOptIn,
  useBetaOptInStore,
  type BetaFeature,
} from '../../lib/betaFeatures';
import type { AllowlistFlagKey } from '../../lib/appConfig';

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
      // useful exactly once, in the on state.
      return {
        Icon: LayoutGrid,
        onHint:
          'It’s on. To add it, touch and hold your home screen, tap +, then search for Culprit.',
      };
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
              <Text style={styles.pillText}>Beta</Text>
            </View>
          </View>
        </View>
        <Switch
          value={optedIn}
          onValueChange={(next) => setOptIn(feature.key, next)}
          trackColor={{ true: theme.colorAccent, false: theme.colorBorderStrong }}
          ios_backgroundColor={theme.colorBorderStrong}
          accessibilityLabel={feature.title}
        />
      </View>

      <Text style={styles.blurb}>{feature.blurb}</Text>

      {/* On-state instructional hint — the one moment the instruction is useful.
          Off state shows nothing (no dead affordance, Principle 5). */}
      {optedIn && onHint ? (
        <View style={styles.hint}>
          <Plus size={15} color={theme.colorAccentInk} strokeWidth={2} />
          <Text style={styles.hintText}>{onHint}</Text>
        </View>
      ) : null}
    </Card>
  );
}

export default function BetaFeaturesScreen() {
  function handleBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Beta features" leading="back" onLeadingPress={handleBack} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* State-independent framing (like the Notifications intro): names the deal
            — unfinished, opt-in, reversible — without asserting a current count that
            would read false the moment a beta is toggled. */}
        <Text style={styles.intro}>
          Features we’re still working on. Switch one on to try it early — you can switch it back
          off whenever you like.
        </Text>

        {/* One card per registry entry; each self-gates on eligibility. The set of
            children is stable (BETA_REGISTRY is a fixed module constant), so the
            per-card hook calls keep a stable order across renders. */}
        {BETA_REGISTRY.map((feature) => (
          <BetaFeatureCard key={feature.key} feature={feature} />
        ))}

        {/* The honesty line (D8 — no telemetry, records untouched). Warm, plain,
            reversible; the reason the opt-in is safe to try. */}
        <Text style={styles.note}>
          Beta features may change, or be switched off while we keep working on them. Turning one on
          won’t affect your records.
        </Text>

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

  bottomPad: {
    height: theme.space4,
  },
});
