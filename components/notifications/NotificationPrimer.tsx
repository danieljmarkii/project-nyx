import {
  Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme, shadows } from '../../constants/theme';
import { PrimaryButton } from '../ui';
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationPrimerNode,
} from '../../lib/notifications';

// The pre-permission primer (daily-recap DR-4, spec §5 — the full-screen c2
// rebuild of B-661 PR 3's bottom sheet). We get ONE system permission prompt per
// install, so it is never fired at launch, at onboarding, or unprompted — only
// between an explicit owner intent (the settings toggle, the in-context offer, a
// future category) and the OS dialog. This screen is that step: the timeline
// miniature carries the whole pitch, one body sentence carries the cadence and the
// one-shot honesty, and that is the whole screen.
//
// DECLINING SPENDS NOTHING (§5, AC 5). "Not now" and the Android back button both
// call onDismiss only — the screen never reaches ensurePermission(request=true),
// so the one prompt is preserved for a later, more considered yes.
//
// SAFETY (clinical-guardrails G4 — the D7 lineage): the copy is strictly
// RETROSPECTIVE — a look back at what the owner already logged (the hero shows
// COMPLETED events; the body says "the day's record is ready to read"). It implies
// no medication reminder, armed or otherwise. Part 1 ships no reminder; nothing
// here may read like one.
//
// COPY LIVES IN THE REGISTRY (§5): every string is read from the category's primer
// descriptor (lib/notifications.ts), so the component is copy-free and a future
// category ships its pitch by adding a descriptor, not by branching this file.
//
// GROUND: the screen is the daylight neutral; only the HERO card is the night
// miniature — a faithful preview of the (night-register) Daily Recap the owner is
// turning on. DR-1 owns the real, data-driven day spine; this is a static, generic
// preview of it, sharing the same night tints.

// Night-ground dot tint per node kind. The med tint is the DR-4-minted night
// sibling (colorEventMedicationOnNight); meal/symptom reuse the shipped night event
// tints. Kept here (not in the descriptor) so the registry stays theme-free.
const NODE_DOT_COLOR: Record<NotificationPrimerNode['kind'], string> = {
  meal: theme.colorEventMeal,
  medication: theme.colorEventMedicationOnNight,
  symptom: theme.colorEventSymptomOnNight,
};

interface NotificationPrimerProps {
  visible: boolean;
  /** Which category's primer copy to render. Defaults to the one v1 category, so
   *  the existing caller (the settings toggle) needs no change; a future category
   *  passes its own id and gets its own pitch from the registry descriptor. */
  category?: NotificationCategory;
  /** The single pet's name for the warmer hero lead; null on a multi-pet or
   *  nameless account, where the lead stays neutral (D3 — one notification per
   *  account across all pets). */
  petName?: string | null;
  /** "Turn on" — the screen then fires the OS permission request. */
  onConfirm: () => void;
  /** "Not now" / Android back — dismiss without spending the prompt. */
  onDismiss: () => void;
  /** True while the OS permission request is in flight, so the CTA reads as
   *  working rather than dead. */
  requesting?: boolean;
}

