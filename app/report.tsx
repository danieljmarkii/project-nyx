import { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../constants/theme';
import { Header, PrimaryButton, SectionLabel } from '../components/ui';
import { ChipGroup } from '../components/ui/ChipGroup';
import { usePetStore } from '../store/petStore';
import { toLocalDayKey, dayKeyToLocalDate } from '../lib/utils';
import { generateVetReport, shareReportPdf, type VetReport, type VetReportParams } from '../lib/pdf';

// Vet report — owner-facing MVP (Step 9, Phase 2 PR 5) + range control (PR 5d / B-222).
//
// The owner opens "Vet report" and sees the report *inside the app* (a WebView of
// the server-rendered clinical HTML — never a downloaded .html file, §8.2), then
// taps "Send to vet" to hand it over as a PDF via the native share sheet. No public
// link / no unauthenticated path yet (PR 6). The report always renders SOMETHING —
// the empty/sparse states are designed into the HTML by render.ts (Principle 5) —
// so there is no "no data" screen state here; only loading / error.
//
// Range control (B-222): the owner chooses the report window at generation time.
// "Recommended" sends NO override, so the server resolves the §6 default cascade
// (since last visit → active diet trial → 90-day fallback) and does NOT show the
// cherry-pick disclosure. "Last 90 days" and "Custom…" send an explicit window,
// which the server treats as a hand-picked scope and discloses the count of any
// symptom events that fall outside it ("nothing cropped to a good week", §6). The
// disclosure is rendered *inside* the report HTML by render.ts — this screen only
// picks the window; it never renders the disclosure itself.

type Status = 'loading' | 'ready' | 'error';
type RangeMode = 'default' | 'last90' | 'custom';

// Mirrors the server's §6 rung-3 fallback window (report.ts FALLBACK_DAYS) so
// "Last 90 days" reproduces exactly the same 90 inclusive calendar days.
const LAST_90_DAYS = 90;

const RANGE_OPTIONS: { value: RangeMode; label: string }[] = [
  { value: 'default', label: 'Recommended' },
  { value: 'last90', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom…' },
];

// toLocalDayKey / dayKeyToLocalDate live in lib/utils (unit-tested there) — the
// server treats window bounds as local calendar days, so both avoid a UTC
// round-trip that would shift the day for owners behind UTC.

function formatDayKey(key: string): string {
  const d = dayKeyToLocalDate(key);
  return d ? d.toLocaleDateString([], { month: 'short', day: 'numeric' }) : key;
}

function formatFieldDate(d: Date): string {
  return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}

const SCOPE_BASIS_LABEL: Record<string, string> = {
  since_visit: 'Since your last visit',
  diet_trial: 'Active diet trial',
  fallback_90d: 'Last 90 days',
  custom: 'Custom range',
};

export default function ReportScreen() {
  const activePet = usePetStore((s) => s.activePet);
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<Status>('loading');
  const [report, setReport] = useState<VetReport | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [sharing, setSharing] = useState(false);

  const [rangeMode, setRangeMode] = useState<RangeMode>('default');
  // Custom window defaults to the same 90-day span as the fallback, so "Custom…"
  // opens on a sensible range the owner narrows from, rather than an empty picker.
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - (LAST_90_DAYS - 1));
    return d;
  });
  const [customEnd, setCustomEnd] = useState(() => new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const petId = activePet?.id;
  const customStartKey = toLocalDayKey(customStart);
  const customEndKey = toLocalDayKey(customEnd);

  // The exact params for the current selection. Keyed on date STRINGS (not Date
  // objects) so an inline picker firing onChange with the same day doesn't churn
  // a regenerate. "Recommended" sends no dates → the server §6 cascade + no
  // cherry-pick disclosure; the other modes send an explicit window → disclosure.
  const requestParams = useMemo<VetReportParams | null>(() => {
    if (!petId) return null;
    if (rangeMode === 'default') return { petId };
    if (rangeMode === 'last90') {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - (LAST_90_DAYS - 1));
      return { petId, startDate: toLocalDayKey(start), endDate: toLocalDayKey(end) };
    }
    return { petId, startDate: customStartKey, endDate: customEndKey };
  }, [petId, rangeMode, customStartKey, customEndKey]);

  // `token` guards against a stale response: if the pet or the selected range
  // changes while a generate call is in flight, the older response must not
  // overwrite the newer one.
  const load = useCallback(
    async (token?: { cancelled: boolean }) => {
      if (!requestParams) {
        setErrorMsg('Add a pet before generating a report.');
        setStatus('error');
        return;
      }
      setStatus('loading');
      try {
        const r = await generateVetReport(requestParams);
        if (token?.cancelled) return;
        setReport(r);
        setStatus('ready');
      } catch (e) {
        if (token?.cancelled) return;
        setErrorMsg(e instanceof Error ? e.message : 'Something went wrong preparing the report.');
        setStatus('error');
      }
    },
    [requestParams],
  );

  // Regenerate whenever the pet or the chosen window changes. The report is a
  // snapshot; changing the range re-generates against the latest data.
  useEffect(() => {
    const token = { cancelled: false };
    load(token);
    return () => {
      token.cancelled = true;
    };
  }, [load]);

  const onShare = useCallback(async () => {
    if (!report) return;
    setSharing(true);
    try {
      const shared = await shareReportPdf(report);
      if (!shared) {
        Alert.alert('Sharing unavailable', "This device can't open a share sheet.");
      }
    } catch (e) {
      Alert.alert("Couldn't create the PDF", e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSharing(false);
    }
  }, [report]);

  // The concrete window the server resolved, so the owner sees what "Recommended"
  // landed on without scrolling into the report's own range box. Gated on the
  // 'ready' status so a range change doesn't leave the PREVIOUS report's resolved
  // window on screen while the new one is still generating (stale-label guard).
  const resolvedLabel =
    status === 'ready' && report && report.startDate && report.endDate
      ? `${SCOPE_BASIS_LABEL[report.scopeBasis] ?? 'Report range'} · ${formatDayKey(report.startDate)} – ${formatDayKey(report.endDate)}`
      : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Vet report" leading="back" onLeadingPress={() => router.back()} />

      {activePet && (
        <View style={styles.rangeBar}>
          <SectionLabel label="Report range" />
          <ChipGroup
            options={RANGE_OPTIONS}
            value={rangeMode}
            onChange={(v) => {
              if (v) setRangeMode(v as RangeMode);
            }}
            allowDeselect={false}
            variant="default"
            accessibilityLabel="Report range"
          />

          {rangeMode === 'custom' && (
            <View style={styles.customFields}>
              <View style={styles.customField}>
                <Text style={styles.customFieldLabel}>From</Text>
                <TouchableOpacity
                  style={styles.dateField}
                  onPress={() => {
                    setShowStartPicker((s) => !s);
                    setShowEndPicker(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Start date, ${formatFieldDate(customStart)}`}
                >
                  <Text style={styles.dateFieldText}>{formatFieldDate(customStart)}</Text>
                  <Text style={styles.dateChangeText}>Change</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.customField}>
                <Text style={styles.customFieldLabel}>To</Text>
                <TouchableOpacity
                  style={styles.dateField}
                  onPress={() => {
                    setShowEndPicker((s) => !s);
                    setShowStartPicker(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`End date, ${formatFieldDate(customEnd)}`}
                >
                  <Text style={styles.dateFieldText}>{formatFieldDate(customEnd)}</Text>
                  <Text style={styles.dateChangeText}>Change</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {showStartPicker && rangeMode === 'custom' && (
            <DateTimePicker
              value={customStart}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              maximumDate={customEnd}
              onChange={(_e, date) => {
                if (Platform.OS === 'android') setShowStartPicker(false);
                if (date) setCustomStart(date);
              }}
            />
          )}
          {showEndPicker && rangeMode === 'custom' && (
            <DateTimePicker
              value={customEnd}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              minimumDate={customStart}
              maximumDate={new Date()}
              onChange={(_e, date) => {
                if (Platform.OS === 'android') setShowEndPicker(false);
                if (date) setCustomEnd(date);
              }}
            />
          )}

          {resolvedLabel && <Text style={styles.rangeResolved}>{resolvedLabel}</Text>}
        </View>
      )}

      {status === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colorTextSecondary} />
          <Text style={styles.muted}>
            Putting together {activePet ? `${activePet.name}’s` : 'the'} report…
          </Text>
        </View>
      )}

      {status === 'error' && (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn’t prepare the report</Text>
          <Text style={styles.muted}>{errorMsg}</Text>
          <PrimaryButton label="Try again" onPress={() => load()} variant="secondary" style={styles.retry} />
        </View>
      )}

      {status === 'ready' && report && (
        <>
          <WebView
            style={styles.web}
            originWhitelist={['*']}
            source={{ html: report.html }}
            // The report is static, self-contained clinical HTML — no scripts, no
            // third-party subresources (§8). Disabling JS keeps the surface minimal.
            javaScriptEnabled={false}
            showsVerticalScrollIndicator
          />
          <View style={[styles.bar, { paddingBottom: insets.bottom + theme.space2 }]}>
            <PrimaryButton
              label={sharing ? 'Preparing PDF…' : 'Send to vet'}
              onPress={onShare}
              disabled={sharing}
            />
            <Text style={styles.barHint}>
              Creates a PDF you can email, message, or AirDrop to your vet.
            </Text>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorSurface },
  web: { flex: 1, backgroundColor: theme.colorSurface },

  // ── Range control ──
  rangeBar: {
    paddingHorizontal: theme.space2,
    paddingTop: theme.space2,
    paddingBottom: theme.space2,
    backgroundColor: theme.colorSurface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
    gap: theme.space2,
  },
  customFields: {
    flexDirection: 'row',
    gap: theme.space2,
  },
  customField: {
    flex: 1,
    gap: theme.space1,
  },
  customFieldLabel: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    height: 44,
  },
  dateFieldText: {
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  dateChangeText: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorAccent,
  },
  rangeResolved: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space3,
    gap: theme.space2,
  },
  muted: {
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    textAlign: 'center',
  },
  errorTitle: {
    fontFamily: theme.fontBodySemibold,
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    textAlign: 'center',
  },
  retry: { marginTop: theme.space2, paddingHorizontal: theme.space3 },
  bar: {
    paddingHorizontal: theme.space2,
    paddingTop: theme.space2,
    backgroundColor: theme.colorSurface,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    gap: theme.space1,
  },
  barHint: {
    fontFamily: theme.fontBody,
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    textAlign: 'center',
  },
});
