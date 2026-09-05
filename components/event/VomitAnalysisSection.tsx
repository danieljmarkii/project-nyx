// Per-incident vomit AI analysis, rendered on the event detail screen (B-027,
// under B-013). Self-contained: reads the event_ai_analysis row from Supabase
// (written server-side by the analyze-vomit Edge Function), triggers analysis
// lazily if none exists yet, and polls while it runs.
//
// Scope of THIS component: display the AI read + structured observations,
// dismiss/undismiss the read, retry on failure, the pending / uncertain /
// failed states, AND owner editing of the structured fields with a per-field
// "edited" marker + a single calm "Edited [date]" line (B-028). The n=1 read
// (recommendation/read_text) stays DISMISSIBLE, never editable; only the facts
// that feed the vet report are editable. An owner edit is the more-trusted value
// (human-reviewed > raw AI) and re-analysis never clobbers it (Edge Function).
//
// Guardrail (Dr. Chen, B-013): the read ESCALATES on a visible/contextual red
// flag and NEVER reassures on absence. The recommendation enum has no
// reassuring value, so this component never renders an "all clear".
import { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { theme } from '../../constants/theme';
import { WhorlSpinner } from '../brand/WhorlSpinner';
import { supabase } from '../../lib/supabase';
import {
  triggerVomitAnalysis,
  awaitAnalysisChain,
  watchAnalysisRow,
  saveVomitFieldEdits,
  deriveEditedFields,
  extractEditableFromPayload,
  normalizeVomitEdits,
  VomitEditableFields,
  EditableVomitField,
} from '../../lib/analysis';
import { escalationSurvivesFailure } from '../../lib/incidentReadState';
import { VomitFieldsEditor } from './VomitFieldsEditor';
import { vomitCapCopy } from '../../constants/monetizationCopy';
import {
  labelFor,
  COLOUR_OPTIONS,
  CONTENT_OPTIONS,
  CONSISTENCY_OPTIONS,
  BLOOD_OPTIONS,
} from './vomitFields';
import { ThemedText } from '../ui/ThemedText';
import { IncidentReadCard, IncidentReadPending } from './IncidentReadCard';
import { ObservationGrid } from './ObservationGrid';
import { useObservationFold } from './useObservationFold';

// 'capped' / 'read_disabled' are the two states the analyze-vomit function writes
// into the row when the DESCRIPTIVE read is skipped (cap hit / flag off) AND no
// contextual escalation flags fired (§4.5). If a flag HAD fired, the function writes
// a normal 'completed' escalation instead — so these two never carry a red flag, and
// the never-reassure invariant survives the cap by construction (there is no path
// from either to a reassuring verdict).
type Status = 'pending' | 'completed' | 'failed' | 'uncertain' | 'capped' | 'read_disabled';
type Recommendation = 'worth_a_call' | 'monitor' | 'not_enough_to_say';

interface AnalysisRow {
  status: Status;
  recommendation: Recommendation | null;
  read_text: string | null;
  description: string | null;
  colour: string | null;
  contents: string[] | null;
  consistency: string | null;
  blood_present: string | null;
  bile_present: string | null;
  foreign_material_present: string | null;
  foreign_material_note: string | null;
  ai_raw_payload: Record<string, unknown> | null;
  edited_at: string | null;
  dismissed_at: string | null;
  error: string | null;
}

const SELECT_COLS =
  'status, recommendation, read_text, description, colour, contents, consistency, ' +
  'blood_present, bile_present, foreign_material_present, foreign_material_note, ' +
  'ai_raw_payload, edited_at, dismissed_at, error';

const REC_LABEL: Record<Recommendation, string> = {
  worth_a_call: 'Worth a call',
  monitor: 'Keep an eye out',
  not_enough_to_say: 'Not enough to say yet',
};

export function VomitAnalysisSection(
  { eventId, petId, petName, hasPhoto }:
  { eventId: string; petId: string; petName?: string | null; hasPhoto: boolean },
) {
  // §5.3 — the observations fold, device-local per pet per event. Held here rather than
  // in the grid so a re-render of the block never resets what the owner folded.
  const [folded, setFolded] = useObservationFold(petId, eventId);
  const [row, setRow] = useState<AnalysisRow | null | undefined>(undefined); // undefined = first load
  const [working, setWorking] = useState(false); // analysis in flight (triggered or awaiting realtime)
  const [retrying, setRetrying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const cancelled = useRef(false);
  const watchTeardown = useRef<(() => void) | null>(null);

  const fetchRow = useCallback(async (): Promise<AnalysisRow | null> => {
    const { data } = await supabase
      .from('event_ai_analysis')
      .select(SELECT_COLS)
      .eq('event_id', eventId)
      .maybeSingle();
    return (data as AnalysisRow | null) ?? null;
  }, [eventId]);

  // Re-read the row and resolve if the analysis has moved off 'pending'. Returns
  // true once resolved — the realtime watch tears down on true. Guards its state
  // writes against an unmount mid-read via `cancelled`.
  const checkResolved = useCallback(async (): Promise<boolean> => {
    const next = await fetchRow();
    if (cancelled.current) return true; // unmounted — stop the watch
    if (next && next.status !== 'pending') {
      setRow(next);
      setWorking(false);
      return true;
    }
    return false;
  }, [fetchRow]);

  // Watch the row over realtime (with a bounded fallback) until it resolves.
  // Replaces the old 3s×12 poll: instant on the common path, no 36s cliff, and a
  // dropped socket still degrades to the same manual-retry floor (CUL-171).
  const beginWatch = useCallback(() => {
    watchTeardown.current?.();
    watchTeardown.current = watchAnalysisRow(eventId, checkResolved, () => {
      if (!cancelled.current) setWorking(false);
    });
  }, [eventId, checkResolved]);

  const start = useCallback(async () => {
    cancelled.current = false;
    const first = await fetchRow();
    if (cancelled.current) return;

    if (first && first.status !== 'pending') {
      setRow(first);
      return;
    }
    // No row yet, or a stale 'pending'. CUL-801 — the LOG path may already own
    // this event's first read (it claims before its upload starts), so await that
    // chain rather than starting a second one: two invocations burn two units of
    // the daily cap and race each other's write-back, and a second call that
    // crosses the cap can write 'capped' over the first call's real read.
    // awaitAnalysisChain resolves false when no chain is outstanding, and false
    // when one settled WITHOUT ever invoking (its upload failed) — then, and only
    // then, we trigger, so a suppressed trigger can never leave this incident
    // with no read and no escalation.
    setRow(first ?? null);
    setWorking(true);
    const readAlreadyRunning = await awaitAnalysisChain(eventId);
    if (!readAlreadyRunning) {
      // The invoke is a SERVER-side side effect and must OUTLIVE this screen, so
      // it is issued whether or not we are still mounted. Guarding it on
      // `cancelled` here is what the adversarial pass broke: the wait can run for
      // the whole upload, an owner who glances at the photo and taps back inside
      // it would bail before the call, and a chain that then settled false (its
      // upload failed) would leave the incident with NO read and no deterministic
      // contextual escalation — the one outcome await-not-skip exists to prevent.
      // Only the state writes and the watch below are guarded.
      const { error } = await triggerVomitAnalysis(eventId);
      if (error) console.warn('[vomit-analysis] trigger error:', error);
    }
    if (cancelled.current) return;
    // Either way the realtime watch carries the result. Its fallback schedule
    // starts HERE, after the chain settles, so a slow upload no longer eats the
    // give-up budget.
    beginWatch();
  }, [eventId, fetchRow, beginWatch]);

  useEffect(() => {
    start();
    return () => {
      cancelled.current = true;
      watchTeardown.current?.();
      watchTeardown.current = null;
    };
  }, [start]);

  async function handleRetry() {
    setRetrying(true);
    cancelled.current = false;
    setRow((r) => (r ? { ...r, status: 'pending', error: null } : r));
    const { error } = await triggerVomitAnalysis(eventId);
    // Navigated away mid-trigger — don't setState or open a watch on an
    // unmounted instance (mirrors start()'s guard after the same await).
    if (cancelled.current) return;
    setRetrying(false);
    if (error) {
      // `error` is the raw functions.invoke message (lib/analysis.ts) — a
      // transport string, not owner copy. Log it, show the calm retry line.
      console.warn('[vomit-analysis] retry failed:', error);
      Alert.alert('Could not start analysis', 'Try again in a moment.');
      return;
    }
    setWorking(true);
    beginWatch();
  }

  async function setDismissed(dismiss: boolean) {
    if (!row) return;
    const nextIso = dismiss ? new Date().toISOString() : null;
    const prev = row.dismissed_at;
    setRow({ ...row, dismissed_at: nextIso }); // optimistic
    const { error } = await supabase
      .from('event_ai_analysis')
      .update({ dismissed_at: nextIso })
      .eq('event_id', eventId);
    if (error) {
      setRow({ ...row, dismissed_at: prev });
      Alert.alert('Could not update', 'Try again in a moment.');
    }
  }

  // Persist owner edits to the structured fields (B-028). A no-op save (nothing
  // changed vs the persisted values) just closes the editor — it never stamps
  // edited_at, so the never-clobber guard stays armed only by a real edit.
  async function handleSaveEdits(next: VomitEditableFields) {
    if (!row) return;
    const current = currentEditable(row);
    if (deriveEditedFields(next, current).length === 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const norm = normalizeVomitEdits(next);
    const { error } = await saveVomitFieldEdits(eventId, norm);
    setSaving(false);
    if (error) {
      Alert.alert('Could not save', 'Try again in a moment.');
      return;
    }
    // Optimistic local commit — mirror the DB write (fields + provenance stamp).
    setRow({ ...row, ...norm, edited_at: new Date().toISOString() });
    setEditing(false);
  }

  // ── Render states ──

  // First load, nothing known yet. Only shown WITH a photo — a photoless event
  // stays silent until it resolves (to an escalation, or to nothing), so the
  // section never appears-then-vanishes on the common photoless path (B-363).
  if (hasPhoto && row === undefined && !working) {
    return (
      <View style={styles.section}>
        <ThemedText style={styles.sectionLabel}>AI READ</ThemedText>
        <IncidentReadPending />
      </View>
    );
  }

  const status: Status | undefined = row?.status;

  // Pending / actively working. Same photoless rule: no spinner for a photoless
  // event — a contextual escalation pops in clean when it resolves (B-363).
  if (hasPhoto && (working || status === 'pending')) {
    return (
      <View style={styles.section}>
        <ThemedText style={styles.sectionLabel}>AI READ</ThemedText>
        <IncidentReadPending />
      </View>
    );
  }

  // Failed — UNLESS the record already holds an escalation, which outlives a failed
  // re-read (CUL-812). Showing "Couldn't finish reading this one" over a live
  // worth_a_call reads to an owner as nothing was found; the escalation falls through
  // to the card below instead. A benign read is deliberately NOT rescued — see
  // escalationSurvivesFailure for why the rule is asymmetric.
  if (status === 'failed' && !escalationSurvivesFailure(row)) {
    return (
      <View style={styles.section}>
        <ThemedText style={styles.sectionLabel}>AI READ</ThemedText>
        <View style={styles.failedBox}>
          <ThemedText style={styles.failedText}>Couldn't finish reading this one.</ThemedText>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={handleRetry}
            disabled={retrying}
            hitSlop={8}
            activeOpacity={0.8}
          >
            {retrying
              ? <WhorlSpinner size="sm" tint={theme.colorTextOnDark} />
              : <ThemedText style={styles.retryBtnText}>Try again</ThemedText>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Descriptive read flagged off with NO escalation flags fired (§4.5) → render
  // nothing. No dead "Try again", no empty frame. (If a flag had fired, the row is a
  // normal 'completed' escalation and falls through to the render below.)
  if (status === 'read_disabled') {
    return null;
  }

  // Cap reached with NO escalation flags fired → the calm §7.3 cap state. Never
  // error styling, never a retry, never a Premium mention, never reassurance. The
  // read runs tomorrow; everything logged is saved; the "when to call your vet"
  // guidance is in the copy. The row carries no daily/monthly discriminator, so we
  // use the daily wording — the monthly cap (200) is effectively unreachable at the
  // daily cap of 10.
  if (status === 'capped') {
    return (
      <View style={styles.section}>
        <ThemedText style={styles.sectionLabel}>AI READ</ThemedText>
        <View style={styles.capBox}>
          <ThemedText style={styles.capText}>{vomitCapCopy(petName, 'daily')}</ThemedText>
        </View>
      </View>
    );
  }

  // A photoless vomit can never produce a descriptive read: with no photo the
  // escalation floor collapses to not_enough_to_say (a real CONTEXTUAL escalation —
  // repeated vomiting, concurrent lethargy — still returns worth_a_call and falls
  // through to the render below, never suppressed). So suppress the dead "Not enough
  // to say · Try analysis" frame and its looping retry when there's no photo —
  // re-running without one just loops back to the same empty read. The detail screen
  // shows an "Add photo" empty hero directly above this section; once a photo is
  // added the section un-suppresses (hasPhoto flips) and a real read is one tap on
  // its retry away (the add-photo flow also kicks a re-analysis). Analysis still
  // fires on mount regardless of photo (the trigger is unchanged), so a photoless
  // contextual escalation is never hidden. Auto-refreshing the section the instant a
  // photo lands is a tracked follow-up (B-370). Matches the read_disabled branch: no
  // dead affordance, no empty frame (B-363).
  if (!hasPhoto && (!row?.recommendation || row.recommendation === 'not_enough_to_say')) {
    return null;
  }

  // No analysis and not working (e.g. gave up, or an unclear/unsynced photo). Only
  // reached WITH a photo now — the retry is legitimate (the photo may not have
  // synced yet, the documented race triggerVomitAnalysis guards against).
  if (!row || !row.recommendation) {
    return (
      <View style={styles.section}>
        <ThemedText style={styles.sectionLabel}>AI READ</ThemedText>
        <View style={styles.neutralCard}>
          <ThemedText style={styles.readText}>Not enough to say about this one yet.</ThemedText>
          <TouchableOpacity onPress={handleRetry} hitSlop={16} disabled={retrying}>
            <ThemedText style={styles.linkText}>{retrying ? 'Working…' : 'Try analysis'}</ThemedText>
          </TouchableOpacity>
        </View>
        <ThemedText style={styles.disclaimer}>This is a quick read of a single moment, not a diagnosis.</ThemedText>
      </View>
    );
  }

  const rec = row.recommendation;
  const dismissed = !!row.dismissed_at;

  const observations = buildObservations(row);
  const canEdit = !dismissed && (row.status === 'completed' || row.status === 'uncertain');
  const editedSet = new Set<EditableVomitField>(
    deriveEditedFields(currentEditable(row), extractEditableFromPayload(row.ai_raw_payload)),
  );

  return (
    <View style={styles.section}>
      <ThemedText style={styles.sectionLabel}>AI READ</ThemedText>

      {dismissed ? (
        <View style={styles.dismissedRow}>
          <ThemedText style={styles.dismissedText}>AI note hidden</ThemedText>
          <TouchableOpacity onPress={() => setDismissed(false)} hitSlop={16}>
            <ThemedText style={styles.linkText}>Show</ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <IncidentReadCard
          verdict={rec}
          label={REC_LABEL[rec]}
          readText={row.read_text}
          onHide={() => setDismissed(true)}
        />
      )}

      {!dismissed && (observations.length > 0 || canEdit) ? (
        <ObservationGrid
          rows={observations.map((o) => ({
            key: o.field,
            label: o.label,
            value: o.value,
            edited: isObsRowEdited(editedSet, o.field),
          }))}
          description={row.description}
          descriptionEdited={editedSet.has('description')}
          editedAtLabel={row.edited_at ? `Edited ${formatEditedDate(row.edited_at)}` : null}
          onEdit={!editing && canEdit ? () => setEditing(true) : null}
          editLabel={observations.length > 0 ? 'Edit' : 'Add details'}
          editor={editing ? (
            <VomitFieldsEditor
              initial={currentEditable(row)}
              saving={saving}
              onSave={handleSaveEdits}
              onCancel={() => setEditing(false)}
            />
          ) : undefined}
          folded={folded}
          onToggleFold={setFolded}
        />
      ) : null}

      {!dismissed && !editing ? (
        <TouchableOpacity
          onPress={handleRetry}
          disabled={retrying}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.rerunRow}
        >
          <ThemedText style={styles.linkText}>{retrying ? 'Re-running…' : 'Re-run analysis'}</ThemedText>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

interface Observation {
  field: EditableVomitField;
  label: string;
  value: string;
}

function buildObservations(row: AnalysisRow): Observation[] {
  const out: Observation[] = [];
  const colour = labelFor(COLOUR_OPTIONS, row.colour);
  if (colour) out.push({ field: 'colour', label: 'Colour', value: colour });
  const consistency = labelFor(CONSISTENCY_OPTIONS, row.consistency);
  if (consistency) out.push({ field: 'consistency', label: 'Consistency', value: consistency });
  if (row.contents && row.contents.length > 0) {
    const labels = row.contents.map((c) => labelFor(CONTENT_OPTIONS, c) ?? c).filter(Boolean);
    if (labels.length > 0) out.push({ field: 'contents', label: 'Contents', value: labels.join(', ') });
  }
  // Blood is clinically central — show it even when none is visible (a factual
  // observation feeding the report, distinct from the n=1 read's reassurance ban).
  const blood = labelFor(BLOOD_OPTIONS, row.blood_present);
  if (blood) out.push({ field: 'blood_present', label: 'Blood', value: blood });
  // Foreign material. The 'yes' path shows the model's own note, UNCHANGED by this change:
  // the model is prompted to set the suspected_foreign_material visual flag on 'yes', so a
  // 'yes' note normally rides a worth_a_call card (Pattern-10-compliant). That coupling is
  // not structurally enforced at the floor (which trusts the model's visual_flags array,
  // not a flag derived from the enum — CUL-534), but closing it is out of scope here. On
  // 'unsure' the card is
  // 'monitor', and CUL-240 (B-042) surfaces the previously-hidden finding there — but the
  // note is model-authored FREE TEXT with no schema constraint, no parse gate, and no
  // post-floor gate, so the RAW note must NOT reach a non-worth_a_call card
  // (clinical-guardrails Pattern 10 / B-060 / CUL-152: an 'unsure' note can carry a
  // diagnosis or a reassurance, e.g. "looks like bone, usually passes on its own", which
  // an '(unclear)' suffix would not neutralise). So the note's PRESENCE is the trigger — a
  // deterministic signal the model saw a describable non-food fragment — while its CONTENT
  // is never rendered here: the 'unsure' row shows a DETERMINISTIC label. That delivers the
  // whole visibility win (the owner learns a possible, unidentified non-food fragment was
  // flagged) present-direction, never reassuring, with zero free-text leak, and works on
  // the existing rows with no Edge Function change. A bare 'unsure' with no note stays
  // hidden — nothing specific to surface.
  const foreignNote = row.foreign_material_note?.trim();
  if (row.foreign_material_present === 'yes') {
    out.push({
      field: 'foreign_material_present',
      label: 'Foreign material',
      value: foreignNote || 'Possible',
    });
  } else if (row.foreign_material_present === 'unsure' && foreignNote) {
    out.push({
      field: 'foreign_material_present',
      label: 'Foreign material',
      value: 'Possible — not identified',
    });
  }
  return out;
}

// The 'Foreign material' row is driven by presence but shows the note, so an
// edit to EITHER marks the row.
function isObsRowEdited(editedSet: Set<EditableVomitField>, field: EditableVomitField): boolean {
  if (field === 'foreign_material_present') {
    return editedSet.has('foreign_material_present') || editedSet.has('foreign_material_note');
  }
  return editedSet.has(field);
}

// The live editable fields, pulled off the analysis row for the editor + the
// vs-AI diff.
function currentEditable(row: AnalysisRow): VomitEditableFields {
  return {
    colour: row.colour,
    consistency: row.consistency,
    contents: row.contents,
    blood_present: row.blood_present,
    foreign_material_present: row.foreign_material_present,
    foreign_material_note: row.foreign_material_note,
    description: row.description,
  };
}

function formatEditedDate(iso: string): string {
  const d = new Date(iso);
  // Add the year only when it isn't the current one — "Jun 22" stays clean for a
  // recent edit but a year-old correction reads unambiguously on the vet's clock.
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

const styles = StyleSheet.create({
  section: {
    marginTop: theme.space3,
  },
  sectionLabel: {
    fontSize: theme.textXS,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
    letterSpacing: theme.trackingWidest,
    marginBottom: theme.space1,
  },
  neutralCard: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    padding: theme.space2,
    borderWidth: 1,
  },
  readText: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightBody,
  },
  linkText: {
    fontSize: theme.textSM,
    color: theme.colorAccentInk,
    fontWeight: theme.fontWeightMedium,
    marginTop: 6,
  },
  rerunRow: {
    paddingVertical: theme.space1,
    alignSelf: 'flex-start',
  },
  dismissedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.space1,
  },
  dismissedText: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
  },
  disclaimer: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: theme.space1,
    lineHeight: 15,
  },
  failedBox: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderColor: theme.colorBorder,
    borderWidth: 1,
    borderRadius: theme.radiusMedium,
    padding: theme.space2,
    gap: theme.space1,
  },
  // §7.3 vomit cap — a calm neutral surface, deliberately identical in weight to
  // the neutral/failed cards (NOT the attention card, no accent border). It must
  // never read as alarm and never as an error.
  capBox: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderColor: theme.colorBorder,
    borderWidth: 1,
    borderRadius: theme.radiusMedium,
    padding: theme.space2,
  },
  capText: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightBody,
  },
  failedText: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  retryBtn: {
    marginTop: 4,
    backgroundColor: theme.colorNeutralDark,
    borderRadius: theme.radiusSmall,
    paddingVertical: theme.space1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  retryBtnText: {
    fontSize: theme.textMD,
    color: theme.colorTextOnDark,
    fontWeight: theme.fontWeightMedium,
  },
});
