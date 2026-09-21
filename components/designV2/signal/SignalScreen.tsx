import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../../constants/theme';
import { useAppActive } from '../../../hooks/useAppActive';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { readLastEpisodeIso } from '../../../hooks/useLastEpisodeDates';
import { focusAccessibility } from '../../../lib/a11yFocus';
import { foldedEntry, readFoldEntries, writeFoldEntries, type RecordFacts } from '../../../lib/signalFold';
import { loadSignalScreen, type SignalScreenLoad, type SignalScreenModel } from '../../../lib/signalScreen';
import { WhorlSpinner } from '../../brand/WhorlSpinner';
import { CompareBars } from '../../charts/CompareBars';
import { TimingLanes } from '../../charts/TimingLanes';
import { WeeklyBars } from '../../charts/WeeklyBars';
import { ExpandedReceipts } from '../../home/InsightCard';
import { SIGNAL_OPEN_MOTION, useSignalOpen } from '../../motion/signalOpenMotion';
import { Header } from '../../ui/Header';
import { ThemedText } from '../../ui/ThemedText';
import { EpisodeGallery } from './EpisodeGallery';

// SignalScreen — the Signal's own screen (D2-3 · CUL-1065; design authority
// `docs/culprit-design-v4-mockups.html` §03, the sections in this order):
//
//   1. the title                       `signalTitle` — names the thing and the window
//   2. the weekly bars                 every week's count and its logged days
//   3. the count-anchored sentence     the server's phrased sentence, the Change Contract's
//   4. the compare                     two windows, logged days shown, nothing adjudicated
//   5. the lanes                       timed from meals, before / in the trial, the untimed line
//   6. the episodes                    a gallery, each tile its OWN read
//   7. why this is a Signal            counts, not a verdict; the medication inside the window
//   8. keep it compact on Home         folds the Home card for the owner's return
//
// A safety finding gets the screen too (S1 lives on Home's card, not here): the same
// sections over its record, plus the shipped phone script (`ExpandedReceipts`) after the
// why — the safety tap's script is one screen away, as it was one tap away.
//
// THE OPENING (Motion Designer, §06): the route rises with the fold's physics (the native
// transition, set in `app/signal/[id].tsx`); the charts draw in on arrival (`drawIn`, the
// FACT — C-30); the sentence and the compare land together at 200ms on one value
// (`useSignalOpen`); the lanes' dots pop behind on their own stagger. Reduced motion is
// the static frame. VoiceOver focus lands on the title when the model arrives.
//
// C-9: the pet is the route's pet, named by `loadSignalScreen` through
// `resolveRecordPetName`; `activePet` is never read here.
//
// No haptic anywhere on this screen: it paints `worth_a_call` (the gallery, the phone
// script), and it is named in `guards/haptics.test.ts`'s ALWAYS_SCANNED.

/** *Keep it compact on Home* — the fold control's words on the screen. */
export const KEEP_COMPACT_LABEL = 'Keep it compact on Home';
export const KEEP_COMPACT_HINT = 'Folds this signal to one line on Home. It reopens on its own when the picture changes.';
/** The Why block's title. */
export const WHY_TITLE = 'Why this is a Signal';
/** The phone script's title on a safety screen. */
export const SCRIPT_TITLE = 'If you call your clinic';

interface Props {
  petId: string;
  identity: string;
}

