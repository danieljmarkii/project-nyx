// The look as Today's header (Design v2 — the whole day, D2-4 / CUL-1066; the round-4
// page §01, ruled from the owners' read: "the look belongs at the top").
//
// *How does Nyx seem today?* in the serif, then the compact chips — eight for a cat (the
// seven concerns and two positives, `LOOK_HEAD_WORDS`), *More…* to the families — and,
// once answered, the day's entries — a rail, the head word, its gloss, the time — and
// *Add a look*. Tap a chip and it becomes a fact with a time.
//
// ── WHAT IT KEEPS FROM THE CARD, AND WHAT IT CHANGES ─────────────────────────
// The WRITE PATH is the card's: `insertLook` → the optimistic `prependEvent` → `showLook`
// (the completion register owns the dwell, the Undo target and the staleness guard, C-20)
// — `guards/homeWrites.test.ts` names this file with exactly `insertLook` and nothing
// else. The pet is captured at the tap, never re-read at save (T-11 / C-9). The
// PROTECTION is the card's too (CUL-1220 restored what the first cut dropped): under a
// live intake concern a quiet look draws `LookWithheldEntry` AND the reason line, and the
// question stays open beneath it, so the emergency door is always reachable (BRK-19;
// `lookWithheldState` fails toward 'unknown' → a skeleton, never a claim, and the ask
// stays there too). A later quiet or positive look never hides an earlier concern: every
// concern entry of the day stays drawn (BRK-20, §3.3 floor 5). The families and the
// emergency door (§3.7, T-4) are behind *More…*; where the intake router (a navigation,
// T-3) and the absence chip sit is GC-6, see `REFUSAL_DOORS_ON_FIRST_ROW`. The gate is
// `lookCardLive` — the `daily_look` rollout is NOT widened by `design_v2` (CUL-891).
//
// What changes: ONE TAP IS ONE WORD IS ONE LOOK. The card collected several words and a
// Done bar; the page rules the chip itself is the save ("tap a chip and it becomes a
// fact with a time"). A second word is a second entry, made through *Add a look* — which
// is R9 / T-14's rule already: the question never closes, and a later look is a later row,
// never an edit of the first. The note (T-22) stays on the record screen; the header has
// no field, so Home carries no form (§0.1). Both are stated on the issue for D2-8's
// Tier-2 edit of §4 / §10, not decided here quietly.
//
// ── C-33 ─────────────────────────────────────────────────────────────────────────
// Home's write classes are measured, not remembered: the allow-set in
// `guards/homeWrites.test.ts` is `{ LookHeader → insertLook }` for this file, and a
// second helper reached from here reds the build.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../../constants/theme';
import {
  LOOK_HEAD_WORDS,
  LOOK_OPENING_CHIP_KEY,
  lookSpeciesOf,
  lookWord,
  notHerselfLabel,
  type LookSpecies,
} from '../../../constants/lookWords';
import { useAllowlistFlag } from '../../../hooks/useAppConfig';
import { useAppActive } from '../../../hooks/useAppActive';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useBetaOptIn } from '../../../lib/betaFeatures';
import { useEvents } from '../../../hooks/useEvents';
import { selectChip, openMenu } from '../../../lib/haptics';
import {
  LOOK_ABSENCE_CHIP,
  LOOK_FEWER_WORDS,
  LOOK_UNDO,
  intakeDoorLabel,
  lookCardLive,
  lookHeaderQuestion,
  lookMoreToday,
  lookMoreTodayHref,
} from '../../../lib/lookCard';
import { describeLook, gridChipLabel, gridSectionsFor, isLookRow, lookHeadline } from '../../../lib/lookDisplay';
import { EMERGENCY_DOOR_LABEL, type EmergencyRead } from '../../../lib/lookEmergency';
import { loadEmergencyFacts, withIntakeRefusal } from '../../../lib/lookEmergencyFacts';
import {
  entryWithholdsWords,
  intakeArm,
  loadLookWithheldFacts,
  lookWithheldState,
  markWithheldToday,
  type LookWithheldFacts,
} from '../../../lib/lookWithheld';
import { insertLook } from '../../../lib/looks';
import { HITSLOP_ACTION_SOLO } from '../../../lib/completionCard';
import { wordsFromLocalText, wordsToLocalText } from '../../../lib/lookWordsCodec';
import { formatTime } from '../../../lib/utils';
import { LOOK_DWELL_MS, useMomentStore } from '../../../store/momentStore';
import { useEventStore, type NyxEvent } from '../../../store/eventStore';
import { usePetStore } from '../../../store/petStore';
import { useUiStore } from '../../../store/uiStore';
import { LookEmergencySheet } from '../../home/LookEmergencySheet';
import { LookWithheldEntry, LookWithheldReasonLine, WITHHELD_UNDO_FADE_MS } from '../../home/LookWithheldEntry';
import { useGridDisclosure, useLookArrival } from '../../motion/lookMotion';
import { ThemedText } from '../../ui/ThemedText';
import { Skeleton } from '../../ui/Skeleton';

