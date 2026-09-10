// Noticed — the daily look's card on Home (CUL-871 / N-4a).
//
// docs/nyx-daily-look-requirements.md §3.1, §3.1a, §3.2, §3.5, §3.6, §3.7; T-1, T-4,
// T-8, T-9, T-10, T-11, T-12, T-13, T-14, T-15, T-21.
//
// ── WHAT IT IS ───────────────────────────────────────────────────────────────
// One question, asked once, answerable in a tap: *How does Mochi seem right now,
// compared with his usual?* It is the second of Home's exactly two write classes (the
// med strip's confirm is the first — `docs/nyx-med-strip-requirements.md` §0.1, whose
// carve-out this card is written under, and whose bound `guards/homeWrites.test.ts`
// enforces). A look writes ONE `check_in` row and its `looks` child, and nothing else:
// no symptom leaf, no engine input, no coverage line, no floor (T-5, R10).
//
// ── THE THREE SHAPES ─────────────────────────────────────────────────────────
//   1. ASKING, compact — the question, the first row, the seven head words, one door.
//   2. ASKING, unfolded — the same card grown in place, with the families and the
//      emergency door. Never a sheet, never a navigation (§3.1a).
//   3. ANSWERED — the day's looks as entries, newest first, and the question folded to
//      one line that re-opens the chips cleared. A day holds as many looks as the owner
//      makes (R9).
//
// ── THE RULES THAT ARE NOT OBVIOUS FROM THE TREE ─────────────────────────────
// • NOTHING IS PRE-SELECTED and NOTHING RE-SORTS ON A TAP (§3.1a, the round-2 product
//   read's first finding). The head words hold their positions while the card is open;
//   only the fold boundary reorders, never a tap.
// • THE PET IS CAPTURED AT THE FIRST SELECTION (T-11). `insertLook` never reads
//   `activePet` at save time; a header switch mid-draft clears the selection and SAYS
//   SO rather than silently re-pointing the words at another animal. This is C-9 in its
//   sharpest form: the record being written has a subject, and it is not "whoever is
//   selected when the owner presses Done".
// • DONE IS SILENT (T-10). Chips tick (`selectChip`); the commit does not, because a
//   look writes no symptom row and the app does not congratulate an owner for telling
//   it her cat is hiding. The silence is enforced in the store (`playCommitHaptic`).
// • THE EXITS PIN OUTSIDE THIS CARD (T-21). The way back and the Done bar are drawn by
//   Home as an absolute layer, because anything absolute in here scrolls away with the
//   card — which is the problem T-21 was written for. This card publishes the handles
//   through `store/uiStore.ts` and keeps the behaviour.
//
// The card is rendered only for an allowlisted, opted-in account whose pet has a
// vocabulary — cat or dog (CUL-864 brief 2, PM-ruled 2026-09-10: an Other pet has no
// Noticed card in v1, and `lookSpeciesOf` returns null rather than guessing a list).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, LayoutChangeEvent, Pressable, StyleSheet, Text, View, Animated } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import { SectionLabel } from '../ui/SectionLabel';
import { ThemedText } from '../ui/ThemedText';
import { LookChip } from './LookChip';
import { LookEmergencySheet } from './LookEmergencySheet';
import { useAllowlistFlag } from '../../hooks/useAppConfig';
import { useBetaOptIn } from '../../lib/betaFeatures';
import { useEvents } from '../../hooks/useEvents';
import { useAppActive } from '../../hooks/useAppActive';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { usePetStore } from '../../store/petStore';
import { useEventStore, type NyxEvent } from '../../store/eventStore';
import { useMomentStore } from '../../store/momentStore';
import { useUiStore } from '../../store/uiStore';
import { selectChip } from '../../lib/haptics';
import { insertLook, loadLookDays, answeredDays } from '../../lib/looks';
import { wordsToLocalText } from '../../lib/lookWordsCodec';
import { describeLook, gridChipLabel, gridSectionsFor, isLookRow, lookSummary } from '../../lib/lookDisplay';
import {
  LOOK_HEAD_WORDS,
  LOOK_OPENING_CHIP_KEY,
  LOOK_WORDS,
  lookSpeciesOf,
  lookWord,
  notHerselfLabel,
} from '../../constants/lookWords';
import {
  draftHasWord,
  draftToWrite,
  emptyDraft,
  toggleAbsence,
  toggleWordInDraft,
  type LookDraft,
} from '../../lib/lookSelection';
import {
  LOOK_ABSENCE_CHIP,
  LOOK_CARD_LABEL,
  LOOK_DONE,
  LOOK_FEWER_WORDS,
  LOOK_HINT,
  LOOK_MORE_WORDS,
  LOOK_PATTERNS_DOOR,
  LOOK_UNDO,
  lookDoneSummary,
  lookFirstLookLine,
  lookFoldedAsk,
  lookOpeningChipUnfoldLine,
  lookQuestion,
} from '../../lib/lookCard';
import { EMERGENCY_DOOR_LABEL, type EmergencyFacts } from '../../lib/lookEmergency';
import { loadEmergencyFacts, withTrialRefusal } from '../../lib/lookEmergencyFacts';
import { useGridDisclosure, useLookArrival } from '../motion/lookMotion';
import { NODE_DOT_RING, NODE_DOT_SIZE, NODE_TINT_DAY, nodeDotColors } from '../recap/nodeTints';
import { formatTime } from '../../lib/utils';