export function SignalScreen({ petId, identity }: Props) {
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();
  const [load, setLoad] = useState<{ status: 'loading' } | { status: 'failed' } | SignalScreenLoad>({ status: 'loading' });
  const loadId = useRef(0);

  const run = useCallback(async () => {
    const my = ++loadId.current;
    setLoad({ status: 'loading' });
    try {
      const next = await loadSignalScreen(petId, identity);
      if (loadId.current === my) setLoad(next);
    } catch (e) {
      console.warn('[signal-screen] load failed:', e);
      if (loadId.current === my) setLoad({ status: 'failed' });
    }
  }, [petId, identity]);

  useEffect(() => {
    void run();
  }, [run]);

  const model = load.status === 'ready' ? load.model : null;
  const arrived = model != null;
  const landStyle = useSignalOpen({ arrived, identity, reducedMotion, appActive });

  // VoiceOver focus lands on the title once it exists (§06: a route gives focus for free —
  // this is the one line that says where).
  const titleRef = useRef<View>(null);
  useEffect(() => {
    if (!arrived) return;
    focusAccessibility(titleRef.current);
  }, [arrived, identity]);

  const back = () => router.back();

  return (
    <View style={styles.container} testID="signal-screen">
      <Header title="Signal" leading="back" onLeadingPress={back} />
      {load.status === 'loading' ? (
        <View style={styles.centered}>
          <WhorlSpinner size="md" ground="day" />
        </View>
      ) : load.status === 'failed' ? (
        <View style={styles.centered}>
          <ThemedText style={styles.stateText}>I couldn't open this signal just now.</ThemedText>
          <Pressable onPress={() => void run()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Try again" style={styles.retry}>
            <ThemedText style={styles.retryText}>Try again</ThemedText>
          </Pressable>
        </View>
      ) : load.status === 'missing' ? (
        <View style={styles.centered} testID="signal-screen-missing">
          <ThemedText style={styles.stateText}>This signal isn't in {load.petName}'s picture any more.</ThemedText>
        </View>
      ) : (
        <Body model={load.model} petId={petId} petName={load.petName} landStyle={landStyle} titleRef={titleRef} onFolded={back} />
      )}
    </View>
  );
}

function Body({
  model,
  petId,
  petName,
  landStyle,
  titleRef,
  onFolded,
}: {
  model: SignalScreenModel;
  petId: string;
  petName: string;
  landStyle: ReturnType<typeof useSignalOpen>;
  titleRef: React.RefObject<View | null>;
  onFolded: () => void;
}) {
  const [folding, setFolding] = useState(false);

  // *Keep it compact on Home*: the same entry Home's control writes (`foldedEntry`, with
  // the record's witness for a standing safety type), through the same store, then back
  // to Home — where `useSignalFold` has heard the write (`subscribeFoldStore`) and draws
  // the strip. The strip keeps its own re-open.
  const keepCompact = async () => {
    if (folding) return;
    setFolding(true);
    try {
      const stored = (await readFoldEntries(petId)) ?? {};
      const facts: RecordFacts =
        model.finding.type === 'symptom_chronicity' || model.finding.type === 'symptom_worsening'
          ? { lastEpisodeIso: readLastEpisodeIso(petId, model.finding.symptomType) }
          : {};
      await writeFoldEntries(petId, { ...stored, [model.identity]: foldedEntry(model.finding, new Date().toISOString(), facts) });
    } finally {
      setFolding(false);
      onFolded();
    }
  };

  const drawIn = true;
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} testID="signal-screen-body">
      {/* 1 · the title */}
      <View ref={titleRef} accessible accessibilityRole="header" testID="signal-screen-title">
        <ThemedText style={styles.title}>{model.title}</ThemedText>
      </View>

      {/* 2 · the weekly bars */}
      {model.weekly && model.noun ? (
        <View style={styles.section} testID="signal-section-weekly">
          <WeeklyBars model={model.weekly} noun={model.noun} drawIn={drawIn} identity={model.identity} />
        </View>
      ) : null}

      {/* 3 + 4 · the sentence and the compare land together */}
      <Animated.View style={[styles.section, landStyle]} testID="signal-section-sentence">
        <ThemedText style={styles.sentence}>{model.sentence}</ThemedText>
        {model.compare && model.noun ? (
          <View style={styles.compare} testID="signal-section-compare">
            <CompareBars model={model.compare} noun={model.noun} drawIn={drawIn} identity={model.identity} />
          </View>
        ) : null}
      </Animated.View>

      {/* 5 · timed from meals */}
      {model.lanes ? (
        <View style={styles.section} testID="signal-section-lanes">
          <ThemedText style={styles.sectionTitle} accessibilityRole="header">
            Timed from meals
          </ThemedText>
          <TimingLanes lanes={model.lanes.lanes} axis={model.lanes.axis} drawIn={drawIn} identity={model.identity} />
        </View>
      ) : null}

      {/* 6 · the episodes */}
      {model.episodes ? (
        <View style={styles.section} testID="signal-section-episodes">
          <EpisodeGallery episodes={model.episodes} />
        </View>
      ) : null}

      {/* 7 · why this is a Signal */}
      <View style={styles.section} testID="signal-section-why">
        <ThemedText style={styles.sectionTitle} accessibilityRole="header">
          {WHY_TITLE}
        </ThemedText>
        {model.why.map((line, i) => (
          <ThemedText key={i} style={styles.why}>
            {line}
          </ThemedText>
        ))}
      </View>

      {/* The safety phone script — the shipped receipts, the same words, one screen away. */}
      {model.safety ? (
        <View style={styles.section} testID="signal-section-script">
          <ThemedText style={styles.sectionTitle} accessibilityRole="header">
            {SCRIPT_TITLE}
          </ThemedText>
          <ExpandedReceipts finding={model.finding} petName={petName} trialRunning={false} />
        </View>
      ) : null}

      {/* 8 · keep it compact on Home */}
      {model.foldable ? (
        <View style={styles.section} testID="signal-section-fold">
          <Pressable
            onPress={() => void keepCompact()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={KEEP_COMPACT_LABEL}
            accessibilityHint={KEEP_COMPACT_HINT}
            style={styles.foldControl}
            testID="signal-keep-compact"
          >
            <ThemedText style={styles.foldLabel}>{KEEP_COMPACT_LABEL}</ThemedText>
            <ThemedText style={styles.foldVerb}>Fold</ThemedText>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

// The beats, re-exported beside the screen so a reader of this file sees them without
// opening the motion module.
export { SIGNAL_OPEN_MOTION };

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space3,
    gap: theme.space2,
  },
  stateText: {
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextSecondary,
    textAlign: 'center',
  },
  retry: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.space2,
  },
  retryText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
  scroll: {
    padding: theme.space2,
    paddingBottom: theme.space6,
    gap: theme.space3,
  },
  // The shipped lead sentence's display face, on the title.
  title: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textSignal,
    lineHeight: theme.lineHeightSignal,
    letterSpacing: theme.trackingTight,
    color: theme.colorTextPrimary,
  },
  section: {
    gap: theme.space1,
  },
  sectionTitle: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    marginBottom: theme.space0_5,
  },
  sentence: {
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextPrimary,
  },
  compare: {
    marginTop: theme.space1,
  },
  why: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
  },
  foldControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: theme.space1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colorBorder,
  },
  foldLabel: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  foldVerb: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
});