/** The header's own copy. */
export const LOOK_MORE = 'More…';
/** The ask-again control (BRK-20). A second tap writes a second look, never an edit of
 *  the first (T-14), so the control says so — it was *Change*, which it never did. */
export const LOOK_ADD = 'Add a look';

/**
 * GC-6 (CUL-1179) — where *Didn't eat ›* and *Nothing unusual* sit. **Unruled when this
 * shipped; option (a) is built as a stated assumption (CUL-1220):** both on the compact
 * first row, both species, because intake is not preference and a refusal must never
 * cost more taps than a mood word. Option (b) — both behind *More…* — is `false` here and
 * nothing else; the door row draws them in that case.
 */
export const REFUSAL_DOORS_ON_FIRST_ROW = true;

/** A chip's vertical reach, and the row gap it forces (C-5: two stacked chips face each
 *  other with the full reach between them, derived once here). */
export const HEADER_CHIP_REACH = 5;
export const HEADER_CHIP_ROW_GAP = HEADER_CHIP_REACH * 2;
const HEADER_CHIP_SLOP = { top: HEADER_CHIP_REACH, bottom: HEADER_CHIP_REACH };
/** The vertical reach of an entry's controls above a line (the completion Undo's slop and
 *  the withheld entry's 8), so a line beneath shares no point with them (C-5). */
export const LINE_CLEARANCE = Math.max(HITSLOP_ACTION_SOLO.bottom, 8);

interface Props {
  /** The trial's refusal register, three-state (CUL-873): a positive fact or nothing for
   *  the emergency door; `null` fails closed for the withheld predicate. */
  trialNotEating?: boolean | null;
  onLayout?: (e: LayoutChangeEvent) => void;
}

interface Resting {
  petId: string;
  facts: LookWithheldFacts;
}