export function NotificationPrimer({
  visible,
  category = 'daily_summary',
  petName,
  onConfirm,
  onDismiss,
  requesting = false,
}: NotificationPrimerProps) {
  const insets = useSafeAreaInsets();
  const primer = NOTIFICATION_CATEGORIES[category].primer;
  const nodes = primer.miniSpine;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      // Android hardware back = decline; spends nothing, same as "Not now" (§5).
      onRequestClose={onDismiss}
    >
      <View style={styles.screen}>
        {/* A ScrollView, not a plain View: the CTAs are pinned to the bottom by the
            flex spacer at normal sizes (contentContainerStyle grows to fill), but at
            the largest Dynamic Type — or a future category with longer copy — the
            content scrolls instead of pushing "Not now" past the bottom edge. A
            consent screen must never make declining unreachable. */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: insets.top + theme.space3,
              paddingBottom: insets.bottom + theme.space2,
            },
          ]}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Hero: the night miniature. A generic warm day — never the owner's
              data — so the primer renders before a single log exists. */}
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>{primer.heroLabel}</Text>
            <Text style={styles.heroLead}>{primer.heroLead(petName ?? null)}</Text>

            <View style={styles.spine}>
              {nodes.map((node, i) => {
                const isFirst = i === 0;
                const isLast = i === nodes.length - 1;
                return (
                  <View key={`${node.title}-${i}`} style={styles.spineRow}>
                    {/* The connecting thread: two half-height segments per node
                        (omitted at the ends), so the line runs dot-centre to
                        dot-centre and the card-bordered dots punch through it. */}
                    <View style={styles.nodeCol}>
                      {!isFirst && <View style={styles.segTop} />}
                      {!isLast && <View style={styles.segBottom} />}
                      <View
                        style={[styles.dot, { backgroundColor: NODE_DOT_COLOR[node.kind] }]}
                      />
                    </View>
                    <Text style={styles.nodeTitle} numberOfLines={1}>
                      {node.title}
                      {/* geist-ok: nested span — differs from its parent only in colour, so it must stay a
                          raw <Text> and inherit the parent's resolved Geist face. A ThemedText here injects its
                          own family and breaks RN's native text cascade, shipping a face change mid-sentence
                          (CUL-607). */}
                      {node.detail ? (
                        <Text style={styles.nodeDetail}> · {node.detail}</Text>
                      ) : null}
                    </Text>
                    <Text style={styles.nodeTime}>{node.time}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          <Text style={styles.headline}>{primer.headline}</Text>
          <Text style={styles.body}>{primer.body}</Text>

          <View style={styles.spacer} />

          <PrimaryButton label="Turn on" onPress={onConfirm} loading={requesting} />
          <TouchableOpacity
            onPress={onDismiss}
            disabled={requesting}
            activeOpacity={0.7}
            accessibilityRole="button"
            style={styles.notNowWrap}
          >
            <Text style={styles.notNow}>Not now</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const DOT_SIZE = 12;
const NODE_COL_WIDTH = 16;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  scroll: {
    flex: 1,
  },
  // contentContainerStyle: flexGrow (not flex) so it fills the viewport when the
  // content is short — the spacer then pins the CTAs to the bottom — and grows past
  // it (scrolling) when the content is tall.
  content: {
    flexGrow: 1,
    paddingHorizontal: theme.space3,
  },

  // ── Hero: the night miniature of the recap ──
  hero: {
    backgroundColor: theme.colorBrandNight,
    borderRadius: theme.radiusMedium,
    padding: theme.space2,
    marginTop: theme.space2,
    // A soft lift so the night miniature reads as floating on the daylight ground.
    ...shadows.md,
  },
  heroLabel: {
    fontSize: theme.textXS,
    fontFamily: theme.fontBodySemibold,
    // The decorative night-eyebrow teal — NOT the interactive colorAccent (the
    // accent rule reserves that for tappable/live elements).
    color: theme.colorMoonlitTeal,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWidest,
    marginBottom: theme.space1,
  },
  heroLead: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textMD,
    color: theme.colorMoonlight,
    marginBottom: theme.space1,
  },

  // The mini-spine — dots on a connecting thread. A static preview of the day
  // spine; DR-1 owns the real, data-driven component.
  spine: {
    marginTop: theme.space0_5,
  },
  spineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 30,
    gap: theme.space1,
  },
  nodeCol: {
    width: NODE_COL_WIDTH,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: theme.radiusFull,
    borderWidth: 2.5,
    // The dot's border is the card ground, so it "punches through" the thread it
    // sits on rather than being crossed by it.
    borderColor: theme.colorBrandNight,
    zIndex: 1,
  },
  segTop: {
    position: 'absolute',
    top: 0,
    left: (NODE_COL_WIDTH - 2) / 2,
    height: '50%',
    width: 2,
    backgroundColor: theme.colorBorderOnNight,
  },
  segBottom: {
    position: 'absolute',
    bottom: 0,
    left: (NODE_COL_WIDTH - 2) / 2,
    height: '50%',
    width: 2,
    backgroundColor: theme.colorBorderOnNight,
  },
  nodeTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextOnNight,
  },
  nodeDetail: {
    color: theme.colorTextOnNightMuted,
  },
  nodeTime: {
    fontFamily: theme.fontBody,
    fontSize: theme.textXS,
    color: theme.colorTextOnNightMuted,
    marginLeft: theme.space1,
  },

  // ── The pitch, on the daylight ground ──
  headline: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textXL,
    color: theme.colorTextPrimary,
    marginTop: theme.space3,
    marginBottom: theme.space1,
  },
  body: {
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },

  // Pushes the CTAs to the bottom; the minHeight keeps a gap on short screens.
  spacer: {
    flex: 1,
    minHeight: theme.space3,
  },

  notNowWrap: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.space1,
  },
  notNow: {
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
});