interface Props {
  /**
   * The diet trial's own refusal register for the ACTIVE pet, already fail-closed by
   * Home (`isAnimalNotEating` over a fresh input). Folded into the emergency door's
   * facts as an OR — a refusal either register can see is a refusal, and neither may
   * cancel the other. Optional so a test can render the card without a trial.
   */
  trialNotEating?: boolean;
  /** Measured by Home so the pinned exits know where this card is (C-22: a
   *  passthrough on `Card`, never a wrapper View that would change what it measures). */
  onLayout?: (event: LayoutChangeEvent) => void;
}

export function LookCard({ trialNotEating = false, onLayout }: Props) {
  const activePet = usePetStore((s) => s.activePet);
  const pets = usePetStore((s) => s.pets);
  // The B-712 two-gate shape, both hooks called unconditionally then combined: server
  // allowlist (eligibility) × local opt-in. Being in the cohort turns nothing on.
  const eligible = useAllowlistFlag('daily_look');
  const optedIn = useBetaOptIn('daily_look');
  const { todayEvents } = useEvents();
  const prependEvent = useEventStore((s) => s.prependEvent);
  const showLook = useMomentStore((s) => s.showLook);
  const undo = useMomentStore((s) => s.undo);
  const momentPayload = useMomentStore((s) => s.payload);
  const momentVisible = useMomentStore((s) => s.visible);
  const momentRemoved = useMomentStore((s) => s.removed);
  const setCaptureOverlay = useUiStore((s) => s.setCaptureOverlay);
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();

  const [draft, setDraft] = useState<LookDraft>(emptyDraft);
  const [gridOpen, setGridOpen] = useState(false);
  const [reopened, setReopened] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [capturedPetId, setCapturedPetId] = useState<string | null>(null);
  const [switchNotice, setSwitchNotice] = useState<string | null>(null);
  const [justWritten, setJustWritten] = useState<string | null>(null);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [emergencyFacts, setEmergencyFacts] = useState<EmergencyFacts | null>(null);
  // `null` until the read answers — a read that hasn't answered is never an empty
  // record (C-12), and "this is the first look" is exactly the claim a premature
  // empty would make wrongly.
  const [everLooked, setEverLooked] = useState<boolean | null>(null);

  const species = lookSpeciesOf(activePet?.species);
  const live = eligible && optedIn && species !== null && activePet !== null;
  const sex = activePet?.sex ?? 'unknown';
  const petName = activePet?.name ?? '';

  const disclosure = useGridDisclosure({ open: gridOpen, reducedMotion, appActive });

  // Today's looks, from the rows Home already loaded — one read, shared with
  // TodayZone, rather than a second query that could disagree with it about the same
  // day. `todayEvents` is ordered `occurred_at DESC`, which is newest-first (R9).
  const entries = useMemo(() => todayEvents.filter((e) => isLookRow(e)), [todayEvents]);
  const asking = entries.length === 0 || reopened;

  const arrival = useLookArrival({
    entryKey: justWritten,
    // The FACT, not the presentation (C-30): "this card just wrote that row". The same
    // row renders identically when Home re-reads it a minute later, and re-drawing it
    // then would announce a record the owner did not just make.
    animate: justWritten !== null,
    reducedMotion,
    appActive,
  });

  // Has this pet ever been looked at? Only ever used to decide whether the day-1 line
  // renders, so it is read once per pet and never counted aloud.
  useEffect(() => {
    if (!live || !activePet) return;
    let cancelled = false;
    setEverLooked(null);
    loadLookDays(activePet.id)
      .then((rows) => {
        if (!cancelled) setEverLooked(answeredDays(rows) > 0);
      })
      .catch((e) => console.warn('[LookCard] look history read failed:', e));
    return () => {
      cancelled = true;
    };
  }, [live, activePet?.id, todayEvents.length]);

  // T-11 — THE PET SWITCH. A draft belongs to the pet it was started for; if the header
  // moves, the words do not follow. Cleared and SAID, never silently re-pointed.
  useEffect(() => {
    if (!capturedPetId || !activePet || activePet.id === capturedPetId) return;
    const from = pets.find((p) => p.id === capturedPetId)?.name ?? null;
    setDraft(emptyDraft());
    setCapturedPetId(null);
    setGridOpen(false);
    setSwitchNotice(
      from
        ? `Those words were about ${from}. Nothing was saved — this is ${activePet.name}’s question now.`
        : `Nothing was saved — this is ${activePet.name}’s question now.`,
    );
  }, [activePet?.id, capturedPetId, pets, activePet]);

  const summary = live ? lookDoneSummary(petName, draft, { species: activePet?.species, sex }) : null;

  const closeGrid = useCallback(() => {
    disclosure.beforeCommit(false);
    setGridOpen(false);
  }, [disclosure]);

  const captureSubject = useCallback(() => {
    setSwitchNotice(null);
    setCapturedPetId((current) => current ?? activePet?.id ?? null);
  }, [activePet?.id]);

  const onWord = useCallback(
    (key: string) => {
      selectChip();
      captureSubject();
      setDraft((d) => toggleWordInDraft(d, key));
    },
    [captureSubject],
  );

  const onAbsence = useCallback(() => {
    selectChip();
    captureSubject();
    setDraft((d) => toggleAbsence(d));
  }, [captureSubject]);

  const onOpeningChip = useCallback(() => {
    selectChip();
    captureSubject();
    setDraft((d) => toggleWordInDraft(d, LOOK_OPENING_CHIP_KEY));
    // The caret's promise: it opens the grid in place. Selecting the chief complaint
    // and offering the specifics is one gesture (§3.1a).
    if (!gridOpen) {
      disclosure.beforeCommit(true);
      setGridOpen(true);
    }
  }, [captureSubject, disclosure, gridOpen]);

  const handleDone = useCallback(async () => {
    const write = draftToWrite(draft);
    const petId = capturedPetId ?? activePet?.id ?? null;
    // The subject of the write is the captured pet, and it must still be the pet on
    // screen — the switch effect above clears the draft, so this can only fail if the
    // two ever disagreed, which is the case worth refusing rather than guessing.
    if (!write || !petId || submitting || petId !== activePet?.id) return;
    const subject = pets.find((p) => p.id === petId) ?? activePet;
    const subjectSpecies = lookSpeciesOf(subject?.species);
    if (!subjectSpecies) return;
    setSubmitting(true);
    try {
      const occurredAt = new Date();
      const result = await insertLook({
        petId,
        species: subjectSpecies,
        outcome: write.outcome,
        words: write.words,
        occurredAt,
        // C-10 — clock-seeded, so the row says so. A "Change time" edit is the record
        // screen's (N-3) and is the only thing that may move this to 'manual'.
        occurredAtSource: 'now',
      });
      // The optimistic row, in the shape `getTimeline` would have returned it, so the
      // arrival renders through the same resolver as every other look surface.
      prependEvent({
        id: result.eventId,
        pet_id: petId,
        event_type: 'check_in',
        occurred_at: result.occurredAtIso,
        severity: null,
        notes: null,
        source: 'manual',
        deleted_at: null,
        created_at: result.now,
        updated_at: result.now,
        occurred_at_confidence: 'witnessed',
        look_outcome: write.outcome,
        look_words: wordsToLocalText([...write.words]),
        look_note: null,
      } as NyxEvent);
      // The completion register — the dwell, the Undo target and the staleness guard
      // (C-20). It draws no card of its own: R14 puts this look's arrival inside this
      // card, which is what the entry below is.
      showLook({
        eventId: result.eventId,
        petId,
        occurredAt: result.occurredAtIso,
        outcome: write.outcome,
        words: write.words,
      });
      setJustWritten(result.eventId);
      setDraft(emptyDraft());
      setCapturedPetId(null);
      setReopened(false);
      if (gridOpen) closeGrid();
    } catch (e) {
      // A failed write is always said (C-12). Calm, no error code, points at the one
      // thing the owner can do.
      console.error('[LookCard] insertLook failed:', e);
      Alert.alert('Couldn’t save that', 'Please try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  }, [activePet, capturedPetId, closeGrid, draft, gridOpen, pets, prependEvent, showLook, submitting]);

  // Undo — the shared reversal (C-20), reached through the store so this card cannot
  // invent a second delete path. The words come back still selected, chips open: a slip
  // costs nothing, and the look is the only thing that was written.
  const handleUndo = useCallback(
    async (eventId: string, restore: LookDraft) => {
      const result = await undo(eventId);
      if (result === 'removed') {
        setDraft(restore);
        setCapturedPetId(activePet?.id ?? null);
        setReopened(true);
        setJustWritten(null);
        return;
      }
      if (result === 'failed') {
        // The row is still in the record and the owner has been told it is not — the
        // one unrecoverable lie this surface could tell, so it is said instead.
        Alert.alert('Couldn’t undo that', 'The look is still saved. Please try again.');
      }
    },
    [activePet?.id, undo],
  );

  const openEmergency = useCallback(() => {
    setEmergencyOpen(true);
    if (!activePet) return;
    loadEmergencyFacts(activePet.id)
      .then((facts) => setEmergencyFacts(withTrialRefusal(facts, trialNotEating)))
      .catch(() => setEmergencyFacts(null));
  }, [activePet?.id, trialNotEating, activePet]);

  // Publish the pinned exits while the grid is open, and clear them on every path out
  // — including unmount, which is the backstop that keeps a stuck flag from costing the
  // owner the FAB (store/uiStore.ts's fail-open note).
  useEffect(() => {
    if (!live || !gridOpen) {
      setCaptureOverlay(null);
      return;
    }
    setCaptureOverlay({
      summary,
      inViewport: true,
      busy: submitting,
      onBack: closeGrid,
      onDone: summary ? handleDone : null,
    });
  }, [live, gridOpen, summary, submitting, closeGrid, handleDone, setCaptureOverlay]);

  useEffect(() => () => setCaptureOverlay(null), [setCaptureOverlay]);

  if (!live || !activePet || !species) return null;

  const headWords = LOOK_HEAD_WORDS[species];
  const sections = gridSectionsFor(species, headWords, sex);
  const openingLabel = notHerselfLabel(sex);

  return (
    <>
      <Card onLayout={onLayout} testID="look-card">
        <View style={styles.headerRow}>
          <SectionLabel label={LOOK_CARD_LABEL} header />
          <Pressable
            onPress={() => router.push('/insights')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open Patterns"
          >
            <ThemedText style={styles.door}>{LOOK_PATTERNS_DOOR}</ThemedText>
          </Pressable>
        </View>

        {/* THE ANSWERED DAY — the looks as entries, newest first (R9, R14). */}
        {entries.length > 0 && (
          <View style={styles.entries} testID="look-entries">
            {entries.map((row) => (
              <LookEntry
                key={row.id}
                row={row}
                pet={{ species: activePet.species, sex }}
                isNewest={row.id === justWritten}
                arrival={arrival}
                undoable={
                  momentVisible &&
                  !momentRemoved &&
                  momentPayload?.kind === 'look' &&
                  momentPayload.eventId === row.id
                }
                onUndo={handleUndo}
              />
            ))}
          </View>
        )}

        {/* The question — folded to one line once the day holds a look, and it re-opens
            the chips in place, cleared. That row IS the second look (R9). */}
        {!asking ? (
          <Pressable
            onPress={() => {
              setReopened(true);
              setDraft(emptyDraft());
            }}
            style={styles.foldedAsk}
            accessibilityRole="button"
            accessibilityLabel={`${lookFoldedAsk(petName)} Answer again.`}
            testID="look-folded-ask"
          >
            <ThemedText style={styles.foldedAskText}>{lookFoldedAsk(petName)}</ThemedText>
            {/* geist-ok: Icon glyph, not copy — the caret says "opens in place". */}
            <Text style={styles.caret}>▾</Text>
          </Pressable>
        ) : (
          <>
            <ThemedText style={styles.question}>{lookQuestion(petName, sex)}</ThemedText>
            {everLooked === false && entries.length === 0 && (
              <ThemedText style={styles.firstLook}>{lookFirstLookLine(sex)}</ThemedText>
            )}
            {switchNotice && (
              <ThemedText style={styles.switchNotice} testID="look-switch-notice">
                {switchNotice}
              </ThemedText>
            )}

            {/* THE FIRST ROW, at equal cost. Two chips in v1: the intake router lands
                with its own sheet in N-3b (CUL-870), under the PM's CUL-863 ruling —
                a chip routed to today's picker "for now" IS the mis-record §4.5 was
                written against. The row is a list so the third chip inserts between
                these two without re-laying it out. */}
            <View style={styles.row}>
              <LookChip
                label={LOOK_ABSENCE_CHIP}
                selected={draft.kind === 'absence'}
                onPress={onAbsence}
                reducedMotion={reducedMotion}
                testID="look-absence-chip"
              />
              <Pressable
                onPress={onOpeningChip}
                style={styles.openingWrap}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: draftHasWord(draft, LOOK_OPENING_CHIP_KEY) }}
                accessibilityLabel={openingLabel}
                accessibilityHint="Opens the full list of words"
                testID="look-opening-chip"
              >
                <LookChipFacade
                  label={openingLabel}
                  selected={draftHasWord(draft, LOOK_OPENING_CHIP_KEY)}
                />
              </Pressable>
            </View>

            {/* THE COMPACT HEAD WORDS — the seven, exempt from the unfold (T-13). They
                hold their positions while the card is open; nothing re-sorts on a tap. */}
            {!gridOpen && (
              <View style={styles.row} testID="look-head-words">
                {headWords.map((key) => {
                  const word = lookWord(species, key);
                  if (!word) return null;
                  return (
                    <LookChip
                      key={key}
                      label={word.head}
                      hint={word.gloss}
                      selected={draftHasWord(draft, key)}
                      onPress={() => onWord(key)}
                      reducedMotion={reducedMotion}
                      testID={`look-chip-${key}`}
                    />
                  );
                })}
              </View>
            )}

            {!gridOpen ? (
              <Pressable
                onPress={() => {
                  disclosure.beforeCommit(true);
                  setGridOpen(true);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Show the full list of words"
                testID="look-more-words"
              >
                <ThemedText style={styles.door}>{LOOK_MORE_WORDS}</ThemedText>
              </Pressable>
            ) : (
              <>
                {/* THE ROW ORDER IS RULED: first row · door · way back · families. The
                    emergency door sits directly under the first row, where an owner who
                    is not yet worried will meet it (§3.7). */}
                <Pressable
                  onPress={openEmergency}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={EMERGENCY_DOOR_LABEL.replace(' ›', '')}
                  style={styles.emergencyDoor}
                  testID="look-emergency-door"
                >
                  <ThemedText style={styles.emergencyDoorText}>{EMERGENCY_DOOR_LABEL}</ThemedText>
                </Pressable>

                {/* The way back, in its own row at the TOP of the grid (T-21). Home pins
                    a copy of it once this row scrolls off; the row itself never moves,
                    so nothing reflows as the owner scrolls. */}
                <Pressable
                  onPress={closeGrid}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Show fewer words"
                  testID="look-fewer-words"
                >
                  <ThemedText style={styles.door}>{LOOK_FEWER_WORDS}</ThemedText>
                </Pressable>

                {draftHasWord(draft, LOOK_OPENING_CHIP_KEY) && (
                  <ThemedText style={styles.openingLine}>
                    {lookOpeningChipUnfoldLine(sex)}
                  </ThemedText>
                )}

                <Animated.View style={disclosure.landStyle} testID="look-grid">
                  {sections.map((section) => (
                    <View key={section.label ?? '__head'} style={styles.section}>
                      {section.label && (
                        <ThemedText style={styles.sectionLabel}>{section.label}</ThemedText>
                      )}
                      <View style={styles.row}>
                        {section.words.map((word) => (
                          <LookChip
                            key={word.key}
                            // The full label on the grid — *head, gloss* — never the
                            // head alone (§4.1 rule 12: "Lip-licking" lost the findable
                            // half).
                            label={gridChipLabel(word)}
                            selected={draftHasWord(draft, word.key)}
                            onPress={() => onWord(word.key)}
                            reducedMotion={reducedMotion}
                            testID={`look-grid-chip-${word.key}`}
                          />
                        ))}
                      </View>
                    </View>
                  ))}
                </Animated.View>
              </>
            )}

            {/* The Done bar, in the flow. While the grid is open Home also pins a copy
                at the bottom of the screen; this row keeps its space either way. */}
            {summary ? (
              <View style={styles.doneRow} testID="look-done-row">
                <ThemedText style={styles.summary}>{summary}</ThemedText>
                <Pressable
                  onPress={handleDone}
                  disabled={submitting}
                  style={styles.doneButton}
                  accessibilityRole="button"
                  accessibilityLabel={`${LOOK_DONE}. ${summary}`}
                  testID="look-done"
                >
                  <ThemedText style={styles.doneText}>{LOOK_DONE}</ThemedText>
                </Pressable>
              </View>
            ) : (
              <ThemedText style={styles.hint}>{LOOK_HINT}</ThemedText>
            )}
          </>
        )}
      </Card>

      <LookEmergencySheet
        visible={emergencyOpen}
        species={species}
        facts={emergencyFacts}
        onClose={() => setEmergencyOpen(false)}
      />
    </>
  );
}

/**
 * The opening chip's face. It reuses `LookChip`'s look but not its Pressable, because
 * this chip does two things in one tap (select the chief complaint AND open the grid)
 * and the wrapper owns that. Split by HOST rather than by a mode flag (C-7): one
 * responder, one accessibility element, no nested touchables.
 */
function LookChipFacade({ label, selected }: { label: string; selected: boolean }) {
  return (
    <View pointerEvents="none">
      <LookChip label={label} selected={selected} onPress={() => {}} />
    </View>
  );
}

/** One look in the day's list — the hollow ring, the words, the hour, and Undo where
 *  the chevron will be (§3.1a, T-15). */
function LookEntry({
  row,
  pet,
  isNewest,
  arrival,
  undoable,
  onUndo,
}: {
  row: NyxEvent;
  pet: { species?: string | null; sex: 'male' | 'female' | 'unknown' };
  isNewest: boolean;
  arrival: ReturnType<typeof useLookArrival>;
  undoable: boolean;
  onUndo: (eventId: string, restore: LookDraft) => void;
}) {
  const described = describeLook(row, pet);
  // The ONE resolver, so this entry, History's row and the record screen name the same
  // look identically (`lib/lookDisplay.ts`). Null is a look this build cannot describe
  // — the row then reads as the bare act and NEVER falls through to the absence phrase.
  const words = lookSummary(described);
  const { fill, ring } = nodeDotColors('look', NODE_TINT_DAY, theme.colorSurface);
  // What Undo puts back: the words as they were chosen. The absence row restores as the
  // absence, which is a real answer and not an empty draft (L-6).
  const restore: LookDraft =
    described.kind === 'absence'
      ? { kind: 'absence' }
      : { kind: 'words', words: described.words.map((w) => w.key) };

  return (
    <View style={styles.entry}>
      <Animated.View
        style={[
          styles.ring,
          { backgroundColor: fill, borderColor: ring },
          isNewest ? arrival.ringStyle : null,
        ]}
      />
      <Animated.View style={[styles.entryBody, isNewest ? arrival.wordsStyle : null]}>
        <ThemedText style={styles.entryWords}>{words ?? 'Noticed'}</ThemedText>
      </Animated.View>
      <ThemedText style={styles.entryTime}>{formatTime(new Date(row.occurred_at))}</ThemedText>
      {undoable ? (
        <Pressable
          onPress={() => onUndo(row.id, restore)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Undo. ${words ?? 'the look'}`}
          testID={`look-undo-${row.id}`}
        >
          <ThemedText style={styles.undo}>{LOOK_UNDO}</ThemedText>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => router.push(`/event/${row.id}`)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Open this look. ${words ?? ''}`}
          testID={`look-open-${row.id}`}
        >
          {/* geist-ok: Icon glyph, not copy. */}
          <Text style={styles.caret}>›</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  door: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
  question: {
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextPrimary,
    marginTop: theme.space1,
  },
  firstLook: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    marginTop: theme.space0_5,
  },
  switchNotice: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    marginTop: theme.space0_5,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // C-5 — two chips facing each other need the sum of their facing reach. LookChip's
    // hitSlop is vertical-only, so the ROW gap is the visual one and the COLUMN gap
    // carries the 6pt vertical reach on each side.
    columnGap: theme.space1,
    rowGap: 12,
    marginTop: theme.space2,
  },
  openingWrap: {
    // The wrapper is the responder; the facade inside is inert (see LookChipFacade).
    borderRadius: theme.radiusFull,
  },
  section: { marginTop: theme.space1 },
  sectionLabel: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: theme.space2,
  },
  openingLine: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    marginTop: theme.space1,
  },
  emergencyDoor: { marginTop: theme.space2 },
  emergencyDoorText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  hint: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextSecondary,
    marginTop: theme.space2,
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space2,
    marginTop: theme.space2,
  },
  summary: {
    flex: 1,
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextPrimary,
  },
  doneButton: {
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space3,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorNeutralDark,
    minHeight: 44,
    justifyContent: 'center',
  },
  doneText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextOnDark,
  },
  entries: { marginTop: theme.space1 },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    paddingVertical: theme.space1,
  },
  ring: {
    width: NODE_DOT_SIZE,
    height: NODE_DOT_SIZE,
    borderRadius: NODE_DOT_SIZE / 2,
    borderWidth: NODE_DOT_RING,
  },
  entryBody: { flex: 1 },
  entryWords: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextPrimary,
  },
  entryTime: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
  },
  undo: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
  foldedAsk: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.space1,
    minHeight: 44,
  },
  foldedAskText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  caret: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
});