export function LookHeader({ trialNotEating = null, onLayout }: Props) {
  const activePet = usePetStore((s) => s.activePet);
  const pets = usePetStore((s) => s.pets);
  const eligible = useAllowlistFlag('daily_look');
  const optedIn = useBetaOptIn('daily_look');
  const { todayEvents, prependEvent } = useEvents();
  const removeFromToday = useEventStore((s) => s.removeFromToday);
  const showLook = useMomentStore((s) => s.showLook);
  const undo = useMomentStore((s) => s.undo);
  const momentPayload = useMomentStore((s) => s.payload);
  const momentVisible = useMomentStore((s) => s.visible);
  const momentRemoved = useMomentStore((s) => s.removed);
  const setCaptureOverlay = useUiStore((s) => s.setCaptureOverlay);
  const openIntakeDoor = useUiStore((s) => s.openIntakeDoor);
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();

  const species: LookSpecies | null = lookSpeciesOf(activePet?.species);
  const live = lookCardLive({ eligible, optedIn, species: activePet?.species }) && activePet !== null;
  const sex = activePet?.sex ?? 'unknown';
  const petName = activePet?.name ?? '';
  const petId = activePet?.id ?? null;
  const petSpecies = activePet?.species ?? null;

  const [gridOpen, setGridOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [justWritten, setJustWritten] = useState<string | null>(null);
  const [resting, setResting] = useState<Resting | null>(null);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [emergencyRead, setEmergencyRead] = useState<EmergencyRead>({ status: 'loading' });

  // The live subject at the instant a late answer lands (C-9 — the fold's ref idiom).
  const activePetIdRef = useRef<string | null>(null);
  activePetIdRef.current = petId;

  const disclosure = useGridDisclosure({ open: gridOpen, reducedMotion, appActive });

  // TODAY'S LOOKS for THIS pet, newest first (C-9: the store may hold the previous
  // pet's rows until its read answers).
  const todayLooks = useMemo(
    () =>
      todayEvents
        .filter((e) => isLookRow(e) && e.pet_id === petId)
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
    [todayEvents, petId],
  );
  const newest = todayLooks[0] ?? null;

  const withheldState = activePet
    ? lookWithheldState({ id: activePet.id }, resting?.petId === activePet.id ? resting.facts : null)
    : 'unknown';

  // The register decides the beat's length; this only reads whether it is still live.
  const beatLive =
    justWritten !== null &&
    momentVisible &&
    !momentRemoved &&
    momentPayload?.kind === 'look' &&
    momentPayload.eventId === justWritten &&
    newest?.id === justWritten;

  const arrival = useLookArrival({
    entryKey: justWritten,
    animate: justWritten !== null,
    reducedMotion,
    appActive,
  });

  // THE WITHHELD READ, per pet. Dropped whole on a switch, never carried (C-9).
  const restingFor = useRef<string | null>(null);
  useEffect(() => {
    if (!live || !petId) return;
    let cancelled = false;
    if (restingFor.current !== petId) {
      restingFor.current = petId;
      setResting(null);
      setAskOpen(false);
      setGridOpen(false);
    }
    loadLookWithheldFacts({ id: petId, species: petSpecies }, trialNotEating)
      .then((facts) => {
        if (cancelled || activePetIdRef.current !== petId) return;
        setResting({ petId, facts });
      })
      .catch((e) => console.warn('[LookHeader] withheld read failed:', e));
    return () => {
      cancelled = true;
    };
  }, [live, petId, petSpecies, todayEvents.length, trialNotEating]);

  useEffect(() => {
    if (!live || !petId || withheldState !== 'withheld') return;
    markWithheldToday(petId).catch(() => {});
  }, [live, petId, withheldState]);

  // The pinned way back while the families are open (T-21) — Home's `LookExits` reads
  // it. No Done bar: the chip is the save.
  const closeGrid = useCallback(() => {
    disclosure.beforeCommit(false);
    setGridOpen(false);
  }, [disclosure]);
  useEffect(() => {
    if (!live || !gridOpen) {
      setCaptureOverlay(null);
      return;
    }
    // No Done bar, so the FAB's corner stays the FAB's (BRK-18): the + is the way to log
    // anything else while the words are open, on this tab and every other.
    setCaptureOverlay({
      summary: null,
      inViewport: true,
      busy: submitting,
      onBack: closeGrid,
      onDone: null,
      drawsDoneBar: false,
    });
  }, [live, gridOpen, submitting, closeGrid, setCaptureOverlay]);
  useEffect(() => () => setCaptureOverlay(null), [setCaptureOverlay]);

  // ── THE WRITE: one tap, one word, one look ───────────────────────────────────
  const write = useCallback(
    async (outcome: 'observed' | 'nothing_unusual', words: readonly string[]) => {
      // The subject is the pet on screen AT THE TAP (T-11), and the write refuses if it
      // has moved by the time the local insert would run.
      const subject = activePet;
      const subjectSpecies = lookSpeciesOf(subject?.species);
      if (!subject || !subjectSpecies || submitting) return;
      selectChip();
      setSubmitting(true);
      try {
        const occurredAt = new Date();
        const result = await insertLook({
          petId: subject.id,
          species: subjectSpecies,
          outcome,
          words,
          occurredAt,
          // C-10 — clock-seeded, so the row says so.
          occurredAtSource: 'now',
        });
        if (activePetIdRef.current !== subject.id) {
          // Saved — for the pet it was tapped on. Say so rather than drawing it under the
          // other animal's question.
          Alert.alert('Saved', `That look went into ${subject.name}’s record.`);
        }
        prependEvent({
          id: result.eventId,
          pet_id: subject.id,
          event_type: 'check_in',
          occurred_at: result.occurredAtIso,
          severity: null,
          notes: null,
          source: 'manual',
          deleted_at: null,
          created_at: result.now,
          updated_at: result.now,
          occurred_at_confidence: 'witnessed',
          look_outcome: outcome,
          look_words: wordsToLocalText([...words]),
          look_note: null,
        } as NyxEvent);
        showLook({
          eventId: result.eventId,
          petId: subject.id,
          occurredAt: result.occurredAtIso,
          outcome,
          words,
        });
        setJustWritten(result.eventId);
        setAskOpen(false);
        if (gridOpen) closeGrid();
      } catch (e) {
        // A failed write is always said (C-12).
        console.error('[LookHeader] insertLook failed:', e);
        Alert.alert('Couldn’t save that', 'Please try again in a moment.');
      } finally {
        setSubmitting(false);
      }
    },
    [activePet, submitting, prependEvent, showLook, gridOpen, closeGrid],
  );

  const onWord = useCallback((key: string) => void write('observed', [key]), [write]);
  const onAbsence = useCallback(() => void write('nothing_unusual', []), [write]);

  // Undo — the one shared reversal, reached through the register (C-20).
  const onUndo = useCallback(
    async (eventId: string) => {
      const result = await undo(eventId);
      if (result === 'removed') {
        removeFromToday(eventId);
        setJustWritten(null);
        setAskOpen(true);
      } else if (result === 'failed') {
        Alert.alert('Couldn’t undo that', 'The look is still in the record. Open it to remove it.');
      }
    },
    [undo, removeFromToday],
  );

  const onIntakeDoor = useCallback(() => {
    if (!activePet) return;
    openMenu();
    openIntakeDoor({ petId: activePet.id, petName: activePet.name, sex, cardHasSelections: false });
  }, [activePet, sex, openIntakeDoor]);

  const openEmergency = useCallback(() => {
    setEmergencyRead({ status: 'loading' });
    setEmergencyOpen(true);
    if (!activePet) {
      setEmergencyRead({ status: 'failed' });
      return;
    }
    const id = activePet.id;
    loadEmergencyFacts(id)
      .then((facts) => {
        const merged = withIntakeRefusal(
          facts,
          trialNotEating === true,
          resting?.petId === id ? intakeArm(resting.facts.recentQualifyingMeals ?? []) : false,
        );
        if (activePetIdRef.current !== id) return;
        setEmergencyRead(merged ? { status: 'ready', facts: merged } : { status: 'failed' });
      })
      .catch(() => setEmergencyRead({ status: 'failed' }));
  }, [activePet, trialNotEating, resting]);

  if (!live || !activePet || !species) return null;

  const headWords = LOOK_HEAD_WORDS[species];
  const families = gridSectionsFor(species, headWords, sex).filter((s) => s.label !== null);
  const asking = newest === null || askOpen;

  // WHAT THE DAY SHOWS (BRK-20; §3.3 floor 5, T-15). The newest look, plus EVERY earlier
  // look today that carries a concern word: a good evening never removes a worry the
  // morning said. The rest fold behind the card's own door to History. A concern entry
  // never withholds its words (`entryWithholdsWords`), so at most one withheld entry is
  // ever drawn — the newest.
  const shown = todayLooks.filter((row, i) => i === 0 || carriesConcern(row, species));
  const folded = todayLooks.length - shown.length;
  const withholds = (row: NyxEvent) =>
    withheldState === 'withheld' && entryWithholdsWords(wordsFromLocalText(row.look_words), species);
  const firstWithheld = shown.find(withholds) ?? null;

  const refusalDoors = (
    <>
      <HeaderChip label={LOOK_ABSENCE_CHIP} onPress={onAbsence} disabled={submitting} testID="look-header-absence" />
      <Pressable
        onPress={onIntakeDoor}
        hitSlop={HEADER_CHIP_SLOP}
        accessibilityRole="button"
        accessibilityLabel={intakeDoorLabel(pets.length > 1, sex)}
        accessibilityHint={`Opens a new meal to say how much ${petName} ate`}
        style={styles.chip}
        testID="look-header-intake-door"
      >
        <ThemedText style={styles.chipText}>{intakeDoorLabel(pets.length > 1, sex)}</ThemedText>
      </Pressable>
    </>
  );

  return (
    <View style={styles.header} onLayout={onLayout} testID="look-header">
      <ThemedText style={styles.question} accessibilityRole="header">
        {lookHeaderQuestion(petName)}
      </ThemedText>

      {/* THE DAY'S ENTRIES — drawn whenever the day holds a look, asking or not, so
          re-opening the words never takes a concern off the screen. While the withheld
          read is in flight the entries are a skeleton: neither claim (C-12). */}
      {shown.length > 0 ? (
        <View testID="look-header-entries">
          {withheldState === 'unknown' ? (
            <View style={styles.answered} testID="look-header-skeleton">
              <Skeleton width="60%" height={13} />
            </View>
          ) : (
            <>
              {shown.map((row) =>
                withholds(row) ? (
                  <LookWithheldEntry
                    key={row.id}
                    occurredAt={row.occurred_at}
                    petName={petName}
                    sex={sex}
                    undoLive={beatLive && row.id === justWritten}
                    dwellMs={LOOK_DWELL_MS}
                    onUndo={() => onUndo(row.id)}
                    onOpenRecord={() => router.push(`/event/${row.id}` as never)}
                    testID="look-header-withheld"
                  />
                ) : (
                  <AnsweredRow
                    key={row.id}
                    row={row}
                    species={activePet.species}
                    sex={sex}
                    arrival={row.id === justWritten ? arrival : null}
                    undoLive={beatLive && row.id === justWritten}
                    onUndo={() => onUndo(row.id)}
                  />
                ),
              )}
              {/* THE REASON, once (BRK-19; T-20, floor item 12). A destination is not a
                  reason, and "Saved" alone is the state the completion system exists to
                  prevent. */}
              {firstWithheld ? (
                <LookWithheldReasonLine
                  petName={petName}
                  sex={sex}
                  onOpenRecord={() => router.push(`/event/${firstWithheld.id}` as never)}
                  testID="look-header-withheld-reason"
                />
              ) : null}
              {folded > 0 ? (
                <Pressable
                  onPress={() => router.push(lookMoreTodayHref() as never)}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${folded} more of today's looks in history`}
                  style={styles.line}
                  testID="look-header-more-today"
                >
                  <ThemedText style={styles.control}>{lookMoreToday(folded)}</ThemedText>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      ) : null}

      {/* THE QUESTION NEVER CLOSES (T-14, BRK-19). In every state below "asking" —
          answered, withheld, still reading — the words are one tap away, and through
          them *More…* and the emergency door. A second look is a second row, so the
          control is named for that, never "Change". */}
      {!asking ? (
        <Pressable
          onPress={() => {
            openMenu();
            setAskOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${LOOK_ADD}. Opens the words again`}
          style={styles.line}
          testID="look-header-add"
        >
          <ThemedText style={styles.control}>{LOOK_ADD}</ThemedText>
        </Pressable>
      ) : null}

      {asking ? (
        <>
          <View
            style={[styles.chips, shown.length > 0 && styles.chipsAfterEntries]}
            testID="look-header-chips"
          >
            {headWords.map((key) => {
              const word = lookWord(species, key);
              if (!word) return null;
              return (
                <HeaderChip
                  key={key}
                  label={gridOpen ? gridChipLabel(word) : word.head}
                  hint={gridOpen ? null : word.gloss}
                  onPress={() => onWord(key)}
                  disabled={submitting}
                  testID={`look-header-chip-${key}`}
                />
              );
            })}
            {REFUSAL_DOORS_ON_FIRST_ROW ? refusalDoors : null}
            {!gridOpen ? (
              <Pressable
                onPress={() => {
                  disclosure.beforeCommit(true);
                  setGridOpen(true);
                }}
                hitSlop={HEADER_CHIP_SLOP}
                accessibilityRole="button"
                accessibilityLabel="More words"
                accessibilityHint={
                  REFUSAL_DOORS_ON_FIRST_ROW
                    ? 'Shows the full list and when to call'
                    : 'Shows the full list, the didn’t-eat door and when to call'
                }
                style={styles.moreChip}
                testID="look-header-more"
              >
                <ThemedText style={styles.moreText}>{LOOK_MORE}</ThemedText>
              </Pressable>
            ) : null}
          </View>

          {gridOpen ? (
            <>
              {/* The first row's other doors. Where the refusal door and the absence sit
                  is GC-6 (CUL-1179): see `REFUSAL_DOORS_ON_FIRST_ROW`. */}
              <View style={[styles.chips, styles.doorRow]} testID="look-header-door-row">
                {REFUSAL_DOORS_ON_FIRST_ROW ? null : refusalDoors}
                <HeaderChip
                  label={notHerselfLabel(sex)}
                  onPress={() => onWord(LOOK_OPENING_CHIP_KEY)}
                  disabled={submitting}
                  testID="look-header-opening"
                />
              </View>
              {/* C-5 (BRK-17): the two stacked doors take 44pt boxes and NO slop, and the
                  first sits a chip's reach below the chip row, so no two responders share
                  a point — the emergency door's edge no longer closes the grid. */}
              <Pressable
                onPress={openEmergency}
                accessibilityRole="button"
                accessibilityLabel={EMERGENCY_DOOR_LABEL.replace(' ›', '')}
                style={[styles.door, styles.doorAfterChips]}
                testID="look-header-emergency-door"
              >
                <ThemedText style={styles.emergencyText}>{EMERGENCY_DOOR_LABEL}</ThemedText>
              </Pressable>
              <Pressable
                onPress={closeGrid}
                accessibilityRole="button"
                accessibilityLabel="Show fewer words"
                style={styles.door}
                testID="look-header-fewer"
              >
                <ThemedText style={styles.doorText}>{LOOK_FEWER_WORDS}</ThemedText>
              </Pressable>
              <Animated.View style={disclosure.landStyle} testID="look-header-grid">
                {families.map((section) => (
                  <View key={section.label ?? '__head'} style={styles.section}>
                    <ThemedText style={styles.sectionLabel}>{section.label}</ThemedText>
                    <View style={styles.chips}>
                      {section.words.map((word) => (
                        <HeaderChip
                          key={word.key}
                          label={gridChipLabel(word)}
                          onPress={() => onWord(word.key)}
                          disabled={submitting}
                          testID={`look-header-grid-chip-${word.key}`}
                        />
                      ))}
                    </View>
                  </View>
                ))}
              </Animated.View>
            </>
          ) : null}
        </>
      ) : null}

      <LookEmergencySheet
        visible={emergencyOpen}
        species={species}
        petName={petName}
        read={emergencyRead}
        onClose={() => setEmergencyOpen(false)}
      />
    </View>
  );
}

/** Does this look carry a concern word? The one fact that keeps an earlier entry on the
 *  day (BRK-20) — the inverse of `entryWithholdsWords`, imported rather than restated. */
function carriesConcern(row: NyxEvent, species: LookSpecies): boolean {
  if (row.look_outcome !== 'observed') return false;
  return !entryWithholdsWords(wordsFromLocalText(row.look_words), species);
}

// ── The answered row ─────────────────────────────────────────────────────────────

function AnsweredRow({
  row,
  species,
  sex,
  arrival,
  undoLive,
  onUndo,
}: {
  row: NyxEvent;
  species: string | null | undefined;
  sex: 'male' | 'female' | 'unknown';
  arrival: ReturnType<typeof useLookArrival> | null;
  undoLive: boolean;
  onUndo: () => void;
}) {
  const described = describeLook(row, { species, sex });
  const head = lookHeadline(described) ?? 'Noticed';
  // The gloss rides a single word's row ("Off · flat, lying about"); several words are
  // already the sentence.
  const gloss = described.kind === 'observed' && described.words.length === 1 ? described.words[0].gloss : null;
  const time = formatTime(new Date(row.occurred_at));
  const undoOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!undoLive) return;
    const at = Math.max(0, LOOK_DWELL_MS - WITHHELD_UNDO_FADE_MS);
    const timer = setTimeout(() => {
      Animated.timing(undoOpacity, { toValue: 0.35, duration: WITHHELD_UNDO_FADE_MS, useNativeDriver: true }).start();
    }, at);
    return () => {
      clearTimeout(timer);
      undoOpacity.setValue(1);
    };
  }, [undoLive, undoOpacity]);
  return (
    <View style={styles.answered} testID="look-header-answered">
      <Animated.View style={[styles.rail, arrival?.ringStyle]} />
      <Animated.View style={[styles.answeredBody, arrival?.wordsStyle]}>
        <ThemedText
          style={[styles.answeredText, described.kind === 'absence' && styles.answeredQuiet]}
          accessibilityLabel={`${head}${gloss ? `, ${gloss}` : ''}, ${time}`}
        >
          <ThemedText style={styles.answeredHead}>{head}</ThemedText>
          {gloss ? ` · ${gloss}` : ''}
          {` · ${time}`}
        </ThemedText>
      </Animated.View>
      {/* Undo is the row's only control now that *Add a look* has its own line (BRK-20);
          its slop is the completion cards' (C-5), and every line below it keeps a full
          reach of margin (`styles.line`). */}
      {undoLive ? (
        <Animated.View style={{ opacity: undoOpacity }}>
          <Pressable
            onPress={onUndo}
            hitSlop={HITSLOP_ACTION_SOLO}
            accessibilityRole="button"
            accessibilityLabel={`Undo. ${head}`}
            testID="look-header-undo"
          >
            <ThemedText style={styles.control}>{LOOK_UNDO}</ThemedText>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

// ── A chip that writes ──────────────────────────────────────────────────────────

/** A BUTTON, not a checkbox (C-7): the tap records a look, it toggles nothing. */
function HeaderChip({
  label,
  hint,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  hint?: string | null;
  onPress: () => void;
  disabled: boolean;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={HEADER_CHIP_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint ?? undefined}
      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
      testID={testID}
    >
      <ThemedText style={styles.chipText}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
    paddingBottom: theme.space1,
    marginBottom: theme.space0_5,
  },
  question: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textLG,
    color: theme.colorTextPrimary,
    letterSpacing: -0.2,
    marginBottom: theme.spaceMicro,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: theme.space0_5 + theme.spaceMicro,
    // C-5: two stacked chips face each other with the full reach between them.
    rowGap: HEADER_CHIP_ROW_GAP,
    marginTop: theme.space0_5 + theme.spaceMicro,
  },
  doorRow: { marginTop: theme.space1 },
  chip: {
    borderWidth: 1,
    borderColor: theme.colorBorderStrong,
    borderRadius: theme.radiusFull,
    paddingHorizontal: theme.space1 + theme.spaceMicro,
    paddingVertical: theme.space0_5 + theme.spaceMicro,
    backgroundColor: theme.colorSurface,
    // 34pt + 2 × the reach = the 44pt floor (C-5).
    minHeight: 44 - HEADER_CHIP_REACH * 2,
    justifyContent: 'center',
  },
  chipPressed: { backgroundColor: theme.colorAccentLight, borderColor: theme.colorAccentLight },
  chipText: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  moreChip: {
    paddingHorizontal: theme.space0_5,
    minHeight: 44 - HEADER_CHIP_REACH * 2,
    justifyContent: 'center',
  },
  moreText: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
  // 44pt boxes with no slop (C-5, BRK-17): the stacked doors meet edge to edge and share
  // nothing. `doorAfterChips` clears the chip row's reach above the first of them.
  door: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  doorAfterChips: { marginTop: HEADER_CHIP_REACH },
  // A line under the entries (*N more today ›*, *Add a look*): a 44pt box with no slop,
  // a full reach below the Undo above it (the completion slop, `HITSLOP_ACTION_SOLO`).
  line: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginTop: LINE_CLEARANCE },
  // The chips re-opened under the entries clear the last entry's control (C-5).
  chipsAfterEntries: { marginTop: LINE_CLEARANCE + HEADER_CHIP_REACH },
  doorText: { fontSize: theme.textSM, fontWeight: theme.weightMedium, color: theme.colorAccentInk },
  emergencyText: { fontSize: theme.textSM, fontWeight: theme.weightMedium, color: theme.colorEventSymptomInk },
  section: { marginTop: theme.space1 },
  sectionLabel: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    letterSpacing: theme.trackingWide,
    marginBottom: theme.spaceMicro,
  },
  answered: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    marginTop: theme.space0_5 + theme.spaceMicro,
    minHeight: 44 - HEADER_CHIP_REACH * 2,
  },
  // The accent as a GLYPH (a 3pt bar, never text) — C-1's rule is about text on a light
  // ground, and a bar is what the guard's `color:` scan does not touch.
  rail: { width: 3, height: 18, borderRadius: 2, backgroundColor: theme.colorAccent },
  answeredBody: { flex: 1, minWidth: 0 },
  answeredText: { fontSize: theme.textSM, color: theme.colorTextSecondary },
  answeredQuiet: { color: theme.colorTextTertiary },
  answeredHead: { fontWeight: theme.weightSemibold, color: theme.colorTextPrimary },
  control: { fontSize: theme.textXS, fontWeight: theme.weightMedium, color: theme.colorAccentInk },
});
