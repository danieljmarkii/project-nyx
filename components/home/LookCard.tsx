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
//   3. THE ARRIVAL — the look just written, as an entry with its hour and *Undo*, for
//      the completion register's dwell. Then the question comes back, cleared.
//
// WHAT THE ARRIVAL IS NOT, AND WHY THE LINE IS HERE. §10 gives the persistent TODAY
// LIST to N-4b (CUL-873) — the entries that stay, the folded ask row, the receipts, the
// coverage footer, the list cap — and it gives that PR the withheld predicate
// (`lib/lookWithheld.ts`, T-20) in the same breath. That pairing is not an accident of
// sequencing: a list that persists can draw *nothing unusual* on Home under a pet whose
// record carries a live intake concern, and the withheld entry is what stops it (floor
// item 12, Dr. Chen's ledger row 15). So this PR renders ONE entry, for the dwell, for
// the look the owner has this second finished making — which is the completion beat
// N-4a owns and the only home Undo has — and the list arrives with its protection.
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
import { CHIP_VERTICAL_REACH, LookChip } from './LookChip';
import { LookEmergencySheet } from './LookEmergencySheet';
import { useAllowlistFlag } from '../../hooks/useAppConfig';
import { useBetaOptIn } from '../../lib/betaFeatures';
import { useEvents } from '../../hooks/useEvents';
import { useAppActive } from '../../hooks/useAppActive';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { usePetStore } from '../../store/petStore';
import { useEventStore, type NyxEvent } from '../../store/eventStore';
import { LOOK_DWELL_MS, useMomentStore } from '../../store/momentStore';
import { useUiStore } from '../../store/uiStore';
import { openMenu, selectChip } from '../../lib/haptics';
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
  intakeDoorLabel,
  lookDoneSummary,
  lookFirstLookLine,
  lookOpeningChipUnfoldLine,
  lookQuestion,
} from '../../lib/lookCard';
import { EMERGENCY_DOOR_LABEL, type EmergencyRead } from '../../lib/lookEmergency';
import { loadEmergencyFacts, withTrialRefusal } from '../../lib/lookEmergencyFacts';
import { useGridDisclosure, useLookArrival } from '../motion/lookMotion';

/** The last half-second of the dwell, in which *Undo* fades before the chevron takes its
 *  slot (T-15). A tap during the fade still undoes. */
const UNDO_FADE_MS = 500;

/** Two chips stacked in a wrapping row face each other with their full vertical reach
 *  between them, so the row gap is the SUM of the two hitSlops — derived from the chip's
 *  own constant, never a number that happens to be twice it (C-5). */
const CHIP_ROW_GAP = CHIP_VERTICAL_REACH * 2;

/** The reach a wrapper must declare when it is the responder for an inert chip — the
 *  chip's own, never a number that happens to equal it today. */
