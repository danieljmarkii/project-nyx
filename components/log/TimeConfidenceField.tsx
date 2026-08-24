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
              (no one-way "Know roughly when?" door). 'before' is the default. */}
          <TouchableOpacity style={styles.radioRow} onPress={() => onFoundModeChange('before')} hitSlop={8}>
            <View style={[styles.radio, foundMode === 'before' && styles.radioOn]}>
              {foundMode === 'before' && <View style={styles.radioDot} />}
            </View>
            <ThemedText style={styles.radioLab}>Sometime before</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.radioRow} onPress={() => onFoundModeChange('around')} hitSlop={8}>
            <View style={[styles.radio, foundMode === 'around' && styles.radioOn]}>
              {foundMode === 'around' && <View style={styles.radioDot} />}
            </View>
            <ThemedText style={styles.radioLab}>Around a time</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.radioRow} onPress={() => onFoundModeChange('between')} hitSlop={8}>
            <View style={[styles.radio, foundMode === 'between' && styles.radioOn]}>
              {foundMode === 'between' && <View style={styles.radioDot} />}
            </View>
            <ThemedText style={styles.radioLab}>Between two times</ThemedText>
          </TouchableOpacity>

          {foundMode === 'before' && (
            <>
              <View style={styles.field}>
                <ThemedText style={styles.fieldLab}>Found it by</ThemedText>
                <TouchableOpacity onPress={() => setOpen(open === 'latest' ? null : 'latest')} hitSlop={8}>
                  <ThemedText style={styles.fieldVal}>{stamp(latest)}</ThemedText>
                </TouchableOpacity>
              </View>
              {renderPicker('latest', latest, onLatestChange, new Date())}
              <ThemedText style={styles.hint}>Recorded as “found by {formatTime(latest)}” — no guessing.</ThemedText>
            </>
          )}

          {foundMode === 'around' && (
            <>
              <View style={styles.field}>
                <ThemedText style={styles.fieldLab}>Around</ThemedText>
                <TouchableOpacity onPress={() => setOpen(open === 'estimated' ? null : 'estimated')} hitSlop={8}>
                  <ThemedText style={styles.fieldVal}>{stamp(estimatedAt)}</ThemedText>
                </TouchableOpacity>
              </View>
              {renderPicker('estimated', estimatedAt, onEstimatedChange, new Date())}
              <ThemedText style={styles.hint}>A best guess — logged as an estimate, not a witnessed time.</ThemedText>
            </>
          )}

          {foundMode === 'between' && (
            <>
              <View style={styles.field}>
                <ThemedText style={styles.fieldLab}>From</ThemedText>
                <TouchableOpacity onPress={() => setOpen(open === 'earliest' ? null : 'earliest')} hitSlop={8}>
                  <ThemedText style={styles.fieldVal}>{earliest ? stamp(earliest) : 'Set time'}</ThemedText>
                </TouchableOpacity>
              </View>
              {renderPicker('earliest', earliest ?? latest, onEarliestChange, latest)}
              <View style={styles.field}>
                <ThemedText style={styles.fieldLab}>To</ThemedText>
                <TouchableOpacity onPress={() => setOpen(open === 'latest' ? null : 'latest')} hitSlop={8}>
                  <ThemedText style={styles.fieldVal}>{stamp(latest)}</ThemedText>
                </TouchableOpacity>
              </View>
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
