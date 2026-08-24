import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { formatTime, formatExifAttribution } from '../../lib/utils';

// B-010 Direction 2 — explicit "Saw it / Found it" capture for discovery-prone
// events. Controlled: the parent owns the canonical state and the stored
// confidence is derived from the affordance touched, never asked as a quiz.
// "Saw it" stays one tap (it's pre-selected); "Found it" opens a progressive
// panel that is honest in one tap (window, latest=now) and refines only if the
// owner has more precision.

export type TimeMode = 'saw' | 'found';
export type FoundMode = 'before' | 'around' | 'between';
type OpenPicker = 'point' | 'estimated' | 'earliest' | 'latest' | null;

interface Props {
  // null = unclassified: a stored row with no recorded confidence (migration 012
  // NULL) seeds NEITHER segment, so the control shows the absence rather than a
  // borrowed "Saw it happen" (B-527). Only ever null on the edit screen; a fresh
  // log is always classified (log.tsx seeds 'saw').
  mode: TimeMode | null;
  onModeChange: (m: TimeMode) => void;
  // The single point — used for witnessed ('saw') and estimated ('around').
  point: Date;
  pointSource: 'manual' | 'exif' | 'now';
  onPointChange: (d: Date) => void;
  // Found sub-mode and window bounds.
  foundMode: FoundMode;
  onFoundModeChange: (m: FoundMode) => void;
  // Estimated point — kept distinct from `point` so a guess never leaks into a
  // witnessed log.
  estimatedAt: Date;
  onEstimatedChange: (d: Date) => void;
  earliest: Date | null;
  latest: Date;
  onEarliestChange: (d: Date) => void;
  onLatestChange: (d: Date) => void;
}

