import { useEffect, useRef, useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, TextInput, Image, Alert, Platform, ScrollView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { ChevronLeft, Clock, Camera, Pencil } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { EventIcon } from '../event/EventIcon';
import { WhorlSpinner } from '../brand/WhorlSpinner';
import { EVENT_TYPES, EventTypeKey, SYMPTOM_TYPES } from '../../constants/eventTypes';
import {
  buildTimeFields, resolveTimeModeChange, resolveFoundModeChange,
  sourceAfterPointEdit, refreshedNowPoint, DEFAULT_WINDOW_SPAN_MS,
} from '../../lib/eventTimeEdit';
import type { TimeMode, FoundMode } from './TimeConfidenceField';
import { summarizeSimpleEvent, confirmTimeRowLabel } from '../../lib/logCopy';
import type { LoggedRecord } from '../../lib/completionCard';
import { insertSimpleEvent } from '../../lib/simpleEvent';
import { pickPhotoSource, type PhotoSource } from '../../lib/photoSource';
import { useSubmitGuard } from '../../hooks/useSubmitGuard';
import { useAppActive } from '../../hooks/useAppActive';
import { useEventStore } from '../../store/eventStore';
import type { ConfirmDraft } from '../../lib/discardGuard';
import { formatTime, exifDateToISO, trustedPastExifIso, formatExifAttribution } from '../../lib/utils';

// The one-surface confirm (B-745 PR 3, round-4 mock frames 2–3). A simple event
// (symptom / stool / Other) completes here IN PLACE of the picker grid: the app can
// already fully describe the row it's about to write, so this is a CONFIRMATION, not
// a form (the B-614 line) — it wears the shipped teal confirm register, and the live
// summary pill IS the save. No data semantics change (§1): the time model is B-010
// (buildTimeFields), the photo still triggers the per-incident AI read, and the
// write goes through the shared lib/simpleEvent so the full-screen /log flow and this
// can't drift.
//
// Host-agnostic: it owns the confirm inputs (time / photo / note) and does the
// write + optimistic prepend, then calls onLogged so the host plays the completion
// beat where it belongs (in the sheet, in place). onBack returns to the grid.

interface Props {
  type: EventTypeKey;
  // The pet this event is written for — captured by the host when it entered the
  // confirm (the sheet has no switcher here, so the pet is fixed at grid→confirm and
  // this IS write-time identity; multi-pet §6). Named in the header so the owner sees
  // exactly which pet the record lands on.
  petId: string;
  petName: string;
  onBack: () => void;
  // CUL-614 — the result carries the RECORD, not a display string, so the host's
  // completion beat derives its sentence through lib/completionCard exactly as the
  // named card does (§5's sentence rule). Structured on purpose: there is nowhere
  // here to put a pre-composed "Logged", which is what makes the rule hold by shape
  // rather than by review (the CUL-606 argument, applied to the R2 register).
  onLogged: (result: { eventId: string; occurredAtIso: string; record: LoggedRecord }) => void;
  /** CUL-612 — what the owner has put into this confirm so far, so the HOST can
   *  guard its own dismissal paths (a backdrop tap destroys this component, and a
   *  component cannot guard the gesture that unmounts it). Reported on change
   *  rather than pulled through a ref: the host renders the alert, so the host
   *  needs the draft in render scope, not at call time. */
  onDraftChange?: (draft: ConfirmDraft) => void;
}

type OpenPicker = 'point' | 'latest' | 'earliest' | null;

// Header glyph tint — the symptom family reads rose (identity, never a verdict —
// §2), everything else neutral. DERIVED from SYMPTOM_TYPES ∪ {stool_normal} rather
// than kept as a third hand-list (§6's pairing rule allows exactly two tint/haptic
// predicates — the picker's CATEGORY_TINT and SYMPTOM_TYPES — and this is the
// picker's rose set by definition: stool_normal is the one documented divergence,
// rose-tinted but never symptom-haptic'd). A new symptom leaf joins here for free.
function isRoseType(type: EventTypeKey): boolean {
  return SYMPTOM_TYPES.has(type) || type === 'stool_normal';
}

// The types whose attached photo actually gets an AI read (insertSimpleEvent fires
// analyze-vomit / analyze-stool for exactly these). The photo sub-line only PROMISES
// a read for these — for lethargy / itch / Other the photo is just an attachment, so
// claiming "I can read it for signs" there would promise a read that never happens
// (clinical-guardrails: never assert a capability the record won't deliver).
const PHOTO_READ_TYPES: ReadonlySet<EventTypeKey> = new Set(['vomit', 'diarrhea', 'stool_normal']);

export function SimpleEventConfirm({ type, petId, petName, onBack, onLogged, onDraftChange }: Props) {
  const prependEvent = useEventStore((s) => s.prependEvent);
  // The summary pill IS the write, so it needs the SAME hardened ref-latch guard the
  // picker tiles use (B-336) — a `useState` flag only disables after React commits,
  // so a fast double-tap in the async gap would run the write (and the AI read) twice.
  // The ref latches synchronously on the first tap.
  const guardSubmit = useSubmitGuard();
  const appActive = useAppActive();
  // The photo trip is the longest gap on this sheet and the one thing that may
  // legitimately move the time (EXIF). The latch keeps the foreground effect out of
  // that decision — runPicker settles the point on its own way back, so the effect
  // can never race in and overwrite an EXIF stamp with the wall clock.
  const photoInFlight = useRef(false);

  const typeLabel = EVENT_TYPES[type].label;
  const rose = isRoseType(type);
  const readsPhoto = PHOTO_READ_TYPES.has(type);
  // Per-leaf capture contract (taxonomy §6/§7, D10 — CUL-675). A witnessed-by-
  // construction leaf (cough/sneeze) renders NO Saw it / Found it pair — there is
  // nothing to "find", so a window claim is unwritable by construction (the B-448
  // leak class); timeMode stays 'saw' and the row's "Change time" covers late
  // logging. A leaf without visual evidence (hasPhoto false) renders no photo row
  // at all. Every pre-W1 simple type keeps both affordances, so the sheet's
  // existing confirms are byte-identical.
  const witnessedOnly = EVENT_TYPES[type].confidenceModel === 'witnessed';
  const offersPhoto = EVENT_TYPES[type].hasPhoto;

  // B-010 time state — the same machine app/log.tsx holds inline, reduced to the
  // two confidences AC-FOUND scopes this surface to: witnessed ('saw') and window
  // ('found' → open-ended or bounded). "Around a time" (estimated) is deliberately
  // not offered here (round-4 mock; AC-FOUND names witnessed/window only).
  const [occurredAt, setOccurredAt] = useState(() => new Date());
  // 'now', not 'manual' (CUL-576) — the sheet's opening time is the app's own
  // clock assumption, and `occurred_at_source` is what tells the vet report and
  // the correlation engine apart from an owner-backfilled one. Claiming 'manual'
  // over a value nobody chose is the B-525 mislabel from the other side. The
  // full-screen path (app/log.tsx) carries the same default and the same reason.
  const [occurredAtSource, setOccurredAtSource] = useState<'manual' | 'exif' | 'now'>('now');
  const [timeMode, setTimeMode] = useState<TimeMode>('saw');
  const [foundMode, setFoundMode] = useState<FoundMode>('before');
  const [earliest, setEarliest] = useState<Date | null>(null);
  const [foundLatest, setFoundLatest] = useState<Date>(() => new Date());
  const [openPicker, setOpenPicker] = useState<OpenPicker>(null);
  // The window editor is collapsed by default (mock frame 3: "Adjust window") — a
  // fresh "Found it" is honest in one tap (open-ended, latest = now) and refines
  // only if the owner opens it.
  const [windowOpen, setWindowOpen] = useState(false);

  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; takenAt: string | null; width?: number; height?: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // CUL-576 — re-derive the clock assumption when the sheet is re-entered.
  //
  // The photo branch in runPicker covers the common gap; this covers the long tail,
  // a half-filled confirm left open while the phone is put down and picked back up.
  // Rising edge only, and 'inactive' counts as leaving (useAppActive reads the iOS
  // app-switcher and an incoming call as not-active), which is the transition a
  // restored sheet actually makes. `timeShape` deliberately does not see this move:
  // the app re-deriving its own assumption is not the owner's work, so the discard
  // guard stays quiet (see the baseline note below).
  const wasAppActive = useRef(appActive);
  useEffect(() => {
    const returned = appActive && !wasAppActive.current;
    // The edge is consumed BEFORE the guard, deliberately: a skip here means the
    // photo path owns the point on this trip, not that the re-derive is owed later.
    wasAppActive.current = appActive;
    if (!returned || photoInFlight.current) return;
    setOccurredAt((prev) => refreshedNowPoint(prev, occurredAtSource, new Date()));
  }, [appActive, occurredAtSource]);

  // The single derivation (shared with the full-screen path via lib/eventTimeEdit):
  // occurred_at + confidence + bounds. The row label and the summary pill both read
  // from THIS, so what the pill says is exactly what gets written.
  const tf = buildTimeFields({
    timeMode, foundMode, point: occurredAt, pointSource: occurredAtSource,
    estimatedAt: occurredAt, earliest, latest: foundLatest,
  });
  const rowLabel = confirmTimeRowLabel({
    confidence: tf.confidence, occurredAt: tf.occurredAt, earliest: tf.earliest, latest: tf.latest,
  });
  const pillText = summarizeSimpleEvent({
    typeLabel, confidence: tf.confidence, occurredAt: tf.occurredAt, earliest: tf.earliest, latest: tf.latest,
  });

  // ── THE DISCARD GUARD'S INPUT (CUL-612) ───────────────────────────────────
  // `timeTouched` asks one question: WOULD THIS WRITE A DIFFERENT ROW than it
  // would have when the sheet opened? So it compares `tf` — the single derivation
  // that feeds both the pill and the insert — against the same derivation captured
  // at mount, rather than being set by hand at each of the six sites that can move
  // the time.
  //
  // Two reasons, and the second is the one that found a bug. (1) Six setters is six
  // chances to miss one, and the seventh picker someone adds next year would ship
  // un-guarded and silently discard the window it edits; comparing the OUTPUT covers
  // any future control for free. (2) Comparing raw inputs over-fires: switching to
  // "Found it" and back to "Saw it" seeds `foundLatest` on the way through, so the
  // inputs no longer match even though the row is byte-identical — the owner would
  // get a discard dialog for changing their mind and changing it back.
  //
  // The baseline is the OPENING state, captured once (useRef keeps the first
  // render's value), so an unattended sheet does not become dirty as the clock
  // moves. `windowOpen` is deliberately not consulted: opening a disclosure is not
  // an edit.
  //
  // That "as the clock moves" clause used to be free, because the clock DIDN'T
  // move — the point was frozen at mount. CUL-576 makes it move (the sheet
  // re-derives its own assumption on re-entry), so the exemption has to be stated
  // instead of inherited: while the point is still 'now' it is the app's standing
  // assumption, not the owner's work, so it is not in the draft at all. The moment
  // the owner touches the picker, sourceAfterPointEdit flips it to 'manual', the
  // real timestamp enters the shape, and the guard sees the edit. Comparing the
  // SOURCE rather than diffing timestamps is what keeps "re-derived by the app"
  // and "chosen by a human" from looking identical here.
  const pointShape = tf.source === 'now' ? 'now' : String(tf.occurredAt.getTime());
  const timeShape = `${tf.confidence}|${pointShape}|${tf.earliest?.getTime() ?? ''}|${tf.latest?.getTime() ?? ''}`;
  const baseline = useRef(timeShape);
  const draft: ConfirmDraft = {
    hasPhoto: photo !== null,
    timeTouched: timeShape !== baseline.current,
    hasNote: notes.trim().length > 0,
  };
  const { hasPhoto, timeTouched, hasNote } = draft;
  useEffect(() => {
    onDraftChange?.({ hasPhoto, timeTouched, hasNote });
    // Depends on the three BOOLEANS, not the object — `draft` is rebuilt every
    // render, so an object dependency would re-fire this on every keystroke.
  }, [hasPhoto, timeTouched, hasNote, onDraftChange]);

  const pickerDisplay = Platform.OS === 'ios' ? 'inline' : 'default';

  function handleModeChange(m: TimeMode) {
    const t = resolveTimeModeChange(timeMode, m, occurredAtSource === 'exif');
    if (t.noOp) return;
    if (t.seedFoundMode) setFoundMode(t.seedFoundMode);
    if (t.seedLatestFrom) setFoundLatest(t.seedLatestFrom === 'point' ? occurredAt : new Date());
    setOpenPicker(null);
    // Entering "Found it" leaves the editor collapsed (open-ended default is honest);
    // returning to "Saw it" hides it.
    setWindowOpen(false);
    setTimeMode(m);
  }

  function handleFoundModeChange(m: FoundMode) {
    const t = resolveFoundModeChange(foundMode, m, earliest != null);
    if (t.noOp) return;
    if (t.seedEarliest) setEarliest(new Date(foundLatest.getTime() - DEFAULT_WINDOW_SPAN_MS));
    setFoundMode(m);
  }

  function handlePointChange(d?: Date) {
    if (!d) return;
    setOccurredAtSource(sourceAfterPointEdit(occurredAtSource, d.getTime() !== occurredAt.getTime()));
    setOccurredAt(d);
  }

  // Clamp earliest <= latest so a window never violates chk_occurred_window_order.
  function handleLatestChange(d: Date) {
    setFoundLatest(d);
    if (earliest && earliest.getTime() > d.getTime()) setEarliest(d);
  }

  // Tap on the time row's affordance: "Saw it" toggles the point picker; "Found it"
  // toggles the window editor (AC-FOUND: adjust the window without leaving the sheet).
  function toggleTimeEditor() {
    if (timeMode === 'saw') {
      setOpenPicker(openPicker === 'point' ? null : 'point');
    } else {
      setWindowOpen((v) => !v);
    }
  }

  // Chooser first, then only the chosen source's permission (CUL-577, lib/photoSource).
  // The old order gated everything behind the media-library grant, so a
  // library-denied owner could never take a camera photo — and on a vomit or stool
  // confirm that photo is the payload the per-incident AI read runs on
  // (lib/simpleEvent), so the denial cost the clinical half of the log.
  async function pickPhoto() {
    // Wrapped because onPress cannot await this: an unwrapped rejection would be an
    // unhandled promise and a photo row that silently does nothing. The confirm is
    // unaffected — the photo is an enrichment, and the event still logs without it.
    try {
      const source = await pickPhotoSource('Add a photo');
      if (!source) return;
      await launchPicker(source);
    } catch (e) {
      console.error('[SimpleEventConfirm] photo attach failed:', e);
      Alert.alert("Couldn't open that", 'Try again in a moment.');
    }
  }

  async function launchPicker(source: PhotoSource) {
    photoInFlight.current = true;
    try {
      await runPicker(source);
    } finally {
      photoInFlight.current = false;
    }
  }

  async function runPicker(source: PhotoSource) {
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'], allowsEditing: false, quality: 0.85, exif: true,
    };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const exifRaw = asset.exif as Record<string, unknown> | undefined;
    const dateRaw = exifRaw?.DateTimeOriginal ?? exifRaw?.DateTime;
    const takenAt = typeof dateRaw === 'string' ? trustedPastExifIso(exifDateToISO(dateRaw)) : null;
    if (takenAt) {
      // A photo of the event is stamped when it happened — seed the time from EXIF
      // and mark the provenance so Dr. Chen's report keeps the attribution (B-525).
      setOccurredAt(new Date(takenAt));
      setOccurredAtSource('exif');
    } else {
      // No usable stamp, so the sheet's clock assumption still stands — and it has
      // been standing since the sheet opened, through however long the trip took.
      // Re-derive it here rather than at save (CUL-576): the summary pill shows this
      // value and §0 of the picker spec makes that pill the save, so the pill and
      // the write have to be the same number. An owner-set or EXIF point is returned
      // untouched by refreshedNowPoint.
      setOccurredAt((prev) => refreshedNowPoint(prev, occurredAtSource, new Date()));
    }
    setPhoto({ uri: asset.uri, takenAt, width: asset.width, height: asset.height });
  }

  // Returns whether an event was COMMITTED — the useSubmitGuard contract (B-336):
  // true keeps the guard latched (the sheet is transitioning to the beat, so no later
  // tap may write again); false releases it (the write failed, the owner is still on
  // the confirm looking at the alert, so the pill must work again).
  async function handleLogIt(): Promise<boolean> {
    setSubmitting(true);
    try {
      const res = await insertSimpleEvent({
        petId,
        eventType: type,
        confidence: tf.confidence,
        occurredAt: tf.occurredAt,
        earliest: tf.earliest,
        latest: tf.latest,
        source: tf.source,
        notes: notes.trim() || null,
        attachment: photo
          ? { uri: photo.uri, takenAt: photo.takenAt, width: photo.width, height: photo.height }
          : null,
      });
      // Optimistic timeline row so the event appears the instant the sheet closes
      // (the pet named in the header is the active pet — the sheet has no switcher
      // here — so this always applies).
      prependEvent({
        id: res.eventId,
        pet_id: petId,
        event_type: type,
        occurred_at: res.occurredAtIso,
        occurred_at_confidence: tf.confidence,
        occurred_at_earliest: tf.earliest ? tf.earliest.toISOString() : null,
        occurred_at_latest: tf.latest ? tf.latest.toISOString() : null,
        severity: null,
        notes: notes.trim() || null,
        source: 'manual',
        deleted_at: null,
        created_at: res.now,
        updated_at: res.now,
      });
      onLogged({
        eventId: res.eventId,
        occurredAtIso: res.occurredAtIso,
        // Built from `tf` — the SAME buildTimeFields derivation the summary pill reads
        // and the write above used, so the beat cannot say something the row does not
        // hold. Passing the pill's own string instead would have been shorter and
        // wrong: the pill is composed against a live clock, and by the time the beat
        // renders, "today at 11:59 PM" can already be yesterday.
        record: {
          kind: 'event',
          typeLabel,
          confidence: tf.confidence,
          earliest: tf.earliest ? tf.earliest.toISOString() : null,
          latest: tf.latest ? tf.latest.toISOString() : null,
        },
      });
      return true;
    } catch (e) {
      console.error('[SimpleEventConfirm] log failed:', e);
      Alert.alert("Couldn't save that", 'Something went wrong. Please try again.');
      setSubmitting(false); // keep the confirm live for a retry
      return false;
    }
  }

  return (
    <View style={styles.container}>
      {/* Header — the glyph names the subject, "Type — Pet" names the record, and the
          back chevron returns to the grid (the sheet stays open; the grabber/backdrop
          close it). Placement follows the round-4 design-locked frame. */}
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <View style={[styles.headerCircle, rose ? styles.circleRose : styles.circleNeutral]}>
            <EventIcon type={type} size={16} color={rose ? theme.colorEventSymptom : theme.colorTextSecondary} />
          </View>
          <ThemedText style={styles.headerText} numberOfLines={1}>
            {typeLabel} — {petName}
          </ThemedText>
        </View>
        <TouchableOpacity onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back to event types">
          <ChevronLeft size={20} color={theme.colorTextSecondary} strokeWidth={1.75} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Time pill row — the label + Saw it/Found it chips. AC-CHIP: the chip pair
            never wraps or squeezes; on a narrow row it drops below the label as a
            whole (flexWrap on the row; the chip pair is flexShrink:0). */}
        <View style={styles.timeRow} testID="confirm-time-row">
          <TouchableOpacity style={styles.timeMain} onPress={toggleTimeEditor} activeOpacity={0.7} testID="confirm-time-main">

            <View style={[styles.rowCircle, styles.circleNeutral]}>
              <Clock size={15} color={theme.colorTextSecondary} strokeWidth={1.75} />
            </View>
            <View style={styles.timeLabels}>
              <ThemedText style={styles.rowLabel} numberOfLines={2}>{rowLabel}</ThemedText>
              <ThemedText style={styles.rowSub}>{timeMode === 'saw' ? 'Change time' : 'Adjust window'}</ThemedText>
              {occurredAtSource === 'exif' && timeMode === 'saw' && (
                <ThemedText style={styles.exif}>{formatExifAttribution(occurredAt.toISOString())}</ThemedText>
              )}
            </View>
          </TouchableOpacity>
          {/* D10 — witnessed-by-construction leaves render no chip pair at all:
              withholding the affordance is cheap; a lying one is not. */}
          {!witnessedOnly && (
            <View style={styles.chipPair} testID="confirm-chip-pair">
              <SawFoundChip testID="chip-saw" label="Saw it" active={timeMode === 'saw'} onPress={() => handleModeChange('saw')} />
              <SawFoundChip testID="chip-found" label="Found it" active={timeMode === 'found'} onPress={() => handleModeChange('found')} />
            </View>
          )}
        </View>

        {/* Inline point picker (Saw it → Change time). */}
        {timeMode === 'saw' && openPicker === 'point' && (
          <DateTimePicker
            value={occurredAt}
            mode="datetime"
            display={pickerDisplay}
            maximumDate={new Date()}
            themeVariant="light"
            accentColor={theme.colorAccent}
            onChange={(_e, d) => {
              if (Platform.OS === 'android') setOpenPicker(null);
              handlePointChange(d);
            }}
          />
        )}

        {/* Inline window editor (Found it → Adjust window) — AC-FOUND: open-ended and
            bounded, edited without leaving the sheet. occurred_at_confidence lands as
            'window' either way. */}
        {timeMode === 'found' && windowOpen && (
          <View style={styles.windowPanel}>
            <TouchableOpacity style={styles.radioRow} onPress={() => handleFoundModeChange('before')} hitSlop={8} accessibilityRole="radio" accessibilityState={{ selected: foundMode === 'before' }}>
              <View style={[styles.radio, foundMode === 'before' && styles.radioOn]}>
                {foundMode === 'before' && <View style={styles.radioDot} />}
              </View>
              <ThemedText style={styles.radioLabel}>Sometime before</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.radioRow} onPress={() => handleFoundModeChange('between')} hitSlop={8} accessibilityRole="radio" accessibilityState={{ selected: foundMode === 'between' }}>
              <View style={[styles.radio, foundMode === 'between' && styles.radioOn]}>
                {foundMode === 'between' && <View style={styles.radioDot} />}
              </View>
              <ThemedText style={styles.radioLabel}>Between two times</ThemedText>
            </TouchableOpacity>

            {foundMode === 'before' && (
              <>
                <TouchableOpacity
                  style={styles.field}
                  onPress={() => setOpenPicker(openPicker === 'latest' ? null : 'latest')}
                  accessibilityRole="button"
                  accessibilityLabel={`Found it by ${formatTime(foundLatest)} — change`}
                >
                  <ThemedText style={styles.fieldLabel}>Found it by</ThemedText>
                  <ThemedText style={styles.fieldValue}>{formatTime(foundLatest)}</ThemedText>
                </TouchableOpacity>
                {openPicker === 'latest' && (
                  <DateTimePicker
                    value={foundLatest} mode="datetime" display={pickerDisplay} maximumDate={new Date()}
                    themeVariant="light" accentColor={theme.colorAccent}
                    onChange={(_e, d) => { if (Platform.OS === 'android') setOpenPicker(null); if (d) handleLatestChange(d); }}
                  />
                )}
              </>
            )}

            {foundMode === 'between' && (
              <>
                <TouchableOpacity
                  style={styles.field}
                  onPress={() => setOpenPicker(openPicker === 'earliest' ? null : 'earliest')}
                  accessibilityRole="button"
                  accessibilityLabel={`From ${earliest ? formatTime(earliest) : 'set time'} — change`}
                >
                  <ThemedText style={styles.fieldLabel}>From</ThemedText>
                  <ThemedText style={styles.fieldValue}>{earliest ? formatTime(earliest) : 'Set time'}</ThemedText>
                </TouchableOpacity>
                {openPicker === 'earliest' && (
                  <DateTimePicker
                    value={earliest ?? foundLatest} mode="datetime" display={pickerDisplay} maximumDate={foundLatest}
                    themeVariant="light" accentColor={theme.colorAccent}
                    onChange={(_e, d) => { if (Platform.OS === 'android') setOpenPicker(null); if (d) setEarliest(d); }}
                  />
                )}
                <TouchableOpacity
                  style={styles.field}
                  onPress={() => setOpenPicker(openPicker === 'latest' ? null : 'latest')}
                  accessibilityRole="button"
                  accessibilityLabel={`To ${formatTime(foundLatest)} — change`}
                >
                  <ThemedText style={styles.fieldLabel}>To</ThemedText>
                  <ThemedText style={styles.fieldValue}>{formatTime(foundLatest)}</ThemedText>
                </TouchableOpacity>
                {openPicker === 'latest' && (
                  <DateTimePicker
                    value={foundLatest} mode="datetime" display={pickerDisplay} maximumDate={new Date()}
                    themeVariant="light" accentColor={theme.colorAccent}
                    onChange={(_e, d) => { if (Platform.OS === 'android') setOpenPicker(null); if (d) handleLatestChange(d); }}
                  />
                )}
              </>
            )}
          </View>
        )}

        {/* Photo row (dashed = the additive treatment) — only for leaves with visual
            evidence (§6 hasPhoto: a sneeze confirm never renders a photo zone). The
            sub-line promises a READ, never reassurance (clinical-guardrails /
            nyx-voice Pattern 8): "I can read it for signs". Attaching a vomit/stool
            photo triggers the AI read, unchanged. */}
        {offersPhoto && (photo ? (
          <TouchableOpacity style={styles.rowPill} onPress={pickPhoto} activeOpacity={0.8}>
            <Image source={{ uri: photo.uri }} style={styles.photoThumb} resizeMode="cover" />
            <ThemedText style={styles.rowLabel}>Photo attached · tap to replace</ThemedText>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.rowPill, styles.rowPillDashed]} onPress={pickPhoto} activeOpacity={0.8}>
            <View style={[styles.rowCircle, styles.circleNeutral]}>
              <Camera size={15} color={theme.colorTextSecondary} strokeWidth={1.75} />
            </View>
            <View style={styles.timeLabels}>
              <ThemedText style={styles.rowLabel}>Add a photo</ThemedText>
              {/* The "read it for signs" promise only appears for the types whose photo
                  actually gets an AI read (vomit / stool). Everywhere else the photo is
                  just an attachment, so the sub-line stays a plain "Optional". */}
              <ThemedText style={styles.rowSub}>{readsPhoto ? 'Optional — I can read it for signs' : 'Optional'}</ThemedText>
            </View>
          </TouchableOpacity>
        ))}

        {/* Note row — a quiet optional field in the same pill register. */}
        <View style={styles.rowPill}>
          <View style={[styles.rowCircle, styles.circleNeutral]}>
            <Pencil size={15} color={theme.colorTextSecondary} strokeWidth={1.75} />
          </View>
          <TextInput
            style={styles.noteInput}
            placeholder="Add a note (optional)"
            placeholderTextColor={theme.colorTextTertiary}
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={300}
          />
        </View>

        {/* Summary pill — the save. A live sentence in the confirm register; the one
            dark mark on the surface (the FAB's echo) is the commit. What it reads is
            exactly what gets written. */}
        <TouchableOpacity
          style={styles.summaryPill}
          onPress={() => void guardSubmit(handleLogIt)}
          activeOpacity={0.85}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel={`Log it — ${pillText}`}
        >
          <ThemedText style={styles.summaryText} numberOfLines={2}>{pillText}</ThemedText>
          <View style={styles.logItPill}>
            {submitting ? (
              <WhorlSpinner size="sm" ground="day" tint={theme.colorTextOnDark} />
            ) : (
              <ThemedText style={styles.logItText}>Log it</ThemedText>
            )}
          </View>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// The Saw it / Found it chip — the shipped FilterChip 'default' register (teal