const CHIP_REACH_SLOP = { top: CHIP_VERTICAL_REACH, bottom: CHIP_VERTICAL_REACH } as const;
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
  const openIntakeDoor = useUiStore((s) => s.openIntakeDoor);
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();

  const [draft, setDraft] = useState<LookDraft>(emptyDraft);
  const [gridOpen, setGridOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [capturedPetId, setCapturedPetId] = useState<string | null>(null);
  const [switchNotice, setSwitchNotice] = useState<string | null>(null);
  const [justWritten, setJustWritten] = useState<string | null>(null);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  // Three states, not two (`EmergencyRead`): a read still in flight must not render the
  // same page as a read that failed, or the door's imperative flashes on every open.
  const [emergencyRead, setEmergencyRead] = useState<EmergencyRead>({ status: 'loading' });
  // `null` until the read answers — a read that hasn't answered is never an empty
  // record (C-12), and "this is the first look" is exactly the claim a premature
  // empty would make wrongly.
  const [everLooked, setEverLooked] = useState<boolean | null>(null);

  const species = lookSpeciesOf(activePet?.species);
  const live = eligible && optedIn && species !== null && activePet !== null;
  const sex = activePet?.sex ?? 'unknown';
  const petName = activePet?.name ?? '';

  // The live subject, read at the instant a late answer arrives rather than closed over
  // when the read started (the `foldMotion` ref idiom). Written during render, so it is
  // always the pet on screen — and it is a REF rather than a store read so this
  // component depends on the store's shape in exactly one place, the selector above.
  const activePetIdRef = useRef<string | null>(null);
  activePetIdRef.current = activePet?.id ?? null;
  // Read at the instant the switch effect fires rather than closed over — the effect and
  // the write are in different ticks, and only the ref knows which way round they landed.
  const submittingRef = useRef(false);
  submittingRef.current = submitting;

  const disclosure = useGridDisclosure({ open: gridOpen, reducedMotion, appActive });

  // The arrival: the ONE look this card just wrote, read back from the row it
  // optimistically prepended so the entry renders through the same resolver every other
  // look surface uses.
  //
  // SCOPED BY THE ROW'S OWN PET, not by what the loader was asked for (C-9).
  // `loadTodayEvents` re-queries on a pet switch, but the store holds the PREVIOUS pet's
  // rows until that read answers — so without this the card could render another
  // animal's look, with an Undo beside it, under this animal's question.
  const beatRow = useMemo(
    () =>
      justWritten
        ? todayEvents.find(
            (e) => e.id === justWritten && isLookRow(e) && e.pet_id === activePet?.id,
          ) ?? null
        : null,
    [todayEvents, justWritten, activePet?.id],
  );
  // The register decides how long the beat holds, not this card — one clock (C-20's
  // reasoning applied to the dwell). When it lets go, the question comes back cleared.
  const beatLive =
    beatRow !== null &&
    momentVisible &&
    !momentRemoved &&
    momentPayload?.kind === 'look' &&
    momentPayload.eventId === beatRow.id;
  const asking = !beatLive;

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
  //
  // The unknown state is reset ONLY when the pet changes, never on a re-read: resetting
  // it on every refresh would blink the day-1 line off and back on each time an
  // unrelated row lands, and a line that says "this is the first look" should not
  // flicker while the owner is reading it.
  const everLookedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!live || !activePet) return;
    let cancelled = false;
    if (everLookedFor.current !== activePet.id) {
      everLookedFor.current = activePet.id;
      setEverLooked(null);
    }
    loadLookDays(activePet.id)
      .then((rows) => {
        if (!cancelled) setEverLooked(answeredDays(rows) > 0);
      })
      .catch((e) => console.warn('[LookCard] look history read failed:', e));
    return () => {
      cancelled = true;
    };
  }, [live, activePet?.id, todayEvents.length, activePet]);

  // T-11 — THE PET SWITCH. A draft belongs to the pet it was started for; if the header
  // moves, the words do not follow. Cleared and SAID, never silently re-pointed.
  //
  // The notice is cleared by ANY pet change, including a switch back. It used to clear
  // only on the next chip tap, so an owner who flipped to Juniper and straight back read
  // "Those words were about Mochi … this is Juniper's question now" over a card that had
  // gone back to asking about Mochi — the notice naming the wrong pet on the one screen
  // whose whole job is naming the right one.
  const noticeFor = useRef<string | null>(null);
  useEffect(() => {
    if (activePet && noticeFor.current !== null && noticeFor.current !== activePet.id) {
      noticeFor.current = null;
      setSwitchNotice(null);
    }
    if (!capturedPetId || !activePet || activePet.id === capturedPetId) return;
    const from = pets.find((p) => p.id === capturedPetId)?.name ?? null;
    setDraft(emptyDraft());
    setCapturedPetId(null);
    setGridOpen(false);
    noticeFor.current = activePet.id;
    // "Nothing was saved" is only true if nothing was. A switch landing while
    // `insertLook` is in flight — a local SQLite write, so a handful of milliseconds, but
    // reachable — means the words DID save, for the pet just left, and telling her
    // otherwise is the one unrecoverable lie a completion surface can tell. Two
    // sentences, one for each fact.
    const saved = submittingRef.current;
    setSwitchNotice(
      from
        ? `Those words were about ${from}. ${saved ? `They saved to ${from}’s record` : 'Nothing was saved'} — this is ${activePet.name}’s question now.`
        : `${saved ? 'That look was saved' : 'Nothing was saved'} — this is ${activePet.name}’s question now.`,
    );
  }, [activePet?.id, capturedPetId, pets, activePet]);

  const summary = live ? lookDoneSummary(petName, draft, { species: activePet?.species, sex }) : null;

  const closeGrid = useCallback(() => {
    disclosure.beforeCommit(false);
    setGridOpen(false);
  }, [disclosure]);

  const captureSubject = useCallback(() => {
    noticeFor.current = null;
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

  /**
   * THE INTAKE ROUTER (§4.5, T-3) — the one control in this row that is not a look word.
   *
   * It writes NOTHING to the look and touches NOTHING on this card: no `captureSubject`
   * (the pet it captures is a pet the look is being made about, and no look is being
   * made), no draft change, no selection. The words the owner already tapped stay
   * exactly where they are while the sheet is up, and a dismiss returns her to them
   * untouched — which is the promise §3.1a extracts from the round-3 and round-4 product
   * reads: she came through a door labelled *Didn't eat* and has every reason to believe
   * she told the app so.
   *
   * `openMenu` rather than `selectChip`: the chip haptics are a SELECTION vocabulary
   * (T-10, every chip in this row ticks because a tap changes what the look will say).
   * Nothing is selected here — a surface opens.
   *
   * The pet rides on the request rather than being re-read when the meal is written
   * (C-9 / T-11): the door was tapped on ONE animal's card.
   */
  const onIntakeDoor = useCallback(() => {
    if (!activePet) return;
    openMenu();
    openIntakeDoor({
      petId: activePet.id,
      petName: activePet.name,
      sex: activePet.sex ?? 'unknown',
      cardHasSelections: draft.kind !== 'empty',
    });
  }, [activePet, draft.kind, openIntakeDoor]);

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
    async (eventId: string, restore: LookDraft, rowPetId: string) => {
      const result = await undo(eventId);
      if (result === 'removed') {
        // The reversal is unconditional — the row is gone and should be. Putting the
        // WORDS back is not: they describe `rowPetId`, and handing them to a card that
        // has since become another animal's question would let a switch-then-undo save
        // one pet's observation against the other's name (T-11, the same rule the draft
        // effect above enforces on the way in).
        if (rowPetId === activePet?.id) {
          setDraft(restore);
          setCapturedPetId(activePet?.id ?? null);
        }
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
    // Re-read on every open, and start from `loading` rather than from the previous
    // answer: the facts are 24 hours of a record that can change between opens, and on a
    // pet switch the held answer would belong to the other animal.
    setEmergencyRead({ status: 'loading' });
    setEmergencyOpen(true);
    if (!activePet) {
      setEmergencyRead({ status: 'failed' });
      return;
    }
    const petId = activePet.id;
    loadEmergencyFacts(petId)
      .then((facts) => {
        const merged = withTrialRefusal(facts, trialNotEating);
        // The loader returns null on a failed read — the one case that falls through to
        // the imperative (fail closed). A late answer for a pet the owner has since
        // switched away from is dropped rather than rendered under the new pet's name.
        if (activePetIdRef.current !== petId) return;
        setEmergencyRead(merged ? { status: 'ready', facts: merged } : { status: 'failed' });
      })
      .catch(() => setEmergencyRead({ status: 'failed' }));
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
  // The head block is `sections[0]` (label null) and is rendered in its own row above,
  // so the unfolded grid draws the families alone.
  const families = sections.filter((section) => section.label !== null);
  const openingLabel = notHerselfLabel(sex);
  // E-16 — one label, and PET COUNT is the whole fork (never species, never the feeding
  // arrangement). `pets` is the active household; an archived pet is not a second animal
  // whose bowl the owner is choosing between.
  const intakeLabel = intakeDoorLabel(pets.length > 1, sex);
  // T-12's travel-up: what she chose from the grid, minus the seven that are already in
  // the row and the opening chip, which has its own place in the first row.
  const travelledUp =
    draft.kind === 'words'
      ? draft.words.filter((k) => !headWords.includes(k) && k !== LOOK_OPENING_CHIP_KEY)
      : [];

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

        {/* THE ARRIVAL — the look just made, for the register's dwell (§3.1a, R14). The
            list that KEEPS them is N-4b's, with the withheld predicate that protects it
            (see the header). */}
        {beatLive && beatRow && (
          <View style={styles.entries} testID="look-entries">
            <LookEntry
              row={beatRow}
              pet={{ species: activePet.species, sex }}
              arrival={arrival}
              onUndo={handleUndo}
            />
          </View>
        )}

        {asking && (
          <>
            <ThemedText style={styles.question}>{lookQuestion(petName, sex)}</ThemedText>
            {everLooked === false && !beatLive && (
              <ThemedText style={styles.firstLook}>{lookFirstLookLine(sex)}</ThemedText>
            )}
            {switchNotice && (
              <ThemedText style={styles.switchNotice} testID="look-switch-notice">
                {switchNotice}
              </ThemedText>
            )}

            {/* THE FIRST ROW, at equal cost — the absence chip, the intake router, and
                the opening chip. All three are one tap, which is the safety rule §3.2
                falsified Door D over: the observation that matters must never cost more
                taps than the reassuring one.

                The router landed here in N-3b (CUL-870) WITH the sheet it opens, under
                the PM's CUL-863 ruling: a chip routed at today's picker "for now" IS the
                mis-record §4.5 was written against, and a chip that opens nothing is
                worse. N-4a built this row as a list precisely so this was an insertion
                and no chip beside it moved. */}
            <View style={styles.row}>
              <LookChip
                label={LOOK_ABSENCE_CHIP}
                selected={draft.kind === 'absence'}
                onPress={onAbsence}
                reducedMotion={reducedMotion}
                testID="look-absence-chip"
              />
              <Pressable
                onPress={onIntakeDoor}
                style={styles.openingWrap}
                // A BUTTON, not a checkbox. The two chips either side of it toggle what
                // the look will say; this one opens a surface and leaves the look alone,
                // and a `checked` state on it would be a claim that a tap recorded
                // something (C-7: `disabled`/state is an accessibility CLAIM).
                accessibilityRole="button"
                accessibilityLabel={intakeLabel}
                // Says what the visible label cannot: where it goes (C-8 — a hint earns
                // its place only by adding to the announcement).
                accessibilityHint={`Opens a new meal to say how much ${petName} ate`}
                // The row's own vertical reach, declared here because this wrapper IS
                // the responder and the chip inside it is inert — and DERIVED from the
                // chip's own constant rather than restated as a number, which is the
                // same rule `CHIP_ROW_GAP` below obeys (C-5). A hardcoded 6 here drifts
                // silently the day `CHIP_VERTICAL_REACH` is retuned, while the row gap
                // that depends on it moves.
                hitSlop={CHIP_REACH_SLOP}
                testID="look-intake-door"
              >
                {/* Never a selected state: the router is not a look word (T-3), so there
                    is no draft for it to be lit from. */}
                <LookChipFacade label={intakeLabel} selected={false} />
              </Pressable>
              <Pressable
                onPress={onOpeningChip}
                style={styles.openingWrap}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: draftHasWord(draft, LOOK_OPENING_CHIP_KEY) }}
                accessibilityLabel={openingLabel}
                accessibilityHint="Opens the full list of words"
                // The same vertical reach every other chip in this row has
                // (`LookChip`'s own). This wrapper IS the responder — the chip inside it
                // is inert — so the reach has to be declared here, and dropping it left
                // one sub-44pt target in a row of compliant ones (C-5). Derived, for the
                // reason the router chip above states.
                hitSlop={CHIP_REACH_SLOP}
                testID="look-opening-chip"
              >
                <LookChipFacade
                  label={openingLabel}
                  selected={draftHasWord(draft, LOOK_OPENING_CHIP_KEY)}
                />
              </Pressable>
            </View>

            {/* THE HEAD WORDS — the seven, exempt from the unfold (T-13).
                THEY NEVER MOVE (§3.1a). The first cut gated this row on `!gridOpen` and
                re-rendered the same seven inside the grid's animated body, which is a
                move in every sense that matters: the chip under the owner's thumb left,
                faded back in two rows lower and at a new width. Round 2's blocking
                finding, in a third mechanism. So the row is rendered in ONE place, in
                one position, in both states — what changes when the grid opens is the
                LABEL (each head word gains its gloss, §3.1a) and nothing else.

                Behind them, the words she chose from the grid TRAVEL UP here on fold
                (T-12), in the order chosen, so what she picked is never behind the door
                she closed. They are only drawn while the grid is shut — open, each one
                is still lit in its own family. */}
            <View style={styles.row} testID="look-head-words">
              {headWords.map((key) => {
                const word = lookWord(species, key);
                if (!word) return null;
                return (
                  <LookChip
                    key={key}
                    label={gridOpen ? gridChipLabel(word) : word.head}
                    hint={gridOpen ? null : word.gloss}
                    selected={draftHasWord(draft, key)}
                    onPress={() => onWord(key)}
                    reducedMotion={reducedMotion}
                    testID={`look-chip-${key}`}
                  />
                );
              })}
              {!gridOpen &&
                travelledUp.map((key) => {
                  const word = lookWord(species, key);
                  if (!word) return null;
                  return (
                    <LookChip
                      key={key}
                      label={word.head}
                      hint={word.gloss}
                      selected
                      onPress={() => onWord(key)}
                      reducedMotion={reducedMotion}
                      testID={`look-travelled-${key}`}
                    />
                  );
                })}
            </View>

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
                  {/* The FAMILIES only. `gridSectionsFor` returns the head block first
                      (unlabelled); it is rendered above, where it already was, and is
                      dropped here so the seven are never drawn twice. */}
                  {families.map((section) => (
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

            {/* The hint stays. It used to share this slot with the Done bar, which put
                the sentence explaining that more than one word can be true on screen
                only until the moment the owner tapped one — i.e. it vanished exactly
                when it became true. */}
            <ThemedText style={styles.hint}>{LOOK_HINT}</ThemedText>

            {/* The Done bar, in the flow. While the grid is open Home also pins a copy
                at the bottom of the screen; this row keeps its space either way. */}
            {summary && (
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
            )}
          </>
        )}
      </Card>

      <LookEmergencySheet
        visible={emergencyOpen}
        species={species}
        petName={petName}
        read={emergencyRead}
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

/** The look that just arrived — the hollow ring, the words, the hour, and *Undo* in the
 *  slot the chevron takes afterwards (§3.1a, T-15).
 *
 *  UNDO FADES BEFORE IT LEAVES. The two controls share a slot, so a silent swap would
 *  put "open the record" under a thumb already travelling toward "take that back". The
 *  fade is presentation only — a tap during it still undoes, because the AUTHORITY for
 *  whether the reversal is still offered stays with the register (this component is only
 *  rendered while the register says the beat is live). Two clocks, one of them cosmetic,
 *  started from the same event. */
function LookEntry({
  row,
  pet,
  arrival,
  onUndo,
}: {
  row: NyxEvent;
  pet: { species?: string | null; sex: 'male' | 'female' | 'unknown' };
  arrival: ReturnType<typeof useLookArrival>;
  onUndo: (eventId: string, restore: LookDraft, rowPetId: string) => void;
}) {
  const undoOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    // The last half-second of the register's own dwell (T-15). Named off the store's
    // constant rather than a number typed here, so the two cannot drift apart.
    const at = Math.max(0, LOOK_DWELL_MS - UNDO_FADE_MS);
    const timer = setTimeout(() => {
      Animated.timing(undoOpacity, {
        toValue: 0.35,
        duration: UNDO_FADE_MS,
        useNativeDriver: true,
      }).start();
    }, at);
    return () => {
      clearTimeout(timer);
      undoOpacity.setValue(1);
    };
  }, [row.id, undoOpacity]);

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
        style={[styles.ring, { backgroundColor: fill, borderColor: ring }, arrival.ringStyle]}
      />
      <Animated.View style={[styles.entryBody, arrival.wordsStyle]}>
        {/* L-16 / R16 — A QUIET ENTRY IS QUIET. The observed-absence row takes the
            secondary ink a size down; a row carrying words keeps the primary ink. The
            reassuring half is never the headline (the retired round-2 row's finding,
            carried here). */}
        <ThemedText style={[styles.entryWords, described.kind === 'absence' && styles.entryQuiet]}>
          {words ?? 'Noticed'}
        </ThemedText>
      </Animated.View>
      <ThemedText style={styles.entryTime}>{formatTime(new Date(row.occurred_at))}</ThemedText>
      <Animated.View style={{ opacity: undoOpacity }}>
        <Pressable
          onPress={() => onUndo(row.id, restore, row.pet_id)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Undo. ${words ?? 'the look'}`}
          testID={`look-undo-${row.id}`}
        >
          <ThemedText style={styles.undo}>{LOOK_UNDO}</ThemedText>
        </Pressable>
      </Animated.View>
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
    // C-5 — two chips facing each other need the sum of their facing reach. `LookChip`'s
    // hitSlop is vertical-only, so the COLUMN gap is the visual one and the ROW gap
    // carries the reach: `CHIP_ROW_GAP` is derived from it rather than typed as 12, and
    // `LookChip.test.tsx` asserts the identity off the rendered style. A wrapping row
    // splits `gap` into its two axes for exactly this reason.
    columnGap: theme.space1,
    rowGap: CHIP_ROW_GAP,
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
  entryQuiet: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextSecondary,
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
  caret: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
});
