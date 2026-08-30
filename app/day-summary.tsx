// The Daily Recap screen (B-762 / CUL-23, DR-1 — see docs/nyx-daily-recap-
// requirements.md §2). The night-register surface the 9pm notification opens.
//
// It answers exactly ONE question — "what happened in {pet}'s record today" — as a
// TIMELINE: the day spine (the event list rendered as a thread of doorways), led by a
// count-anchored serif line, count chips, and — for a single-pet account — the trial
// and med course strips + a forward line. Everything on it is a RECORD FACT or a
// DOORWAY (R-3): no AI, no verdict, no score, no severity, no reassurance, and no
// write path (this screen has no FAB and the strips carry no one-tap confirm).
//
// ALWAYS-NIGHT (R-1). No time-of-day branching — the recap reads on the brand night
// ground whenever it is opened. The status bar flips to light while the screen is
// focused and restores on blur (the paywall pattern), so a dark ground never strands
// dark status-bar glyphs.
//
// The zero-log day is a DESIGNED state (Principle 5) and its copy is G2-bound — a
// record fact, never an all-clear over the pet. A failed read renders an error +
// retry, NEVER a false "nothing logged".
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { UtensilsCrossed, Pill } from 'lucide-react-native';
import { theme } from '../constants/theme';
import { Header } from '../components/ui';
import { WhorlSpinner } from '../components/brand/WhorlSpinner';
import { DaySpine } from '../components/recap/DaySpine';
import { CountChips } from '../components/recap/CountChips';
import { RecapStrip } from '../components/recap/RecapStrip';
import { DailyRecapOffer } from '../components/recap/DailyRecapOffer';
import { NotificationPrimer } from '../components/notifications/NotificationPrimer';
import { useDaySummary } from '../hooks/useDaySummary';
import { useDailyRecapOffer } from '../hooks/useDailyRecapOffer';
import { isNotificationArrival } from '../lib/dailyRecapOffer';
import { profileFocusHref } from '../lib/profileFocus';
import { useSyncStore } from '../store/syncStore';
import {
  DAY_SUMMARY_ZERO_LOG,
  daySummaryEmptyTitle,
  petZeroLogLine,
  type DaySummaryModel,
  type DaySummarySection,
} from '../lib/daySummary';
import { ThemedText } from '../components/ui/ThemedText';

