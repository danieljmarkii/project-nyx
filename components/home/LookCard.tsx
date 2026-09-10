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
// THE TODAY LIST AND ITS PROTECTION ARRIVED TOGETHER (CUL-873 / N-4b), and §10 paired
// them on purpose rather than by sequencing: a list that PERSISTS can draw *nothing
// unusual* on Home under a pet whose record carries a live intake concern, so the entries
// that stay and `lib/lookWithheld.ts` are one change (floor item 12, Dr. Chen's ledger row
// 15). N-4a shipped one entry for the register's dwell; this card now keeps the day's
// entries, folds the question to one line beneath them, hangs a receipt under the entry
// that earned it, carries the coverage footer, and takes a note after the save.
//
//   4. THE RESTING LIST — today's looks, newest first, each with its hour and its `›` to
//      the record; the newest carries *Undo* only while the register says its beat is
//      live. Two entries, the rest behind *N more today ›* (T-15: the list never becomes
//      a feed). Under a live intake concern a QUIET entry withholds its words and says
//      why (`LookWithheldEntry`) while a symptom-class entry still speaks — the
//      asymmetry is `entryWithholdsWords`, not a branch here.
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
import {
  Alert,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Animated,
} from 'react-native';
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
import { insertLook, loadLookDays, answeredDays, updateLookNote, type LookDayRow } from '../../lib/looks';
import { syncPendingLooks } from '../../lib/sync';
import { lookCoverage, lookCoverageText } from '../../lib/lookCoverage';
import { leadReceipt, receiptsFor } from '../../lib/lookReceipts';
import {
  entryWithholdsWords,
  loadLookWithheldFacts,
  lookWithheldState,
  markWithheldToday,
  readLastWithheldDay,
  type LookWithheldFacts,
} from '../../lib/lookWithheld';
import { LookWithheldEntry, LookWithheldReasonLine } from './LookWithheldEntry';
import { Skeleton } from '../ui/Skeleton';
import { wordsToLocalText } from '../../lib/lookWordsCodec';
import {
  describeLook,
  gridChipLabel,
  gridSectionsFor,
  isLookRow,
  lookHeadline,
  lookSummary,
} from '../../lib/lookDisplay';
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
  lookNoteCue,
  LOOK_NOTE_LINK,
  LOOK_NOTE_MAX_LENGTH,
  LOOK_NOTE_PLACEHOLDER,
  LOOK_PATTERNS_DOOR,
  LOOK_TODAY_CAP,
  LOOK_UNDO,
  LOOK_UNDO_NOTE_TITLE,
  intakeDoorLabel,
  lookDoneSummary,
  lookFirstLookLine,
  lookFoldedAsk,
  lookMoreToday,
  lookMoreTodayHref,
  lookOpeningChipUnfoldLine,
  lookQuestion,
  lookUndoNoteBody,
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

/** The reach every small control on this card declares — the entry's chevron, its Undo,
 *  the card's own doors. One number, so the gaps below can be derived from it. */
const ROW_CONTROL_REACH = 8;

/**
 * The note link's own reach. Its row is 32pt by design (T-22), which is under the 44pt
 * floor, so 6 on each side is what makes the target 44 — derived from the shortfall, not
 * chosen.
 */
const NOTE_LINK_REACH = 6;
const NOTE_LINK_SLOP = { top: NOTE_LINK_REACH, bottom: NOTE_LINK_REACH } as const;

/** What must separate the note link from the entry's chevron above it: the sum of the two
 *  facing reaches (C-5), never a number that happens to equal it today. */
const NOTE_LINK_ROW_GAP = ROW_CONTROL_REACH + NOTE_LINK_REACH;

/** What must separate two controls where the lower one is at the 44pt floor and carries no
 *  slop of its own: the upper one's reach alone. */
const NOTE_LINK_REACH_GAP = ROW_CONTROL_REACH;
import { NODE_DOT_RING, NODE_DOT_SIZE, NODE_TINT_DAY, nodeDotColors } from '../recap/nodeTints';
import { formatTime } from '../../lib/utils';

/** What one resting read answers with. Held as ONE object so a consumer cannot pair
 *  today's record with the previous pet's withheld facts — the three fields travel with
 *  the `petId` they were read for (C-9). */
interface RestingRead {
  petId: string;
  record: LookDayRow[];
  facts: LookWithheldFacts;
  /** `undefined` when the device-local mark could not be read; the footer suppresses on
   *  it (see `lib/lookCoverage.ts`). */
  lastWithheldDay: string | null | undefined;
}