function stamp(d: Date): string {
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${formatTime(d)}`;
}

// A labelled time row. The WHOLE row is the button (CUL-579). It used to be a
// View whose value `Text` alone was touchable: the row read 44pt (its own
// minHeight) but only ~34pt of it responded, and tapping the "Found it by"
// LABEL — the most obviously tappable-looking half — did nothing at all. The
// flag-on twin, SimpleEventConfirm's `timeMain`, already makes the row the
// button; this is that shape, backported.
//
// No hitSlop, deliberately: the row is already at the floor, so slop would only
// reach into the 8pt gap the panel puts between two of these rows ("From"/"To"),
// making neighbours share hit area and resolve by z-order (CUL-612). Between two
// bounds of one window, that is a silently wrong bound.
function FieldRow({ label, value, onPress }: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.field}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      accessibilityHint="Opens a picker to change this time"
    >
      <ThemedText style={styles.fieldLab}>{label}</ThemedText>
      <ThemedText style={styles.fieldVal}>{value}</ThemedText>
    </TouchableOpacity>
  );
}

export function TimeConfidenceField({
  mode, onModeChange,
  point, pointSource, onPointChange,
  foundMode, onFoundModeChange,
  estimatedAt, onEstimatedChange,
  earliest, latest, onEarliestChange, onLatestChange,
}: Props) {
  const [open, setOpen] = useState<OpenPicker>(null);

  const pickerDisplay = Platform.OS === 'ios' ? 'inline' : 'default';

  function renderPicker(which: Exclude<OpenPicker, null>, value: Date, onPick: (d: Date) => void, maxDate: Date) {
    if (open !== which) return null;
    return (
      <DateTimePicker
        testID={`picker-${which}`}
        value={value}
        mode="datetime"
        display={pickerDisplay}
        maximumDate={maxDate}
        // Force light theme + brand accent so the picker stays readable when
        // the device is in OS dark mode against our white surfaces (cf. #28).
        themeVariant="light"
        accentColor={theme.colorAccent}
        onChange={(_e, d) => {
          if (Platform.OS === 'android') setOpen(null);
          if (d) onPick(d);
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.seg}>
        <TouchableOpacity
          style={[styles.segItem, mode === 'saw' && styles.segItemOn]}
          onPress={() => onModeChange('saw')}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <ThemedText style={[styles.segText, mode === 'saw' && styles.segTextOn]}>Saw it happen</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segItem, mode === 'found' && styles.segItemOn]}
          onPress={() => onModeChange('found')}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <ThemedText style={[styles.segText, mode === 'found' && styles.segTextOn]}>Found it</ThemedText>
        </TouchableOpacity>
      </View>

      {/* 'saw' shows the witnessed point; unclassified (null) shows the SAME
          neutral point row — the row itself asserts nothing, only the highlighted
          segment does — plus an honest line naming the absence (B-527). The point
          stays editable in both: correcting WHEN something happened is not a claim
          about how well the time is known, so it never selects a segment. */}
      {(mode === 'saw' || mode === null) && (
        <>
          <View style={styles.timeRow}>
            <ThemedText style={styles.timeLabel}>
              {stamp(point)}
              {/* geist-ok: Deliberately a raw <Text>, not a nested ThemedText (CUL-609; the CLAUDE.md
                  nested-span convention). A nested ThemedText's explicit fontFamily breaks RN's
                  native text-style cascade; this EXIF span differs from its parent only in colour,
                  so it inherits the parent's resolved Geist regular. See app/log.tsx. */}
              {pointSource === 'exif' && (
                <Text style={styles.exif}>{'  ·  '}{formatExifAttribution(point.toISOString())}</Text>
              )}
            </ThemedText>
            <TouchableOpacity onPress={() => setOpen(open === 'point' ? null : 'point')} hitSlop={12}>
              <ThemedText style={styles.change}>Change</ThemedText>
            </TouchableOpacity>
          </View>
          {renderPicker('point', point, onPointChange, new Date())}
          {mode === null && (
            <ThemedText style={styles.hint}>Not recorded as seen or found — choose one if you'd like.</ThemedText>
          )}
        </>
      )}

      {mode === 'found' && (
        <View style={styles.panel}>
          <ThemedText style={styles.panelHead}>When did it happen?</ThemedText>

          {/* All three modes are always reachable — selecting one is reversible
              (no one-way "Know roughly when?" door). 'before' is the default.

              These rows carry NO hitSlop on purpose (CUL-579). `radioRow` is
              already minHeight 44, so slop bought no reach — it only pushed 8pt
              into the 8pt gap the panel puts between them, from both sides, so
              adjacent radios shared hit area and a tap near the boundary landed
              by z-order (CUL-612). Here that silently swaps one confidence class
              for another — an honest window becomes a guessed point — and the
              vet report prints the difference. Don't add it back. */}
          <TouchableOpacity style={styles.radioRow} onPress={() => onFoundModeChange('before')}>
            <View style={[styles.radio, foundMode === 'before' && styles.radioOn]}>
              {foundMode === 'before' && <View style={styles.radioDot} />}
            </View>
            <ThemedText style={styles.radioLab}>Sometime before</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.radioRow} onPress={() => onFoundModeChange('around')}>
            <View style={[styles.radio, foundMode === 'around' && styles.radioOn]}>
              {foundMode === 'around' && <View style={styles.radioDot} />}
            </View>
            <ThemedText style={styles.radioLab}>Around a time</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.radioRow} onPress={() => onFoundModeChange('between')}>
            <View style={[styles.radio, foundMode === 'between' && styles.radioOn]}>
              {foundMode === 'between' && <View style={styles.radioDot} />}
            </View>
            <ThemedText style={styles.radioLab}>Between two times</ThemedText>
          </TouchableOpacity>

          {foundMode === 'before' && (
            <>
              <FieldRow
                label="Found it by"
                value={stamp(latest)}
                onPress={() => setOpen(open === 'latest' ? null : 'latest')}
              />
              {renderPicker('latest', latest, onLatestChange, new Date())}
              <ThemedText style={styles.hint}>Recorded as “found by {formatTime(latest)}” — no guessing.</ThemedText>
            </>
          )}

          {foundMode === 'around' && (
            <>
              <FieldRow
                label="Around"
                value={stamp(estimatedAt)}
                onPress={() => setOpen(open === 'estimated' ? null : 'estimated')}
              />
              {renderPicker('estimated', estimatedAt, onEstimatedChange, new Date())}
              <ThemedText style={styles.hint}>A best guess — logged as an estimate, not a witnessed time.</ThemedText>
            </>
          )}

          {foundMode === 'between' && (
            <>
              <FieldRow
                label="From"
                value={earliest ? stamp(earliest) : 'Set time'}
                onPress={() => setOpen(open === 'earliest' ? null : 'earliest')}
              />
              {renderPicker('earliest', earliest ?? latest, onEarliestChange, latest)}
              <FieldRow
                label="To"
                value={stamp(latest)}
                onPress={() => setOpen(open === 'latest' ? null : 'latest')}
              />
              {renderPicker('latest', latest, onLatestChange, new Date())}
              <ThemedText style={styles.hint}>The full range is kept for your vet.</ThemedText>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.space1,
  },
  // Segmented control
  seg: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: theme.colorBorderStrong,
    borderRadius: theme.radiusSmall,
    overflow: 'hidden',
  },
  segItem: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segItemOn: {
    backgroundColor: theme.colorNeutralDark,
  },
  segText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  segTextOn: {
    color: theme.colorSurface,
  },
  // Witnessed time row
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  timeLabel: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  exif: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
  },
  change: {
    fontSize: theme.textSM,
    color: theme.colorAccent,
  },
  // Found panel
  panel: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    padding: theme.space2,
    gap: theme.space1,
  },
  panelHead: {
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorNeutralMid,
  },
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
  fieldLab: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  fieldVal: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  hint: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    minHeight: 44,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: theme.radiusFull,
    borderWidth: 2,
    borderColor: theme.colorBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: {
    borderColor: theme.colorAccent,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorAccent,
  },
  radioLab: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
});