function dayLabel(anchorMs: number): string {
  // "Saturday, August 15" — names the RENDERED day (B-672). The screen anchors to the
  // notification's fired-for day, so this reads that instant, not the wall clock.
  return new Date(anchorMs).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/** Parse the `firedAt` tap param — the notification's fire instant (ms, already
 *  normalized). Absent/garbage → null → the hook renders today (the pre-B-672
 *  default). */
function parseFiredAt(raw: string | string[] | undefined): number | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (typeof s !== 'string') return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function DaySummaryScreen() {
  // B-672: a tapped 9pm notification carries the instant it FIRED as `firedAt` (ms),
  // so the screen anchors "today" to the fired-for day instead of the wall clock.
  const { firedAt, source } = useLocalSearchParams<{ firedAt?: string; source?: string }>();
  const state = useDaySummary(parseFiredAt(firedAt));

  // The in-context offer (DR-3, §4): shown ONLY on an IN-APP arrival. A notification
  // tap carries `source: 'notification'` (and usually `firedAt`), which the offer
  // must never pitch over — so classify the arrival and hand it to the hook, which
  // owns the eligibility read, the primer, and the primer-gated enable flow.
  const offer = useDailyRecapOffer({
    arrival: isNotificationArrival({ firedAt, source }) ? 'notification' : 'in_app',
  });

  // Light status-bar glyphs while this dark screen is focused; restore on blur so no
  // light glyphs strand on the next light screen (the onboarding-paywall pattern).
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('auto');
    }, []),
  );

  // Cold-start from a notification tap can push this onto a fresh stack with nothing
  // behind it — fall back to Home rather than a dead back button.
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, []);

  // The hook re-reads on every hydration tick; bumping it is the retry.
  const retry = useCallback(() => {
    useSyncStore.getState().bumpHydrationTick();
  }, []);

  // The zero-log CTA + the strips' doorways. This screen has NO FAB, so the empty
  // state's own invitation needs a door (the quick-log), and the strips door to the
  // Pet tab's cards (which own every trial/med reading) — the same targets the Home
  // strips use. None of these is the §4.2 "second door": the recap writes nothing.
  const logEvent = useCallback(() => router.push('/log'), []);
  // CUL-170 — each strip opens ON its own card, not at the top of the Pet tab.
  // Same doorway the Home strips use, from the same builder, so the two surfaces
  // cannot drift into naming different targets for the same strip.
  const openTrial = useCallback(
    () => router.push(profileFocusHref({ focus: 'trial', nowMs: Date.now() })),
    [],
  );
  const openMed = useCallback(
    (medKey: string) =>
      router.push(profileFocusHref({ focus: 'medications', medKey, nowMs: Date.now() })),
    [],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Today" leading="back" night onLeadingPress={goBack} />

      {state.status === 'loading' ? (
        <View style={styles.centre}>
          <WhorlSpinner size="md" ground="night" />
        </View>
      ) : state.status === 'error' ? (
        // A failed read is NEVER rendered as "nothing logged" — that reads as a false
        // all-clear (clinical-guardrails). Offer a retry.
        <NightError onRetry={retry} />
      ) : state.model.isEmpty ? (
        // Whole-screen (or single-pet) zero-log — a designed feature (Principle 5).
        <NightEmpty
          // Name the pet on a single-pet account (Pattern 1); stay neutral for a
          // no-pet or multi-pet-all-empty account, which can't pick one name.
          title={daySummaryEmptyTitle(
            state.model.petCount === 1 ? state.model.sections[0]?.petName : null,
          )}
          onLog={logEvent}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <ThemedText style={styles.dateLabel}>{dayLabel(state.anchorMs)}</ThemedText>
          {state.model.petCount === 1 ? (
            <SinglePetRecap model={state.model} onOpenTrial={openTrial} onOpenMed={openMed} />
          ) : (
            // Multi-pet: one screen, sectioned per pet, active first — plain per-pet
            // spines (the lead/chips/strips are the single-pet experience, mock §2).
            state.model.sections.map((section) => (
              <PetSpineSection key={section.petId} section={section} />
            ))
          )}

          {/* The in-context offer (§4), at the foot of the day where the value is
              visible. Renders only in the ready-with-content states — never over the
              designed zero-log/error states, and never on a notification-tap arrival
              (the hook gates all of that). */}
          {offer.show ? (
            <DailyRecapOffer onTurnOn={offer.onTurnOn} onNotNow={offer.onNotNow} />
          ) : null}
        </ScrollView>
      )}

      {/* Primer-gated, always (§4): the banner's "Turn on" opens THIS, never the OS
          prompt directly. Reads its copy from the daily_summary registry descriptor
          (DR-4), warmed with the single pet's name. */}
      <NotificationPrimer
        visible={offer.primerVisible}
        petName={offer.primerPetName}
        onConfirm={offer.onPrimerConfirm}
        onDismiss={offer.onPrimerDismiss}
        requesting={offer.requesting}
      />
    </SafeAreaView>
  );
}

/** The single-pet rich recap (mock §2, frames 1–2): lead → chips → spine → trial
 *  strip → med strips → forward line. Each rich block renders only when its model is
 *  present. */
function SinglePetRecap({
  model,
  onOpenTrial,
  onOpenMed,
}: {
  model: DaySummaryModel;
  onOpenTrial: () => void;
  /** Takes the tapped strip's key so the Pet tab can land on THAT med's row. */
  onOpenMed: (medKey: string) => void;
}) {
  const section = model.sections[0];
  return (
    <View style={styles.recap}>
      {model.lead ? <Text style={styles.lead}>{model.lead}</Text> : null}
      <CountChips chips={model.chips} />
      <DaySpine rows={section.rows} />

      {model.trialStrip ? (
        <RecapStrip
          glyph={UtensilsCrossed}
          tint={theme.colorAccent}
          title={model.trialStrip.title}
          fact={model.trialStrip.fact}
          onPress={onOpenTrial}
          accessibilityLabel={`${model.trialStrip.title}. ${model.trialStrip.fact}. Open the diet trial.`}
        />
      ) : null}

      {model.medStrips.map((med) => (
        <RecapStrip
          key={med.key}
          glyph={Pill}
          tint={theme.colorEventMedicationOnNight}
          title={med.title}
          fact={med.fact}
          isConcern={med.isConcern}
          onPress={() => onOpenMed(med.key)}
          accessibilityLabel={`${med.title}${med.fact ? `. ${med.fact}` : ''}. Open medications.`}
        />
      ))}

      {model.forward ? <ThemedText style={styles.forward}>{model.forward}</ThemedText> : null}
    </View>
  );
}