interface Props {
  /**
   * The diet trial's own refusal register for the ACTIVE pet (`isAnimalNotEating`).
   *
   * THREE-STATE, and the third state is the point (CUL-873). `null` means Home has not
   * confirmed the trial facts belong to the pet on screen — and the two readers of this
   * one fact must take that opposite ways, which is C-12's "ask what its `null` costs
   * THIS caller" made concrete:
   *
   *   • the EMERGENCY DOOR takes it as a positive fact or nothing (`=== true`), because a
   *     door that escalated on unloaded facts would read *Call your vet today.* forever
   *     for a healthy pet whose trial card failed to load once — the cry-wolf direction;
   *   • the WITHHELD PREDICATE takes `null` as unanswered and fails CLOSED, because
   *     drawing a quiet run before the facts land is the direction that cannot be taken
   *     back.
   *
   * Optional so a test can render the card without a trial; `false` is the honest default
   * for "no trial", which is most pets.
   */
  trialNotEating?: boolean | null;
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
  const patchInToday = useEventStore((s) => s.patchInToday);
  const showLook = useMomentStore((s) => s.showLook);
  const undo = useMomentStore((s) => s.undo);
  const pauseDwell = useMomentStore((s) => s.pauseDwell);
  const resumeDwell = useMomentStore((s) => s.resumeDwell);
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
  // The resting state's read: today's record, the withheld facts and the footer's memory,
  // loaded together so the entries, the receipt and the footer never disagree about the
  // same pet. `null` is IN FLIGHT — a read that hasn't answered is never an empty record
  // (C-12), and here the empty answer would be "nothing is wrong with her eating".
  const [resting, setResting] = useState<RestingRead | null>(null);
  // The question, folded once the day holds a look. Tapping the folded row re-opens the
  // chips IN PLACE, cleared (R9 / T-14 — the card never closes the question).
  const [askOpen, setAskOpen] = useState(false);
  // The note after the save (T-22). `noteFor` is the event whose field is open, so a
  // second look arriving closes it rather than moving it.
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

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

  // The withheld state, decided once per render from the loaded facts and read by
  // everything below: the entries, the receipt and the footer. `'unknown'` while anything
  // is in flight — the card renders a skeleton on it rather than either claim.
  const withheldState = activePet
    ? lookWithheldState({ id: activePet.id }, resting?.petId === activePet.id ? resting.facts : null)
    : 'unknown';
  const withheld = withheldState === 'withheld';

  // TODAY'S LOOKS, newest first — the list that stays.
  //
  // SCOPED BY THE ROW'S OWN PET, not by what the loader was asked for (C-9).
  // `loadTodayEvents` re-queries on a pet switch, but the store holds the PREVIOUS pet's
  // rows until that read answers — so without this the card could render another animal's
  // look, with an Undo beside it, under this animal's question.
  //
  // From the STORE rather than from the record read, so the entry the owner just made
  // appears the instant `insertLook` returns (the optimistic prepend). The record read
  // that lands a beat later is what the RECEIPT is derived from — a receipt is not the
  // completion beat and may honestly wait for the record it describes.
  const todayLooks = useMemo(
    () =>
      todayEvents
        .filter((e) => isLookRow(e) && e.pet_id === activePet?.id)
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
    [todayEvents, activePet?.id],
  );
  const newestLook = todayLooks[0] ?? null;

  // The register decides how long the beat holds, not this card — one clock (C-20's
  // reasoning applied to the dwell). It governs exactly two things now: whether the newest
  // entry offers *Undo* rather than its chevron, and whether the arrival animation plays.
  const beatLive =
    justWritten !== null &&
    momentVisible &&
    !momentRemoved &&
    momentPayload?.kind === 'look' &&
    momentPayload.eventId === justWritten &&
    todayLooks.some((e) => e.id === justWritten);

  // The chips are open on a day with no look, and whenever the owner re-opens the folded
  // question. They are NOT hidden during the beat any more: the arrival, the folded ask
  // and the footer all sit on the card together (§3.1a's beat-4 frame).
  const asking = todayLooks.length === 0 || askOpen;

  // The record the receipts read, once it has answered FOR THIS PET.
  const record: readonly LookDayRow[] =
    resting && activePet && resting.petId === activePet.id ? resting.record : [];
  const recordAnswered = resting !== null && activePet !== null && resting.petId === activePet.id;

  // The footer. Absent while anything is in flight, absent on a day with no look, absent
  // below the floor, absent while withheld and until the window clears (T-16).
  const coverageText =
    recordAnswered && resting
      ? lookCoverageText(
          lookCoverage(record, {
            nowMs: Date.now(),
            withheldNow: withheldState !== 'open',
            lastWithheldDay: resting.lastWithheldDay,
          }),
        )
      : null;

  const arrival = useLookArrival({
    entryKey: justWritten,
    // The FACT, not the presentation (C-30): "this card just wrote that row". The same
    // row renders identically when Home re-reads it a minute later, and re-drawing it
    // then would announce a record the owner did not just make.
    animate: justWritten !== null,
    reducedMotion,
    appActive,
  });

