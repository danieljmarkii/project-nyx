import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, ScrollView,
  Share, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { theme } from '../constants/theme';
import { Card } from '../components/ui/Card';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { Divider } from '../components/ui/Divider';
import { supabase } from '../lib/supabase';
import { generateVetReport } from '../lib/pdf';
import { usePetStore } from '../store/petStore';

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatDisplayDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

type PickerTarget = 'start' | 'end' | null;

export default function ReportScreen() {
  const { activePet } = usePetStore();

  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const [startDate, setStartDate] = useState(toDateString(thirtyDaysAgo));
  const [endDate, setEndDate] = useState(toDateString(today));
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);

  const [lastVisitDate, setLastVisitDate] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);

  // Fetch most recent vet visit to offer as a quick date preset
  useEffect(() => {
    if (!activePet) return;
    supabase
      .from('vet_visits')
      .select('visited_at')
      .eq('pet_id', activePet.id)
      .order('visited_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.visited_at) setLastVisitDate(data.visited_at);
      });
  }, [activePet?.id]);

  function applyLastVisitPreset() {
    if (!lastVisitDate) return;
    setStartDate(lastVisitDate);
    setEndDate(toDateString(today));
    setShareUrl(null);
    setShareToken(null);
  }

  function applyThirtyDayPreset() {
    setStartDate(toDateString(thirtyDaysAgo));
    setEndDate(toDateString(today));
    setShareUrl(null);
    setShareToken(null);
  }

  function openPicker(target: PickerTarget) {
    setPickerTarget(target);
    // Reset result when date range changes
    setShareUrl(null);
    setShareToken(null);
  }

  function handleDateChange(_: unknown, selected?: Date) {
    if (Platform.OS === 'android') setPickerTarget(null);
    if (!selected) return;
    const val = toDateString(selected);
    if (pickerTarget === 'start') {
      setStartDate(val);
      // Keep end >= start
      if (val > endDate) setEndDate(val);
    } else if (pickerTarget === 'end') {
      setEndDate(val);
      // Keep start <= end
      if (val < startDate) setStartDate(val);
    }
    if (Platform.OS === 'ios') setPickerTarget(null);
  }

  async function handleGenerate() {
    if (!activePet) return;
    setGenerating(true);
    try {
      const result = await generateVetReport({
        petId: activePet.id,
        dateRangeStart: startDate,
        dateRangeEnd: endDate,
      });
      setShareUrl(result.shareUrl);
      setShareToken(result.shareToken);
    } catch (err) {
      console.error('[Report] generation failed:', err);
      Alert.alert(
        'Report generation failed',
        'Make sure the generate-report Edge Function is deployed and the nyx-vet-reports storage bucket exists.',
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleShare() {
    if (!shareUrl) return;
    try {
      await Share.share({ message: shareUrl, url: shareUrl });
    } catch {
      // User dismissed share sheet — no action needed
    }
  }

  if (!activePet) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No pet profile found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const canGenerate = startDate <= endDate;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Vet report</Text>
          <Text style={styles.subtitle}>{activePet.name}</Text>
        </View>

        {/* ── Date range ── */}
        <Card style={styles.section}>
          <Text style={styles.sectionLabel}>DATE RANGE</Text>
          <Divider />

          {/* Quick presets */}
          <View style={styles.presetRow}>
            <TouchableOpacity style={styles.preset} onPress={applyThirtyDayPreset} activeOpacity={0.7}>
              <Text style={styles.presetText}>Last 30 days</Text>
            </TouchableOpacity>
            {lastVisitDate && (
              <TouchableOpacity style={styles.preset} onPress={applyLastVisitPreset} activeOpacity={0.7}>
                <Text style={styles.presetText}>Since last visit</Text>
                <Text style={styles.presetSub}>{formatDisplayDate(lastVisitDate)}</Text>
              </TouchableOpacity>
            )}
          </View>

          <Divider />

          {/* Date rows */}
          <TouchableOpacity style={styles.dateRow} onPress={() => openPicker('start')} activeOpacity={0.7}>
            <Text style={styles.dateLabel}>From</Text>
            <Text style={styles.dateValue}>{formatDisplayDate(startDate)}</Text>
          </TouchableOpacity>
          <Divider />
          <TouchableOpacity style={styles.dateRow} onPress={() => openPicker('end')} activeOpacity={0.7}>
            <Text style={styles.dateLabel}>To</Text>
            <Text style={styles.dateValue}>{formatDisplayDate(endDate)}</Text>
          </TouchableOpacity>
        </Card>

        {/* Date picker (iOS: inline after tap; Android: modal dialog) */}
        {pickerTarget !== null && (
          <DateTimePicker
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            value={new Date((pickerTarget === 'start' ? startDate : endDate) + 'T00:00:00Z')}
            maximumDate={today}
            onChange={handleDateChange}
          />
        )}

        {/* ── Generate ── */}
        <View style={styles.section}>
          <PrimaryButton
            label={generating ? 'Generating…' : 'Generate report'}
            onPress={handleGenerate}
            disabled={generating || !canGenerate}
          />
          {!canGenerate && (
            <Text style={styles.errorText}>Start date must be before end date.</Text>
          )}
        </View>

        {/* ── Result ── */}
        {shareUrl && (
          <Card style={styles.resultCard}>
            <Text style={styles.resultTitle}>Report ready</Text>
            <Text style={styles.resultBody}>
              Share the link below with your vet. It opens the PDF directly — no Nyx account required.
              The link expires in 30 days.
            </Text>
            <Divider />
            <Text style={styles.urlText} numberOfLines={2}>{shareUrl}</Text>
            <Divider />
            <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.75}>
              <Text style={styles.shareBtnText}>Share report</Text>
            </TouchableOpacity>
            {shareToken && (
              <Text style={styles.tokenText}>Token: {shareToken}</Text>
            )}
          </Card>
        )}

        {/* ── Clinical note ── */}
        <Card style={styles.noteCard}>
          <Text style={styles.noteText}>
            The report includes event counts, symptom severity averages, a full meal log with food
            names, active conditions, and any ongoing diet trials. It is formatted for clinical
            review — no branding, no decorative elements.
          </Text>
        </Card>

        <View style={styles.bottomPad} />
      </ScrollView>

      {generating && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colorAccent} />
          <Text style={styles.loadingText}>Building report…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  scroll: {
    padding: theme.space3,
    gap: theme.space2,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },

  // ── Header ──
  header: {
    gap: 4,
    marginBottom: theme.space1,
  },
  backBtn: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  backText: {
    fontSize: theme.textSM,
    color: theme.colorAccent,
    fontWeight: theme.weightMedium,
  },
  title: {
    fontSize: theme.textXL,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
  subtitle: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },

  // ── Date range card ──
  section: {
    gap: 0,
  },
  sectionLabel: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    letterSpacing: theme.trackingWidest,
    paddingBottom: theme.space1,
  },
  presetRow: {
    flexDirection: 'row',
    gap: theme.space1,
    paddingVertical: 10,
  },
  preset: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.radiusSmall,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    gap: 2,
  },
  presetText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccent,
  },
  presetSub: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  dateLabel: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    fontWeight: theme.weightMedium,
  },
  dateValue: {
    fontSize: theme.textMD,
    color: theme.colorNeutralDark,
    fontWeight: theme.weightMedium,
  },

  errorText: {
    fontSize: theme.textSM,
    color: theme.colorEventSymptom,
    textAlign: 'center',
    marginTop: 6,
  },

  // ── Result card ──
  resultCard: {
    gap: theme.space1,
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  resultTitle: {
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
  resultBody: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: 20,
  },
  urlText: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  shareBtn: {
    paddingVertical: 12,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorAccent,
    alignItems: 'center',
  },
  shareBtnText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: '#fff',
  },
  tokenText: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },

  // ── Note ──
  noteCard: {
    backgroundColor: theme.colorSurfaceSubtle,
  },
  noteText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: 20,
  },

  // ── Loading overlay ──
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space2,
  },
  loadingText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },

  bottomPad: {
    height: theme.space5,
  },
});
