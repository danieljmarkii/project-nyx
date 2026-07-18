// Per-incident stool AI analysis, rendered on the event detail screen (B-247 PR 6,
// second child of B-013, sibling of VomitAnalysisSection). Self-contained: reads
// the event_ai_analysis row from Supabase (written server-side by the analyze-stool
// Edge Function), triggers analysis lazily if none exists yet, and polls while it
// runs.
//
// Scope of THIS component: display the AI read + structured observations,
// dismiss/undismiss the read, retry on failure, the pending / uncertain / failed /
// capped / read_disabled states, AND owner editing of the structured fields with a
// per-field "edited" marker + a single calm "Edited [date]" line (B-028). The n=1
// read (recommendation/read_text) stays DISMISSIBLE, never editable; only the facts
// that feed the vet report are editable. An owner edit is the more-trusted value
// (human-reviewed > raw AI) and re-analysis never clobbers it (Edge Function).
//
// Guardrail (Dr. Chen, clinical-guardrails, inherited in full): the read ESCALATES
// on a visible/contextual red flag and NEVER reassures on absence. The
// recommendation enum has no reassuring value, so this component never renders an
// "all clear".
//
// Bristol framing (spec §3.4, Designer call): the consistency observation leads
// with plain language ("Soft and mushy") and shows the numeric Bristol type only as
// a small, muted secondary annotation — owners don't think in the Bristol scale, so
// the number is a detail for relaying to a vet, never the primary framing.
import { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { theme } from '../../constants/theme';
import { WhorlSpinner } from '../brand/WhorlSpinner';
import { supabase } from '../../lib/supabase';
import {
  triggerStoolAnalysis,
  saveStoolFieldEdits,
  deriveEditedStoolFields,
  extractStoolEditableFromPayload,
  normalizeStoolEdits,
  StoolEditableFields,
  EditableStoolField,
} from '../../lib/analysis';
import { StoolFieldsEditor } from './StoolFieldsEditor';
import { stoolCapCopy } from '../../constants/monetizationCopy';
import {
  labelFor,
  bristolFor,
  bloodLabel,
  CONSISTENCY_OPTIONS,
  COLOUR_OPTIONS,
  CONTENT_OPTIONS,
} from './stoolFields';

// 'capped' / 'read_disabled' are the two states the analyze-stool function writes
// into the row when the DESCRIPTIVE read is skipped (cap hit / flag off) AND no
// contextual escalation flags fired. If a flag HAD fired, the function writes a
// normal 'completed' escalation instead — so these two never carry a red flag, and
// the never-reassure invariant survives the cap by construction (there is no path
// from either to a reassuring verdict).
type Status = 'pending' | 'completed' | 'failed' | 'uncertain' | 'capped' | 'read_disabled';
type Recommendation = 'worth_a_call' | 'monitor' | 'not_enough_to_say';

interface AnalysisRow {
  status: Status;
  recommendation: Recommendation | null;
  read_text: string | null;
  description: string | null;
  stool_consistency: string | null;
  stool_colour: string | null;
  stool_content: string[] | null;
  stool_blood_present: string | null;
  stool_blood_type: string | null;
  stool_mucus_present: string | null;
  foreign_material_present: string | null;
  foreign_material_note: string | null;
  ai_raw_payload: Record<string, unknown> | null;
  edited_at: string | null;
  dismissed_at: string | null;
  error: string | null;
}

const SELECT_COLS =
  'status, recommendation, read_text, description, stool_consistency, stool_colour, ' +
  'stool_content, stool_blood_present, stool_blood_type, stool_mucus_present, ' +
  'foreign_material_present, foreign_material_note, ai_raw_payload, edited_at, dismissed_at, error';

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 12; // ~36s — covers a slow vision call without spinning forever

const REC_LABEL: Record<Recommendation, string> = {
  worth_a_call: 'Worth a call',
  monitor: 'Keep an eye out',
  not_enough_to_say: 'Not enough to say yet',
};

export function StoolAnalysisSection(
  { eventId, petName, hasPhoto }: { eventId: string; petName?: string | null; hasPhoto: boolean },
) {
  const [row, setRow] = useState<AnalysisRow | null | undefined>(undefined); // undefined = first load
  const [working, setWorking] = useState(false); // analysis in flight (triggered or polling)
  const [retrying, setRetrying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const cancelled = useRef(false);

  const fetchRow = useCallback(async (): Promise<AnalysisRow | null> => {
    const { data } = await supabase
      .from('event_ai_analysis')
      .select(SELECT_COLS)
      .eq('event_id', eventId)
      .maybeSingle();
    return (data as AnalysisRow | null) ?? null;
  }, [eventId]);

  const pollUntilResolved = useCallback(async () => {
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      if (cancelled.current) return;
      const next = await fetchRow();
      if (cancelled.current) return;
      if (next && next.status !== 'pending') {
        setRow(next);
        setWorking(false);
        return;
      }
    }
    // Gave up waiting — leave the working state; a manual retry is available.
    if (!cancelled.current) setWorking(false);
  }, [fetchRow]);

  const start = useCallback(async () => {
    cancelled.current = false;
    const first = await fetchRow();
    if (cancelled.current) return;

    if (first && first.status !== 'pending') {
      setRow(first);
      return;
    }
    // No row yet, or a stale 'pending' — (re)trigger and poll.
    setRow(first ?? null);
    setWorking(true);
    const { error } = await triggerStoolAnalysis(eventId);
    if (cancelled.current) return;
    if (error) console.warn('[stool-analysis] trigger error:', error);
    await pollUntilResolved();
  }, [eventId, fetchRow, pollUntilResolved]);

  useEffect(() => {
    start();
    return () => { cancelled.current = true; };
  }, [start]);

  async function handleRetry() {
    setRetrying(true);
    cancelled.current = false;
    setRow((r) => (r ? { ...r, status: 'pending', error: null } : r));
    const { error } = await triggerStoolAnalysis(eventId);
    setRetrying(false);
    if (error) {
      Alert.alert('Could not start analysis', error);
      return;
    }
    setWorking(true);
    pollUntilResolved();
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
  async function handleSaveEdits(next: StoolEditableFields) {
    if (!row) return;
    const current = currentEditable(row);
    if (deriveEditedStoolFields(next, current).length === 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const norm = normalizeStoolEdits(next);
    const { error } = await saveStoolFieldEdits(eventId, norm);
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
        <Text style={styles.sectionLabel}>AI READ</Text>
        <View style={styles.pendingBox}>
          <WhorlSpinner size="sm" ground="day" />
        </View>
      </View>
    );
  }

  const status: Status | undefined = row?.status;

  // Pending / actively working. Same photoless rule: no spinner for a photoless
  // event — a contextual escalation pops in clean when it resolves (B-363).
  if (hasPhoto && (working || status === 'pending')) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>AI READ</Text>
        <View style={styles.pendingBox}>
          <WhorlSpinner size="sm" ground="day" />
          <Text style={styles.pendingText}>Reading this one…</Text>
        </View>
      </View>
    );
  }

  // Failed.
  if (status === 'failed') {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>AI READ</Text>
        <View style={styles.failedBox}>
          <Text style={styles.failedText}>Couldn't finish reading this one.</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={handleRetry}
            disabled={retrying}
            hitSlop={8}
            activeOpacity={0.8}
          >
            {retrying
              ? <WhorlSpinner size="sm" tint="#fff" />
              : <Text style={styles.retryBtnText}>Try again</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Descriptive read flagged off with NO escalation flags fired → render nothing.
  // No dead "Try again", no empty frame. (If a flag had fired, the row is a normal
  // 'completed' escalation and falls through to the render below.)
  if (status === 'read_disabled') {
    return null;
  }

  // Cap reached with NO escalation flags fired → the calm cap state. Never error
  // styling, never a retry, never a Premium mention, never reassurance. The read
  // runs tomorrow; everything logged is saved; the "when to call your vet" guidance
  // is in the copy. The row carries no daily/monthly discriminator, so we use the
  // daily wording — the monthly cap (200) is effectively unreachable at the daily
  // cap of 10.
  if (status === 'capped') {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>AI READ</Text>
        <View style={styles.capBox}>
          <Text style={styles.capText}>{stoolCapCopy(petName, 'daily')}</Text>
        </View>
      </View>
    );
  }

  // A photoless stool can never produce a descriptive read: with no photo the
  // escalation floor collapses to not_enough_to_say (a real CONTEXTUAL escalation —
  // repeated loose stool, concurrent vomiting/lethargy — still returns worth_a_call
  // and falls through to the render below, never suppressed). So suppress the dead
  // "Not enough to say · Try analysis" frame and its looping retry when there's no
  // photo — re-running without one just loops back to the same empty read. The
  // detail screen shows an "Add photo" empty hero directly above this section; once a
  // photo is added the section un-suppresses (hasPhoto flips) and a real read is one
  // tap on its retry away (the add-photo flow also kicks a re-analysis). Analysis
  // still fires on mount regardless of photo (the trigger is unchanged), so a
  // photoless contextual escalation is never hidden. Auto-refreshing the section the
  // instant a photo lands is a tracked follow-up (B-370). Matches the read_disabled
  // branch: no dead affordance, no empty frame (B-363).
  if (!hasPhoto && (!row?.recommendation || row.recommendation === 'not_enough_to_say')) {
    return null;
  }

  // No analysis and not working (e.g. gave up, or an unclear/unsynced photo). Only
  // reached WITH a photo now — the retry is legitimate (the photo may not have
  // synced yet, the documented race triggerStoolAnalysis guards against).
  if (!row || !row.recommendation) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>AI READ</Text>
        <View style={styles.neutralCard}>
          <Text style={styles.readText}>Not enough to say about this one yet.</Text>
          <TouchableOpacity onPress={handleRetry} hitSlop={16} disabled={retrying}>
            <Text style={styles.linkText}>{retrying ? 'Working…' : 'Try analysis'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.disclaimer}>This is a quick read of a single moment, not a diagnosis.</Text>
      </View>
    );
  }

  const rec = row.recommendation;
  const dismissed = !!row.dismissed_at;
  const tone =
    rec === 'worth_a_call' ? styles.cardAttn
    : rec === 'monitor' ? styles.neutralCard
    : styles.mutedCard;
  const labelTone =
    rec === 'worth_a_call' ? styles.recLabelAttn
    : rec === 'monitor' ? styles.recLabelNeutral
    : styles.recLabelMuted;

  const observations = buildObservations(row);
  const canEdit = !dismissed && (row.status === 'completed' || row.status === 'uncertain');
  const editedSet = new Set<EditableStoolField>(
    deriveEditedStoolFields(currentEditable(row), extractStoolEditableFromPayload(row.ai_raw_payload)),
  );

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>AI READ</Text>

      {dismissed ? (
        <View style={styles.dismissedRow}>
          <Text style={styles.dismissedText}>AI note hidden</Text>
          <TouchableOpacity onPress={() => setDismissed(false)} hitSlop={16}>
            <Text style={styles.linkText}>Show</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.readCard, tone]}>
          <View style={styles.readHeader}>
            <Text style={[styles.recLabel, labelTone]}>{REC_LABEL[rec]}</Text>
            <TouchableOpacity
              onPress={() => setDismissed(true)}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              style={styles.dismissBtn}
            >
              <Text style={styles.dismissX}>✕</Text>
            </TouchableOpacity>
          </View>
          {row.read_text ? <Text style={styles.readText}>{row.read_text}</Text> : null}
        </View>
      )}

      {!dismissed && (observations.length > 0 || canEdit) ? (
        <View style={styles.obsBlock}>
          <View style={styles.obsHeaderRow}>
            <Text style={styles.obsHeading}>What's visible</Text>
            {!editing && canEdit ? (
              <TouchableOpacity onPress={() => setEditing(true)} hitSlop={16}>
                <Text style={styles.editLink}>{observations.length > 0 ? 'Edit' : 'Add details'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {editing ? (
            <StoolFieldsEditor
              initial={currentEditable(row)}
              saving={saving}
              onSave={handleSaveEdits}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              {observations.map((o) => (
                <View key={o.label} style={styles.obsRow}>
                  <Text style={styles.obsKey}>{o.label}</Text>
                  <View style={styles.obsValWrap}>
                    <Text style={styles.obsVal}>{o.value}</Text>
                    {o.secondary ? <Text style={styles.obsSecondary}>{o.secondary}</Text> : null}
                    {isObsRowEdited(editedSet, o.field) ? (
                      <Text style={styles.editedTag}>Edited</Text>
                    ) : null}
                  </View>
                </View>
              ))}
              {row.description ? (
                <View style={styles.descWrap}>
                  <Text style={styles.obsDescription}>{row.description}</Text>
                  {editedSet.has('description') ? <Text style={styles.editedTag}>Edited</Text> : null}
                </View>
              ) : null}
              {/* One calm provenance line — never alarming (nyx-voice). The
                  per-field markers say WHAT changed; this says WHEN. */}
              {row.edited_at ? (
                <Text style={styles.editedLine}>Edited {formatEditedDate(row.edited_at)}</Text>
              ) : null}
            </>
          )}
        </View>
      ) : null}

      {!dismissed && !editing ? (
        <TouchableOpacity
          onPress={handleRetry}
          disabled={retrying}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.rerunRow}
        >
          <Text style={styles.linkText}>{retrying ? 'Re-running…' : 'Re-run analysis'}</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.disclaimer}>This is a quick read of a single moment, not a diagnosis.</Text>
    </View>
  );
}

interface Observation {
  field: EditableStoolField;
  label: string;
  value: string;
  // Small, muted secondary annotation (consistency's Bristol type only).
  secondary?: string;
}

function buildObservations(row: AnalysisRow): Observation[] {
  const out: Observation[] = [];
  // Consistency leads with the plain-language label; the Bristol type is a small
  // secondary detail (§3.4).
  const consistency = labelFor(CONSISTENCY_OPTIONS, row.stool_consistency);
  if (consistency) {
    out.push({
      field: 'stool_consistency',
      label: 'Consistency',
      value: consistency,
      secondary: bristolFor(row.stool_consistency) ?? undefined,
    });
  }
  const colour = labelFor(COLOUR_OPTIONS, row.stool_colour);
  if (colour) out.push({ field: 'stool_colour', label: 'Colour', value: colour });
  if (row.stool_content && row.stool_content.length > 0) {
    const labels = row.stool_content.map((c) => labelFor(CONTENT_OPTIONS, c) ?? c).filter(Boolean);
    if (labels.length > 0) out.push({ field: 'stool_content', label: 'Contents', value: labels.join(', ') });
  }
  // Blood is clinically central — show it even when none is visible (a factual
  // observation feeding the report, distinct from the n=1 read's reassurance ban).
  const blood = bloodLabel(row.stool_blood_present, row.stool_blood_type);
  if (blood) out.push({ field: 'stool_blood_present', label: 'Blood', value: blood });
  // Mucus surfaces present-only (mucus alone is monitor-tier and common; it must
  // never be silently dropped when present, but "None visible" every time is noise).
  if (row.stool_mucus_present === 'yes') {
    out.push({ field: 'stool_mucus_present', label: 'Mucus', value: 'Present' });
  }
  if (row.foreign_material_present === 'yes') {
    out.push({
      field: 'foreign_material_present',
      label: 'Foreign material',
      value: row.foreign_material_note?.trim() || 'Possible',
    });
  }
  return out;
}

// The 'Blood' row is driven by presence but shows the type, so an edit to EITHER
// marks the row; likewise 'Foreign material' with its note.
function isObsRowEdited(editedSet: Set<EditableStoolField>, field: EditableStoolField): boolean {
  if (field === 'stool_blood_present') {
    return editedSet.has('stool_blood_present') || editedSet.has('stool_blood_type');
  }
  if (field === 'foreign_material_present') {
    return editedSet.has('foreign_material_present') || editedSet.has('foreign_material_note');
  }
  return editedSet.has(field);
}

// The live editable fields, pulled off the analysis row for the editor + the
// vs-AI diff. Column names mirror EDITABLE_STOOL_FIELDS.
function currentEditable(row: AnalysisRow): StoolEditableFields {
  return {
    stool_consistency: row.stool_consistency,
    stool_colour: row.stool_colour,
    stool_content: row.stool_content,
    stool_blood_present: row.stool_blood_present,
    stool_blood_type: row.stool_blood_type,
    stool_mucus_present: row.stool_mucus_present,
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
  pendingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    padding: theme.space2,
    minHeight: 48,
  },
  pendingText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  readCard: {
    borderRadius: theme.radiusMedium,
    padding: theme.space2,
    borderWidth: 1,
  },
  cardAttn: {
    backgroundColor: theme.colorAccentLight,
    borderColor: theme.colorAccent,
    borderLeftWidth: 3,
  },
  neutralCard: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    padding: theme.space2,
    borderWidth: 1,
  },
  mutedCard: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderColor: theme.colorBorder,
    borderStyle: 'dashed',
    borderRadius: theme.radiusMedium,
    padding: theme.space2,
    borderWidth: 1,
  },
  readHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  recLabel: {
    fontSize: theme.textXS,
    fontWeight: theme.fontWeightMedium,
    letterSpacing: theme.trackingWidest,
  },
  recLabelAttn: { color: theme.colorAccent },
  recLabelNeutral: { color: theme.colorTextSecondary },
  recLabelMuted: { color: theme.colorTextTertiary },
  dismissBtn: {
    marginLeft: theme.space1,
  },
  dismissX: {
    fontSize: 14,
    color: theme.colorTextTertiary,
  },
  readText: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightBody,
  },
  linkText: {
    fontSize: theme.textSM,
    color: theme.colorAccent,
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
  obsBlock: {
    marginTop: theme.space2,
    gap: 4,
  },
  obsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spaceMicro,
  },
  obsHeading: {
    fontSize: theme.textSM,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
  },
  editLink: {
    fontSize: theme.textSM,
    color: theme.colorAccent,
    fontWeight: theme.fontWeightMedium,
  },
  obsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.space2,
  },
  obsKey: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  obsValWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    flexShrink: 1,
    gap: 6,
  },
  obsVal: {
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
    fontWeight: theme.fontWeightMedium,
    flexShrink: 1,
    textAlign: 'right',
  },
  // The Bristol type — deliberately tertiary + small so the plain-language label
  // stays the primary framing and the number reads as a quiet clinical annotation
  // (§3.4, Designer).
  obsSecondary: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    fontWeight: theme.fontWeightMedium,
  },
  // Per-field provenance marker — deliberately tertiary + small so it reads as a
  // quiet annotation, never an alarm (Designer / nyx-voice).
  editedTag: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    fontWeight: theme.fontWeightMedium,
  },
  descWrap: {
    marginTop: 6,
    gap: theme.spaceMicro,
  },
  obsDescription: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: 19,
  },
  editedLine: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: 6,
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
  // The cap state — a calm neutral surface, deliberately identical in weight to the
  // neutral/failed cards (NOT the attention card, no accent border). It must never
  // read as alarm and never as an error.
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
    color: '#fff',
    fontWeight: theme.fontWeightMedium,
  },
});