// outline + tinted fill when active) with the AC-CHIP contract made explicit: the
// label is single-line and the chip never shrinks, so it can only ever drop to its
// own row (handled by the parent's flexWrap), never squeeze or truncate. Built
// inline rather than reusing FilterChip because that component doesn't expose
// numberOfLines/flexShrink, which AC-CHIP requires.
function SawFoundChip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      hitSlop={8}
      activeOpacity={0.7}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
    >
      <ThemedText style={[styles.chipLabel, active && styles.chipLabelActive]} numberOfLines={1}>
        {label}
      </ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    // The confirm replaces the grid inside the sheet; the host caps the sheet height.
    paddingBottom: theme.space1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space2,
    paddingHorizontal: theme.space3,
    minHeight: 44,
    marginBottom: theme.space1,
  },
  headerTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  headerText: {
    flexShrink: 1,
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  headerCircle: {
    width: 30, height: 30, borderRadius: theme.radiusFull,
    alignItems: 'center', justifyContent: 'center',
  },
  circleRose: { backgroundColor: theme.colorEventSymptomLight },
  circleNeutral: { backgroundColor: theme.colorSurfaceSubtle },

  body: {
    paddingHorizontal: theme.space3,
    paddingBottom: theme.space2,
    gap: theme.space1,
  },

  // ── The pill rows ──
  rowPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    backgroundColor: theme.colorSurface,
    paddingHorizontal: theme.space1,
    paddingVertical: theme.space1,
    minHeight: 56,
  },
  rowPillDashed: {
    borderStyle: 'dashed',
    borderColor: theme.colorBorderStrong,
  },
  rowCircle: {
    width: 30, height: 30, borderRadius: theme.radiusFull,
    alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: {
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
  },
  rowSub: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: 1,
  },
  exif: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: 1,
  },

  // ── Time row (label + chips, AC-CHIP wrap) ──
  timeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',           // the chip pair drops to its own line when tight
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    backgroundColor: theme.colorSurface,
    paddingHorizontal: theme.space1,
    paddingVertical: theme.space1,
    minHeight: 56,
    rowGap: theme.space1,
  },
  timeMain: {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    // A readability floor: the label may wrap to two lines, but it never shrinks so
    // far that the chips squeeze in beside it — instead the chips drop below.
    minWidth: 150,
  },
  timeLabels: {
    flexShrink: 1,
  },
  chipPair: {
    flexShrink: 0,             // never squeeze — drop to the next line instead
    flexDirection: 'row',
    gap: theme.space0_5,
    marginLeft: 'auto',
  },

  // ── Saw it / Found it chips (FilterChip 'default' register) ──
  chip: {
    flexShrink: 0,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusFull,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space0_5,
    minHeight: 32,
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: theme.colorAccent,
    backgroundColor: theme.colorAccentLight,
  },
  chipLabel: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  chipLabelActive: {
    color: theme.colorAccentInk,
  },

  // ── Window editor ──
  windowPanel: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    padding: theme.space2,
    gap: theme.space0_5,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    minHeight: 40,
  },
  radio: {
    width: 18, height: 18, borderRadius: theme.radiusFull,
    borderWidth: 2, borderColor: theme.colorBorderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOn: { borderColor: theme.colorAccent },
  radioDot: { width: 8, height: 8, borderRadius: theme.radiusFull, backgroundColor: theme.colorAccent },
  radioLabel: { fontSize: theme.textMD, color: theme.colorTextPrimary },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    backgroundColor: theme.colorSurface,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
  },
  fieldLabel: { fontSize: theme.textSM, color: theme.colorTextSecondary },
  fieldValue: { fontSize: theme.textMD, color: theme.colorTextPrimary },

  // ── Photo + note ──
  photoThumb: {
    width: 30, height: 30, borderRadius: theme.radiusSmall,
  },
  noteInput: {
    flex: 1,
    // A TextInput is outside ThemedText's reach (the wrapper wraps Text), so the
    // field names its face directly — otherwise a swept screen keeps SF inputs.
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
    paddingVertical: theme.space0_5,
    minHeight: 30,
    maxHeight: 80,
  },

  // ── Summary pill (the save) ──
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space1,
    backgroundColor: theme.colorAccentLight,
    borderWidth: 1,
    borderColor: theme.colorAccent,
    borderRadius: theme.radiusMedium,
    paddingLeft: theme.space2,
    paddingRight: theme.space0_5,
    paddingVertical: theme.space0_5,
    marginTop: theme.space1,
    minHeight: 52,
  },
  summaryText: {
    flex: 1,
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
  logItPill: {
    backgroundColor: theme.colorNeutralDark,
    borderRadius: theme.radiusFull,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space1,
    minHeight: 40,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logItText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextOnDark,
  },
});
