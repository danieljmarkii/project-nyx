import { useCallback, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { theme } from '../../constants/theme';
import { Header } from '../../components/ui';
import { ThemedText } from '../../components/ui/ThemedText';
import { WhorlSpinner } from '../../components/brand/WhorlSpinner';
import { VisitEditBody, type VisitEditFields } from '../../components/vetvisits/VisitEditBody';
import { useAllowlistFlag } from '../../hooks/useAppConfig';
import { useBetaOptIn } from '../../lib/betaFeatures';
import { resolveRecordPetName, usePetStore } from '../../store/petStore';
import { syncPendingVetVisits } from '../../lib/sync';
import { dayKeyToLocalDate } from '../../lib/utils';
import {
  localDateKey,
  readVetVisitDetail,
  updateVisitDetails,
  type LocalVetVisit,
} from '../../lib/vetVisits';

// Editing a visit (CUL-902 VV-4; mock D3's ⋯ *Edit*).
//
// A `?visit=` param rather than a path segment, matching its two siblings — and for
// the same reason: `app/vet-visits/[id].tsx` owns that segment for the visit's own
// read-only screen, and a second dynamic route under it would be two screens with
// one address.
export default function EditVisitScreen() {
  const eligible = useAllowlistFlag('vet_visits');
  const optedIn = useBetaOptIn('vet_visits');
  const enabled = eligible && optedIn;

  const { visit: visitId } = useLocalSearchParams<{ visit?: string }>();
  const pets = usePetStore((s) => s.pets);

  const [visit, setVisit] = useState<LocalVetVisit | null>(null);
  const [fields, setFields] = useState<VisitEditFields | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  // Seeded once. A re-focus must never overwrite an edit in progress — the
  // half-typed correction is the thing this screen exists to protect.
  const seeded = useRef(false);

  const load = useCallback(async () => {
    if (!enabled || !visitId) {
      setLoading(false);
      setLoaded(true);
      return;
    }
    try {
      const detail = await readVetVisitDetail(visitId);
      setVisit(detail?.visit ?? null);
      if (detail && !seeded.current) {
        seeded.current = true;
        setFields({
          // `visited_at` is a DATE column, read back through `dayKeyToLocalDate` — a
          // bare `new Date(key)` parses UTC midnight, which for anyone behind UTC
          // seeds the picker with the PREVIOUS day (B-441).
          visitedAt: dayKeyToLocalDate(detail.visit.visited_at) ?? new Date(),
          clinicName: detail.visit.clinic_name ?? '',
          vetName: detail.visit.vet_name ?? '',
          reason: detail.visit.reason ?? '',
          notes: detail.visit.notes ?? '',
        });
      }
      setFailed(false);
      setLoaded(true);
    } catch (err) {
      console.warn('[vet-visit-edit] read failed:', err);
      setFailed(true);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [enabled, visitId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleSave() {
    if (!visitId || !fields || saving) return;
    setSaving(true);
    try {
      await updateVisitDetails(visitId, {
        visitedAt: localDateKey(fields.visitedAt),
        clinicName: fields.clinicName,
        vetName: fields.vetName,
        reason: fields.reason,
        notes: fields.notes,
      });
      syncPendingVetVisits().catch(console.error);
      if (router.canGoBack()) router.back();
      else router.replace(`/vet-visits/${visitId}`);
    } catch (err) {
      console.warn('[vet-visit-edit] save failed:', err);
      Alert.alert('Could not save', 'Try that again in a moment.');
    } finally {
      setSaving(false);
    }
  }

  if (!enabled) return <Redirect href="/(tabs)/profile" />;

  // The RECORD's pet, never the active one (CUL-574 / AC 11).
  const petName = resolveRecordPetName(pets, visit?.pet_id);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Header
        leading="back"
        onLeadingPress={() => (router.canGoBack() ? router.back() : router.replace('/vet-visits'))}
      />
      {loading ? (
        <View style={styles.centre}>
          <WhorlSpinner size="md" ground="day" />
        </View>
      ) : failed ? (
        <View style={styles.centre}>
          <ThemedText style={styles.missing}>This visit could not be read just now.</ThemedText>
          <TouchableOpacity
            onPress={() => {
              setLoading(true);
              load();
            }}
            style={styles.retry}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <ThemedText style={styles.retryText}>Try again</ThemedText>
          </TouchableOpacity>
        </View>
      ) : fields ? (
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <VisitEditBody
              petName={petName}
              fields={fields}
              onChangeField={(key, value) =>
                setFields((prev) => (prev ? { ...prev, [key]: value } : prev))
              }
              saving={saving}
              onSave={handleSave}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      ) : loaded ? (
        <View style={styles.centre}>
          <ThemedText style={styles.missing}>This visit is no longer on the record.</ThemedText>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  fill: {
    flex: 1,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space3,
    gap: theme.space2,
  },
  scroll: {
    paddingHorizontal: theme.space3,
    paddingBottom: theme.space5,
  },
  retry: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.space2,
  },
  retryText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
  missing: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    textAlign: 'center',
  },
});
