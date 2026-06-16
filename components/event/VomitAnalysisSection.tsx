// Per-incident vomit AI analysis, rendered on the event detail screen (B-027,
// under B-013). Self-contained: reads the event_ai_analysis row from Supabase
// (written server-side by the analyze-vomit Edge Function), triggers analysis
// lazily if none exists yet, and polls while it runs.
//
// Scope of THIS component (v1): display the AI read + structured observations,
// dismiss/undismiss the read, retry on failure, and the pending / uncertain /
// failed states. Owner editing of the structured fields + the per-field
// "Edited [date]" provenance is a deliberate fast-follow (see PR / B-027).
//
// Guardrail (Dr. Chen, B-013): the read ESCALATES on a visible/contextual red
// flag and NEVER reassures on absence. The recommendation enum has no
// reassuring value, so this component never renders an "all clear".
import { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { theme } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { triggerVomitAnalysis } from '../../lib/analysis';

type Status = 'pending' | 'completed' | 'failed' | 'uncertain';
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
  dismissed_at: string | null;
  error: string | null;
}

const SELECT_COLS =
  'status, recommendation, read_text, description, colour, contents, consistency, ' +
  'blood_present, bile_present, foreign_material_present, foreign_material_note, dismissed_at, error';

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 12; // ~36s — covers a slow vision call without spinning forever

// ── Enum → owner-facing labels ────────────────────────────────────────────────
const COLOUR_LABELS: Record<string, string> = {
  clear: 'Clear', white: 'White', yellow: 'Yellow', green: 'Green', brown: 'Brown',
  tan: 'Tan', pink_red: 'Pink / red', dark_red: 'Dark red',
  black_coffee_ground: 'Black', mixed: 'Mixed', unsure: 'Unclear',
};
const CONTENT_LABELS: Record<string, string> = {
  undigested_food: 'Undigested food', partially_digested_food: 'Partly digested food',
  bile: 'Bile', foam: 'Foam', liquid_only: 'Liquid', grass_or_plant: 'Grass / plant',
  hair: 'Hair', unsure: 'Unclear',
};
const CONSISTENCY_LABELS: Record<string, string> = {
  watery: 'Watery', foamy: 'Foamy', mucoid_slimy: 'Slimy',
  soft_formed: 'Soft / formed', chunky: 'Chunky', unsure: 'Unclear',
};
const BLOOD_LABELS: Record<string, string> = {
  none_visible: 'None visible', fresh_red: 'Fresh red',
  coffee_ground: 'Dark / older blood', unsure: 'Unclear',
};

const REC_LABEL: Record<Recommendation, string> = {
  worth_a_call: 'Worth a call',
  monitor: 'Keep an eye out',
  not_enough_to_say: 'Not enough to say yet',
};

export function VomitAnalysisSection({ eventId }: { eventId: string }) {
  const [row, setRow] = useState<AnalysisRow | null | undefined>(undefined); // undefined = first load
  const [working, setWorking] = useState(false); // analysis in flight (triggered or polling)
  const [retrying, setRetrying] = useState(false);
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
    const { error } = await triggerVomitAnalysis(eventId);
    if (cancelled.current) return;
    if (error) console.warn('[vomit-analysis] trigger error:', error);
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
    const { error } = await triggerVomitAnalysis(eventId);
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

  // ── Render states ──

  // First load, nothing known yet.
  if (row === undefined && !working) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>AI READ</Text>
        <View style={styles.pendingBox}>
          <ActivityIndicator size="small" color={theme.colorAccent} />
        </View>
      </View>
    );
  }

  const status: Status | undefined = row?.status;

  // Pending / actively working.
  if (working || status === 'pending') {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>AI READ</Text>
        <View style={styles.pendingBox}>
          <ActivityIndicator size="small" color={theme.colorAccent} />
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
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.retryBtnText}>Try again</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // No analysis and not working (e.g. gave up, or never had a photo/context).
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

      {!dismissed && observations.length > 0 ? (
        <View style={styles.obsBlock}>
          <Text style={styles.obsHeading}>What's visible</Text>
          {observations.map((o) => (
            <View key={o.label} style={styles.obsRow}>
              <Text style={styles.obsKey}>{o.label}</Text>
              <Text style={styles.obsVal}>{o.value}</Text>
            </View>
          ))}
          {row.description ? <Text style={styles.obsDescription}>{row.description}</Text> : null}
        </View>
      ) : null}

      {!dismissed ? (
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

function buildObservations(row: AnalysisRow): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (row.colour && COLOUR_LABELS[row.colour]) out.push({ label: 'Colour', value: COLOUR_LABELS[row.colour] });
  if (row.consistency && CONSISTENCY_LABELS[row.consistency]) {
    out.push({ label: 'Consistency', value: CONSISTENCY_LABELS[row.consistency] });
  }
  if (row.contents && row.contents.length > 0) {
    const labels = row.contents.map((c) => CONTENT_LABELS[c] ?? c).filter(Boolean);
    if (labels.length > 0) out.push({ label: 'Contents', value: labels.join(', ') });
  }
  // Blood is clinically central — show it even when none is visible (a factual
  // observation feeding the report, distinct from the n=1 read's reassurance ban).
  if (row.blood_present && BLOOD_LABELS[row.blood_present]) {
    out.push({ label: 'Blood', value: BLOOD_LABELS[row.blood_present] });
  }
  if (row.foreign_material_present === 'yes') {
    out.push({ label: 'Foreign material', value: row.foreign_material_note?.trim() || 'Possible' });
  }
  return out;
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
  obsHeading: {
    fontSize: theme.textSM,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
    marginBottom: 2,
  },
  obsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  obsKey: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  obsVal: {
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
    fontWeight: theme.fontWeightMedium,
  },
  obsDescription: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: 19,
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