  // THE RESTING READ — the record, the withheld facts and the footer's memory, in ONE
  // effect for one pet at one instant.
  //
  // They are loaded together because they are read together: the entries decide whether
  // to speak their words from the withheld facts, the receipt is derived from the record
  // AND reduced by those same facts, and the footer is suppressed by both the live state
  // and the mark. Three separate loaders would let the card render a coverage number for
  // a frame with the withheld state still in flight — which is the one frame the whole
  // protection exists to prevent.
  //
  // Also the day-1 line's answer: has this pet ever been looked at. The unknown state is
  // reset ONLY when the pet changes, never on a re-read — resetting on every refresh
  // would blink the day-1 line off and back on each time an unrelated row lands, and a
  // line that says "this is the first look" should not flicker while it is being read.
  const everLookedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!live || !activePet) return;
    let cancelled = false;
    const petId = activePet.id;
    const petSpecies = activePet.species;
    if (everLookedFor.current !== petId) {
      everLookedFor.current = petId;
      setEverLooked(null);
      // The whole read is dropped on a pet switch, never carried: a retained "not
      // withheld" belongs to the animal it was read for (C-9), and this card would
      // otherwise draw one cat's quiet run under the other's name.
      setResting(null);
      setAskOpen(false);
      setNoteFor(null);
    }
    Promise.all([
      loadLookDays(petId),
      loadLookWithheldFacts({ id: petId, species: petSpecies }, trialNotEating ?? null),
      readLastWithheldDay(petId),
    ])
      .then(([record, facts, lastWithheldDay]) => {
        if (cancelled || activePetIdRef.current !== petId) return;
        setEverLooked(answeredDays(record) > 0);
        setResting({ petId, record, facts, lastWithheldDay });
      })
      // A FAILED read stays in flight rather than becoming an answer. Home re-reads on
      // focus, on a sync tick and on pull-to-refresh, so the card self-heals; what it
      // must never do is treat a database error as "her eating is fine" or as a reason to
      // assert that it is not.
      .catch((e) => console.warn('[LookCard] resting read failed:', e));
    return () => {
      cancelled = true;
    };
  }, [live, activePet?.id, activePet?.species, todayEvents.length, trialNotEating, activePet]);

  // Remember the day we withheld, so the footer stays away until the window has moved past
  // it (T-16). Fire-and-forget and idempotent within a day — the mark is the footer's only
  // memory of a state that is otherwise purely live.
  useEffect(() => {
    if (!live || !activePet || !withheld) return;
    markWithheldToday(activePet.id).catch(() => {});
  }, [live, activePet?.id, withheld, activePet]);

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

  /**
   * Does this row's ENTRY withhold its words — the asymmetry inside the withheld state.
   *
   * Lifted to the card because two things read it and they must not disagree: the row
   * itself, and the reason line drawn once beneath the group. `entryWithholdsWords` owns
   * the rule; this only adds "…and the pet is being withheld at all".
   */
  const withholdsWords = useCallback(
    (row: NyxEvent): boolean => {
      if (!withheld || !activePet) return false;
      const described = describeLook(row, { species: activePet.species, sex });
      const words = described.kind === 'observed' ? described.words.map((w) => w.key) : [];
      return entryWithholdsWords(words, lookSpeciesOf(activePet.species));
    },
    [withheld, activePet, sex],
  );

  /**
   * The ONE receipt line under an entry, or null (PM-ruled 2026-09-10).
   *
   * Derived at render from the record as it stands (T-18) — never stored, never latched —
   * which is what makes an Undo re-arm the first-day form and a backdated *Off* move the
   * first day, with no code here knowing either of those things happened.
   *
   * A row not yet in the record read earns nothing: the entry the owner just made appears
   * from the store immediately, and its receipt arrives with the read that describes it.
   */
  const receiptTextFor = useCallback(
    (row: NyxEvent): string | null => {
      if (!recordAnswered || !activePet) return null;
      const stored = record.find((r) => r.eventId === row.id);
      if (!stored) return null;
      return (
        leadReceipt(
          receiptsFor(
            { eventId: stored.eventId, localDay: stored.localDay, words: stored.words },
            record,
            {
              petName,
              pet: { species: activePet.species, sex },
              nowMs: Date.now(),
              withheld,
            },
          ),
        )?.text ?? null
      );
    },
    [record, recordAnswered, activePet, petName, sex, withheld],
  );

  /**
   * THE LIST CAP (E-10, T-15) — two entries, the rest behind a door. A trivial cap, and
   * deliberately not the med strip's §7 collapse, which is a per-med cadence rule.
   *
   * ── PLUS WHATEVER EARNED A RECEIPT ─────────────────────────────────────────
   * §3.3 floor (5): a receipt attaches to the EARLIEST look of the day carrying the word
   * and stays there when a later look arrives, because "a good afternoon never removes a
   * concern the card already said". A newest-first cap of two does exactly that removal on
   * the third look of the day — and the product review named the correlation that makes it
   * worst: the day an owner answers three times is the symptomatic day.
   *
   * So the cap governs the entries that earned NOTHING. In practice this adds at most one
   * row (a receipt belongs to one entry per word, and the card renders one line), and it
   * adds it only on a day the record had something to say — which is the day T-15's "never
   * a feed" was never arguing about.
   */
  const visibleLooks = todayLooks.filter(
    (row, i) => i < LOOK_TODAY_CAP || receiptTextFor(row) !== null,
  );
  const hiddenLooks = todayLooks.length - visibleLooks.length;

  // ── THE NOTE, AFTER THE SAVE (T-22) ────────────────────────────────────────
  // Never a field on the way IN (Principle 1). It opens on the newest entry only, and it
  // closes when the next look arrives — the effect below, rather than a branch at the call
  // site, so a second Done cannot leave a field hanging under the wrong row.
  useEffect(() => {
    if (noteFor && newestLook?.id !== noteFor) {
      setNoteFor(null);
      setNoteDraft('');
    }
  }, [newestLook?.id, noteFor]);

  const openNote = useCallback(
    (eventId: string) => {
      openMenu();
      setNoteFor(eventId);
      setNoteDraft('');
    },
    [],
  );

  const saveNote = useCallback(
    async (eventId: string) => {
      const text = noteDraft.trim();
      if (noteSaving) return;
      if (text.length === 0) {
        setNoteFor(null);
        return;
      }
      setNoteSaving(true);
      try {
        // `looks.notes` and NEVER `events.notes` (T-22, §9 rule 1) — the parent's column
        // is NULL by CHECK for a `check_in`, because Ask's recall fetch selects
        // `events.notes` with no type filter. `updateLookNote` is the one statement that
        // writes this column (C-20's shape, applied to a field), so this call site cannot
        // invent a second door to it.
        await updateLookNote(eventId, text);
        // The store's row, so the note renders under the entry without waiting for a
        // re-read — and so the Undo confirm below can NAME it.
        patchInToday(eventId, { look_note: text } as Partial<NyxEvent>);
        // The parent is untouched, so only the child is queued: events first, then looks,
        // is the ordering `insertLook` establishes and the child's drain gates on the
        // parent being synced regardless.
        syncPendingLooks().catch((e: unknown) => console.error('[LookCard] note push failed:', e));
        setNoteFor(null);
        setNoteDraft('');
      } catch (e) {
        // A failed write is always said (C-12). The field stays open with her words in it.
        console.error('[LookCard] note save failed:', e);
        Alert.alert('Couldn’t save that note', 'Please try again in a moment.');
      } finally {
        setNoteSaving(false);
      }
    },
    [noteDraft, noteSaving, patchInToday],
  );

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
      // The question folds again (R9 / T-14) — the second look is a second ENTRY, made by
      // re-opening this row, never an edit of the first.
      setAskOpen(false);
      setNoteFor(null);
      setNoteDraft('');
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
  const runUndo = useCallback(
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
          // …and the chips have to be OPEN for her to see them. The folded row would
          // otherwise swallow the words the Undo just handed back, which is the same
          // "no visible save" finding in reverse.
          setAskOpen(true);
        }
        setJustWritten(null);
        return 'removed' as const;
      }
      if (result === 'failed') {
        // The row is still in the record and the owner has been told it is not — the
        // one unrecoverable lie this surface could tell, so it is said instead.
        Alert.alert('Couldn’t undo that', 'The look is still saved. Please try again.');
      }
      if (result === 'ignored') {
        // Only reachable after an explicit CONFIRM (the note branch below), where silence
        // would read as "removed". A bare Undo tap that no-ops is not spoken — C-21's own
        // distinction, and the reason this branch is gated on having asked.
        return 'ignored' as const;
      }
      return result;
    },
    [activePet?.id, undo],
  );

  /**
   * Undo, with the one gate a look can earn (T-22, C-21).
   *
   * A look is recreatable — three taps — so its Undo is one tap, and that is the whole
   * reason the card offers a way back rather than a confirm. A NOTE is not recreatable:
   * no surface in the app exposes a removed one, and the sentence she typed at 2am about
   * what she saw is gone for good. So a note-bearing look takes the photo rule's confirm,
   * and the body NAMES the note — the owner would otherwise have no way to know it was
   * going.
   *
   * `pauseDwell` holds the card open across the dialog. Without it the gate is worse than
   * no gate: the 5s runs from the reveal, so an owner who taps at 4.5s and reads for a
   * second confirms against a card that has already dismissed — `undo()` then refuses on
   * `!visible`, returns 'ignored', and the look silently survives a removal she explicitly
   * authorised (the NamedCompletionCard measurement, inherited).
   */
  const handleUndo = useCallback(
    (eventId: string, restore: LookDraft, rowPetId: string, note: string | null) => {
      if (!note) {
        void runUndo(eventId, restore, rowPetId);
        return;
      }
      pauseDwell();
      Alert.alert(
        LOOK_UNDO_NOTE_TITLE,
        lookUndoNoteBody(note),
        [
          { text: 'Keep it', style: 'cancel', onPress: resumeDwell },
          {
            text: 'Take it back',
            style: 'destructive',
            onPress: () => {
              void runUndo(eventId, restore, rowPetId).then((result) => {
                if (result === 'ignored') {
                  // She confirmed and nothing happened. Said out loud rather than left as
                  // a silent no-op (C-21): after an explicit confirm, silence reads as
                  // "removed", and the look is still in the record.
                  Alert.alert('That look is still saved', 'Open it from the record to remove it.');
                }
              });
            },
          },
        ],
        { cancelable: true, onDismiss: resumeDwell },
      );
    },
    [runUndo, pauseDwell, resumeDwell],
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
        // `=== true` — the positive fact or nothing, never ignorance (T-20). The
        // withheld predicate above takes the SAME field the other way; the two readings
        // are named in the prop's own doc.
        const merged = withTrialRefusal(facts, trialNotEating === true);
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

        {/* THE TODAY LIST (T-15, R14). Three kinds of line — entry, receipt, footer — and
            none of them ever shares a line with another.

            THE SKELETON IS NOT DECORATION. While the withheld read is in flight the card
            knows it has entries and does not yet know whether it may speak their words, so
            it says neither (C-12). The alternative measured on paper was worse in both
            directions: render the words and a quiet run flashes under a live concern;
            render the withheld copy and every owner on every cold open is told for a frame
            that her pet's eating needs attention. */}
        {todayLooks.length > 0 && (
          <View style={styles.entries} testID="look-entries">
            {withheldState === 'unknown' ? (
              <LookEntriesSkeleton count={Math.min(todayLooks.length, LOOK_TODAY_CAP)} />
            ) : (
              visibleLooks.map((row) => (
                <LookTodayRow
                  key={row.id}
                  row={row}
                  pet={{ species: activePet.species, sex }}
                  petName={petName}
                  isNewest={row.id === newestLook?.id}
                  withheld={withheld}
                  arrival={row.id === justWritten ? arrival : null}
                  undoLive={beatLive && row.id === justWritten}
                  onUndo={handleUndo}
                  receipt={receiptTextFor(row)}
                  noteOpen={noteFor === row.id}
                  noteDraft={noteDraft}
                  noteSaving={noteSaving}
                  onOpenNote={() => openNote(row.id)}
                  onChangeNote={setNoteDraft}
                  onSaveNote={() => saveNote(row.id)}
                />
              ))
            )}
            {/* THE REASON, ONCE (the product review). It belongs to the card, not to an
                entry, so it is drawn here rather than inside each one — and it is drawn
                only when at least one entry actually withheld, because a card whose only
                look carried a symptom word withheld nothing and owes no explanation. */}
            {withheld && visibleLooks.some(withholdsWords) && (
              <LookWithheldReasonLine
                petName={petName}
                sex={sex}
                onOpenRecord={() =>
                  router.push(`/event/${visibleLooks.find(withholdsWords)?.id}` as never)
                }
              />
            )}
            {withheldState !== 'unknown' && hiddenLooks > 0 && (
              <Pressable
                onPress={() => router.push(lookMoreTodayHref() as never)}
                // The box and the margin belong on the RESPONDER, not on the text inside
                // it: a `marginTop` on the child sits INSIDE the Pressable, so the
                // separation it was meant to buy is inside the touch area instead of
                // beside it. Caught by the geometry test reading the flattened style off
                // this node and finding none (C-5: assert the RENDERED box).
                style={styles.moreTodayRow}
                accessibilityRole="button"
                accessibilityLabel={`Show ${hiddenLooks} more of today's looks in history`}
                testID="look-more-today"
              >
                <ThemedText style={styles.moreToday}>{lookMoreToday(hiddenLooks)}</ThemedText>
              </Pressable>
            )}
          </View>
        )}

        {/* THE FOLDED ASK (R9 / T-14) — the card never closes the question. One line,
            re-opening the chips in place and CLEARED, so a second look is a second row in
            the record rather than an edit of the first. */}
        {!asking && (
          <Pressable
            onPress={() => {
              openMenu();
              setDraft(emptyDraft());
              setNoteFor(null);
              setAskOpen(true);
            }}
            style={styles.askRow}
            accessibilityRole="button"
            accessibilityLabel={`${lookFoldedAsk(petName)} Opens the words again.`}
            testID="look-folded-ask"
          >
            <ThemedText style={styles.askRowText}>{lookFoldedAsk(petName)}</ThemedText>
            <ThemedText style={styles.caret}>▾</ThemedText>
          </Pressable>
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

        {/* THE COVERAGE FOOTER (R11, T-16) — a LINE, not a door. The card's one door stays
            on its label, so nothing tappable faces the ask row's caret (C-5) and the line
            never wraps into the entry above it (R14). Its numbers are tabular figures at
            the line's end for the same reason: a proportional digit is what turns a
            one-line footer into a two-line one between "4" and "28". */}
        {coverageText && (
          <ThemedText style={styles.coverage} testID="look-coverage">
            {coverageText}
          </ThemedText>
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
  undoLive,
  onUndo,
  note,
  isNewest,
}: {
  row: NyxEvent;
  pet: { species?: string | null; sex: 'male' | 'female' | 'unknown' };
  /** The arrival choreography, or null for an entry this card did not just write — the
   *  same row renders identically when Home re-reads it a minute later, and re-drawing it
   *  then would announce a record the owner did not just make (C-30: the trigger switches
   *  on the FACT). */
  arrival: ReturnType<typeof useLookArrival> | null;
  /** Is the register still offering the reversal for this row? The AUTHORITY is the
   *  register's, never this component's — it only decides which of the two controls sits
   *  in the slot. */
  undoLive: boolean;
  onUndo: (eventId: string, restore: LookDraft, rowPetId: string, note: string | null) => void;
  note: string | null;
  isNewest: boolean;
}) {
  const undoOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!undoLive) return;
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
  }, [row.id, undoOpacity, undoLive]);

  const described = describeLook(row, pet);
  // The ONE resolver, so this entry, History's row and the record screen name the same
  // look identically (`lib/lookDisplay.ts`). Null is a look this build cannot describe
  // — the row then reads as the bare act and NEVER falls through to the absence phrase.
  //
  // The HEADLINE form, because this entry has no prefix in front of it: `lookSummary`
  // lower-cases for the surfaces that do (*You noticed: off, …*), and here that left the
  // most-read string in the feature reading as a fragment — beside an unresolvable row
  // rendering a capitalised *Noticed* in the same slot.
  const words = lookHeadline(described);
  const { fill, ring } = nodeDotColors('look', NODE_TINT_DAY, theme.colorSurface);
  // What Undo puts back: the words as they were chosen. The absence row restores as the
  // absence, which is a real answer and not an empty draft (L-6).
  const restore: LookDraft =
    described.kind === 'absence'
      ? { kind: 'absence' }
      : { kind: 'words', words: described.words.map((w) => w.key) };

  const time = formatTime(new Date(row.occurred_at));
  return (
    <View style={styles.entry}>
      <Animated.View
        style={[styles.ring, { backgroundColor: fill, borderColor: ring }, arrival?.ringStyle]}
      />
      <Animated.View style={[styles.entryBody, arrival?.wordsStyle]}>
        {/* L-16 / R16 — A QUIET ENTRY IS QUIET. The observed-absence row takes the
            secondary ink a size down; a row carrying words keeps the primary ink. The
            reassuring half is never the headline (the retired round-2 row's finding,
            carried here). */}
        <ThemedText style={[styles.entryWords, described.kind === 'absence' && styles.entryQuiet]}>
          {words ?? 'Noticed'}
        </ThemedText>
      </Animated.View>
      {/* An OLDER entry's note shows as a mark beside its hour rather than as a line, so
          an engaged day never stacks nine lines (T-22). The quote itself is one tap away,
          on the record. */}
      {!isNewest && note && (
        <ThemedText style={styles.noteMark} accessibilityLabel="Has a note">
          ❞
        </ThemedText>
      )}
      <ThemedText style={styles.entryTime}>{time}</ThemedText>
      {undoLive ? (
        <Animated.View style={{ opacity: undoOpacity }}>
          <Pressable
            onPress={() => onUndo(row.id, restore, row.pet_id, note)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Undo. ${words ?? 'the look'}`}
            testID={`look-undo-${row.id}`}
          >
            <ThemedText style={styles.undo}>{LOOK_UNDO}</ThemedText>
          </Pressable>
        </Animated.View>
      ) : (
        // The chevron takes the slot once the register lets go. Every entry's `›` opens
        // the record, where a word can be changed and every look — the absence and the
        // withheld entry included — carries the note field (§3.3, T-22).
        <Pressable
          onPress={() => router.push(`/event/${row.id}` as never)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Open the record. ${words ?? 'the look'}, ${time}`}
          testID={`look-open-${row.id}`}
        >
          <ThemedText style={styles.caret}>›</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

/**
 * ONE ROW OF THE TODAY LIST — the entry, its note and its receipt, in that order.
 *
 * THREE KINDS OF LINE, NEVER SHARED (T-15). The entry is the ring, the words, the hour
 * and the control; the note is hers, in quotes, in the primary ink with no rule; the
 * receipt is the app's, secondary. The footer is the card's and lives outside this row
 * entirely. R14's whole complaint was a saved state whose reason text wrapped into the
 * verb beside it, so nothing here is allowed to share a line with anything else.
 *
 * THE WITHHELD SPLIT IS BY HOST, not by a flag inside `LookEntry` (C-7 / C-16): a quiet
 * entry under a live intake concern renders `LookWithheldEntry`, its own file, named in
 * `guards/haptics.test.ts`. A symptom-class entry still speaks — `entryWithholdsWords`
 * owns that asymmetry so this component does not grow an opinion about intake.
 */
function LookTodayRow({
  row,
  pet,
  petName,
  isNewest,
  withheld,
  arrival,
  undoLive,
  onUndo,
  receipt,
  noteOpen,
  noteDraft,
  noteSaving,
  onOpenNote,
  onChangeNote,
  onSaveNote,
}: {
  row: NyxEvent;
  pet: { species?: string | null; sex: 'male' | 'female' | 'unknown' };
  petName: string;
  isNewest: boolean;
  withheld: boolean;
  arrival: ReturnType<typeof useLookArrival> | null;
  undoLive: boolean;
  onUndo: (eventId: string, restore: LookDraft, rowPetId: string, note: string | null) => void;
  receipt: string | null;
  noteOpen: boolean;
  noteDraft: string;
  noteSaving: boolean;
  onOpenNote: () => void;
  onChangeNote: (text: string) => void;
  onSaveNote: () => void;
}) {
  const described = describeLook(row, pet);
  const note = described.note;
  const words = described.kind === 'observed' ? described.words.map((w) => w.key) : [];
  const holdWords = withheld && entryWithholdsWords(words, lookSpeciesOf(pet.species));

  if (holdWords) {
    // The whole row: no note link (the note would reprint the withheld claim in her own
    // words on the card that just refused to print it) and no receipt beyond what
    // `receiptsFor` already reduced to a bare first date — which for a wordless entry is
    // nothing at all. The REASON is not here either: it is one line per card, drawn once
    // beneath the group, because two quiet looks stacked the same paragraph twice and a
    // repeated system message reads as a defect (the product review).
    //
    // The way back IS here. This state withholds the WORDS; it was never the reversal, and
    // shipping it without one left the beat most likely to be mis-tapped with neither a
    // confirm nor an Undo (C-21).
    return (
      <LookWithheldEntry
        occurredAt={row.occurred_at}
        petName={petName}
        sex={pet.sex}
        undoLive={undoLive}
        dwellMs={LOOK_DWELL_MS}
        onUndo={() => onUndo(row.id, { kind: 'absence' }, row.pet_id, note)}
        onOpenRecord={() => router.push(`/event/${row.id}` as never)}
        testID={`look-withheld-${row.id}`}
      />
    );
  }

  return (
    <View>
      <LookEntry
        row={row}
        pet={pet}
        arrival={arrival}
        undoLive={undoLive}
        onUndo={onUndo}
        note={note}
        isNewest={isNewest}
      />

      {/* THE NOTE. The link lives on the NEWEST entry only and goes the moment a note
          exists or the next look arrives (T-22). Never under an absence, whose qualifier
          should have been a word — she can still take a note on the record screen, which
          carries the field for every look. */}
      {isNewest && !note && !noteOpen && described.kind === 'observed' && (
        <Pressable
          onPress={onOpenNote}
          // Its OWN 32pt row, never sharing hit area with the entry's chevron above it
          // (C-5): the two controls are eight points apart and do completely different
          // things.
          style={styles.noteLinkRow}
          hitSlop={NOTE_LINK_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Say more about this look"
          testID={`look-note-link-${row.id}`}
        >
          <ThemedText style={styles.noteLink}>{LOOK_NOTE_LINK}</ThemedText>
        </Pressable>
      )}

      {isNewest && noteOpen && (
        <View style={styles.noteFieldWrap}>
          <TextInput
            style={styles.noteField}
            placeholder={LOOK_NOTE_PLACEHOLDER}
            placeholderTextColor={theme.colorTextTertiary}
            value={noteDraft}
            onChangeText={onChangeNote}
            // Return SAVES (T-22) — one line, one gesture, no second button to find.
            onSubmitEditing={onSaveNote}
            returnKeyType="done"
            maxLength={LOOK_NOTE_MAX_LENGTH}
            editable={!noteSaving}
            autoFocus
            accessibilityLabel="A note on this look"
            testID={`look-note-field-${row.id}`}
          />
          {/* The T&S cue, and it names the DOCUMENT rather than saying something vague
              about privacy: a note leaves the account whenever the report does (§9). */}
          <ThemedText style={styles.noteCue}>{lookNoteCue(petName)}</ThemedText>
        </View>
      )}

      {/* Hers: quotes, primary ink, no rule — above the app's own line (T-22). */}
      {isNewest && note && (
        <ThemedText style={styles.note} testID={`look-note-${row.id}`}>{`“${note}”`}</ThemedText>
      )}

      {receipt && (
        <ThemedText style={styles.receipt} testID={`look-receipt-${row.id}`}>
          {receipt}
        </ThemedText>
      )}
    </View>
  );
}

/** The list while the withheld read is in flight — content-shaped, under a second, hidden
 *  from assistive tech (C-12's `SkeletonRows` shape). It draws the RING, because the card
 *  already knows an entry exists; what it does not yet know is whether it may say what the
 *  entry holds. */
function LookEntriesSkeleton({ count }: { count: number }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="look-entries-skeleton">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.entry}>
          <View style={[styles.ring, { borderColor: theme.colorBorder }]} />
          <View style={styles.entryBody}>
            <Skeleton width="70%" height={theme.textSM} />
          </View>
        </View>
      ))}
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
  // ── The today list's own lines (CUL-873) ───────────────────────────────────
  noteMark: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  // ── THE STACK'S GEOMETRY (C-5) ────────────────────────────────────────────
  // Four touchables now sit in a column on this card — an entry's chevron, the note
  // link, the cap's door and the folded ask row — and each pair's separation is DERIVED
  // from the facing reach rather than eyeballed:
  //
  //     needed(a, b) = facing hitSlop(a) + facing hitSlop(b)
  //
  // Two of them are at or above the 44pt floor already, so they take the box and DROP the
  // slop (C-5's own "controls already at the 44pt floor: grow the box or drop the slop") —
  // which is what makes an 8pt margin sufficient beneath a chevron that reaches 8. The note
  // link is the one control the spec pins UNDER the floor (T-22: "its own 32 pt row"), so
  // it keeps 6pt of reach to make 44 and pays for it with a 16pt margin above.
  // `LookCard.test.tsx` asserts every one of these off the FLATTENED style, never off the
  // tokens restated in the test.
  moreTodayRow: {
    // Already at the floor by its box, so no slop — and 8 clears the chevron's 8 above it.
    // On the RESPONDER, so the margin separates rather than being swallowed.
    justifyContent: 'center',
    minHeight: 44,
    marginTop: NOTE_LINK_REACH_GAP,
  },
  moreToday: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
  askRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // 44pt by its box, so no slop either: it is the one control that re-opens the question
    // and it sits directly beneath whichever of the three above it rendered.
    minHeight: 44,
    marginTop: NOTE_LINK_REACH_GAP,
  },
  askRowText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  coverage: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextSecondary,
    marginTop: theme.space1,
    // R14 / T-16 — tabular figures so the line cannot re-flow between "4" and "28" and
    // wrap into the row above it.
    fontVariant: ['tabular-nums'],
  },
  receipt: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextSecondary,
    // Aligned under the words rather than the ring, so it reads as this entry's line and
    // not as a new item in the list.
    marginLeft: NODE_DOT_SIZE + theme.space1,
    marginBottom: theme.space1,
  },
  note: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    // HERS: the primary ink, no rule (T-22). The receipt below is the app's — secondary,
    // and a size down. The two are never confusable.
    color: theme.colorTextPrimary,
    marginLeft: NODE_DOT_SIZE + theme.space1,
    marginBottom: theme.space1,
  },
  noteLinkRow: {
    // ITS OWN 32pt ROW (T-22) — never sharing hit area with the entry's chevron, which
    // sits directly above it and does something entirely different. 32 is under the 44pt
    // floor by design, so the reach makes up the difference and the margin pays for the
    // reach: `NOTE_LINK_ROW_GAP` is `chevron 8 + this row's 6`, derived from both, never
    // typed as 14.
    minHeight: 32,
    justifyContent: 'center',
    marginTop: NOTE_LINK_ROW_GAP,
    marginLeft: NODE_DOT_SIZE + theme.space1,
  },
  noteLink: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
  },
  noteFieldWrap: {
    marginLeft: NODE_DOT_SIZE + theme.space1,
    marginBottom: theme.space1,
  },
  noteField: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextPrimary,
    // A TextInput names its own family — RN does not inherit one, and `ThemedText`
    // cannot wrap an input (C-2's carve-out).
    fontFamily: theme.fontBody,
    minHeight: 44,
    paddingVertical: theme.space1,
  },
  noteCue: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextTertiary,
  },
});
