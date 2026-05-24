import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../../constants/theme';
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
  mode: TimeMode;
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
          <Text style={[styles.segText, mode === 'saw' && styles.segTextOn]}>Saw it happen</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segItem, mode === 'found' && styles.segItemOn]}
          onPress={() => onModeChange('found')}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Text style={[styles.segText, mode === 'found' && styles.segTextOn]}>Found it</Text>
        </TouchableOpacity>
      </View>

      {mode === 'saw' && (
        <>
          <View style={styles.timeRow}>
            <Text style={styles.timeLabel}>
              {stamp(point)}
              {pointSource === 'exif' && (
                <Text style={styles.exif}>{'  ·  '}{formatExifAttribution(point.toISOString())}</Text>
              )}
            </Text>
            <TouchableOpacity onPress={() => setOpen(open === 'point' ? null : 'point')} hitSlop={12}>
              <Text style={styles.change}>Change</Text>
            </TouchableOpacity>
          </View>
          {renderPicker('point', point, onPointChange, new Date())}
        </>
      )}

      {mode === 'found' && (
        <View style={styles.panel}>
          <Text style={styles.panelHead}>When did it happen?</Text>

          {foundMode === 'before' ? (
            <>
              <View style={styles.field}>
                <Text style={styles.fieldLab}>Sometime before</Text>
                <TouchableOpacity onPress={() => setOpen(open === 'latest' ? null : 'latest')} hitSlop={8}>
                  <Text style={styles.fieldVal}>{stamp(latest)}</Text>
                </TouchableOpacity>
              </View>
              {renderPicker('latest', latest, onLatestChange, new Date())}
              <Text style={styles.hint}>Stamped to when you found it. Logs as-is.</Text>
              <TouchableOpacity style={styles.knowRow} onPress={() => onFoundModeChange('around')} hitSlop={8}>
                <Text style={styles.knowText}>Know roughly when?</Text>
                <Text style={styles.chev}>›</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.modePick}>
                <TouchableOpacity style={styles.radioRow} onPress={() => onFoundModeChange('around')} hitSlop={8}>
                  <View style={[styles.radio, foundMode === 'around' && styles.radioOn]}>
                    {foundMode === 'around' && <View style={styles.radioDot} />}
                  </View>
                  <Text style={styles.radioLab}>Around a time</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.radioRow} onPress={() => onFoundModeChange('between')} hitSlop={8}>
                  <View style={[styles.radio, foundMode === 'between' && styles.radioOn]}>
                    {foundMode === 'between' && <View style={styles.radioDot} />}
                  </View>
                  <Text style={styles.radioLab}>Between two times</Text>
                </TouchableOpacity>
              </View>

              {foundMode === 'around' ? (
                <>
                  <View style={styles.field}>
                    <Text style={styles.fieldLab}>Around</Text>
                    <TouchableOpacity onPress={() => setOpen(open === 'estimated' ? null : 'estimated')} hitSlop={8}>
                      <Text style={styles.fieldVal}>{stamp(estimatedAt)}</Text>
                    </TouchableOpacity>
                  </View>
                  {renderPicker('estimated', estimatedAt, onEstimatedChange, new Date())}
                  <Text style={styles.hint}>A best guess — logged as an estimate, not a witnessed time.</Text>
                </>
              ) : (
                <>
                  <View style={styles.field}>
                    <Text style={styles.fieldLab}>From</Text>
                    <TouchableOpacity onPress={() => setOpen(open === 'earliest' ? null : 'earliest')} hitSlop={8}>
                      <Text style={styles.fieldVal}>{earliest ? stamp(earliest) : 'Set time'}</Text>
                    </TouchableOpacity>
                  </View>
                  {renderPicker('earliest', earliest ?? latest, onEarliestChange, latest)}
                  <View style={styles.field}>
                    <Text style={styles.fieldLab}>To</Text>
                    <TouchableOpacity onPress={() => setOpen(open === 'latest' ? null : 'latest')} hitSlop={8}>
                      <Text style={styles.fieldVal}>{stamp(latest)}</Text>
                    </TouchableOpacity>
                  </View>
                  {renderPicker('latest', latest, onLatestChange, new Date())}
                  <Text style={styles.hint}>Stored as the midpoint; the range is kept for your vet.</Text>
                </>
              )}
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
  knowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  knowText: {
    fontSize: theme.textSM,
    color: theme.colorAccent,
  },
  chev: {
    fontSize: theme.textMD,
    color: theme.colorTextTertiary,
  },
  modePick: {
    flexDirection: 'row',
    gap: theme.space3,
    paddingVertical: theme.space1,
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