/** One pet's section on a multi-pet summary: a heading + its spine, or the per-pet
 *  zero-log line (same G2 register — a record fact about this pet's day). */
function PetSpineSection({ section }: { section: DaySummarySection }) {
  return (
    <View style={styles.petSection}>
      <ThemedText style={styles.petHeading}>{section.petName}</ThemedText>
      {section.isZeroLog ? (
        <ThemedText style={styles.petZeroLog}>{petZeroLogLine(section.petName)}</ThemedText>
      ) : (
        <DaySpine rows={section.rows} />
      )}
    </View>
  );
}

/** The night zero-log state (mock §2, frame 3). Serif title in moonlight, muted body,
 *  a low-emphasis accent link (never a filled button) as the screen's only door. */
function NightEmpty({ title, onLog }: { title: string; onLog: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <ThemedText style={styles.emptyBody}>{DAY_SUMMARY_ZERO_LOG.body}</ThemedText>
      <Pressable onPress={onLog} accessibilityRole="button" hitSlop={8} style={styles.emptyCtaWrap}>
        <ThemedText style={styles.emptyCta}>{DAY_SUMMARY_ZERO_LOG.cta}</ThemedText>
      </Pressable>
    </View>
  );
}

/** The night error state — a message + a retry, never a false "nothing logged". */
function NightError({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.errorBox}>
      <ThemedText style={styles.errorTitle}>Couldn’t load today’s record</ThemedText>
      <ThemedText style={styles.errorBody}>Check your connection and try again.</ThemedText>
      <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={8} style={styles.retryWrap}>
        <ThemedText style={styles.retry}>Try again</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorBrandNight },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: theme.space3, gap: theme.space3, paddingBottom: theme.space6 },

  dateLabel: {
    fontSize: theme.textXS,
    color: theme.colorTextOnNightMuted,
    fontWeight: theme.weightSemibold,
  },

  // The single-pet rich stack. Its own gap is tighter than the scroll's section gap,
  // so the lead/chips/spine/strips read as one composed screen.
  recap: { gap: theme.space2 },
  // C0 — the serif lead, in moonlight (the night display colour, 15.8:1).
  lead: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textLG,
    lineHeight: theme.lineHeightBody,
    color: theme.colorMoonlight,
    letterSpacing: theme.trackingTight,
  },
  // C5 — the closing forward line.
  forward: {
    fontSize: theme.textSM,
    color: theme.colorTextOnNightMuted,
  },

  petSection: { gap: theme.space2 },
  petHeading: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextOnNight,
  },
  petZeroLog: {
    fontSize: theme.textSM,
    color: theme.colorTextOnNightMuted,
    lineHeight: theme.lineHeightSM,
  },

  // Zero-log (align="fill" — vertically centred, the mock's `.night-empty`).
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space4,
    gap: theme.space0_5 + theme.spaceMicro, // 6
  },
  emptyTitle: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textLG,
    color: theme.colorMoonlight,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: theme.textSM,
    color: theme.colorTextOnNightMuted,
    lineHeight: theme.lineHeightBody,
    textAlign: 'center',
  },
  emptyCtaWrap: {
    marginTop: theme.space0_5,
    minHeight: 44,
    justifyContent: 'center',
  },
  // Accent text link, never a filled button — it invites, it doesn't demand (G2: it
  // opens a door, it does not say a log was owed).
  emptyCta: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    // accent-on-dark-ok: colorBrandNight (container, :258) — 8.09:1. Night ground:
    // its siblings take colorTextOnNight*, and the ink would be 3.54:1 (CUL-744).
    color: theme.colorAccent,
  },

  errorBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space1,
    paddingHorizontal: theme.space4,
  },
  errorTitle: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextOnNight,
    textAlign: 'center',
  },
  errorBody: {
    fontSize: theme.textSM,
    color: theme.colorTextOnNightMuted,
    textAlign: 'center',
    marginBottom: theme.space1,
  },
  retryWrap: { minHeight: 44, justifyContent: 'center' },
  retry: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    // accent-on-dark-ok: colorBrandNight (container, :258) — 8.09:1, as emptyCta above.
    color: theme.colorAccent,
  },
});
