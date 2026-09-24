import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { theme } from '../../constants/theme';
import { Header } from '../../components/ui';
import { ThemedText } from '../../components/ui/ThemedText';
import { WhorlSpinner } from '../../components/brand/WhorlSpinner';
import { VisitEditBody, type VisitEditFields } from '../../components/vetvisits/VisitEditBody';
import { resolveRecordPetName, usePetStore } from '../../store/petStore';
import { syncPendingVetVisits } from '../../lib/sync';
import { dayKeyToLocalDate } from '../../lib/utils';
import {
  clampVisitDate,
  localDateKey,
  readVetVisitDetail,
  readVisitConsequence,
  updateVisitDetails,
  type LocalVetVisit,
} from '../../lib/vetVisits';
import { visitAnchorsAnything } from '../../lib/vetVisitPlan';

// Editing a visit (CUL-902 VV-4; mock D3's ⋯ *Edit*).
//
// A `?visit=` param rather than a path segment, matching its two siblings — and for
// the same reason: `app/vet-visits/[id].tsx` owns that segment for the visit's own
// read-only screen, and a second dynamic route under it would be two screens with
// one address.
export default function EditVisitScreen() {
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
  // Whether the visit, AT THE DATE CURRENTLY IN THE PICKER, anchors the report
  // window and Home. `null` until the record has answered — and that third state is
  // load-bearing rather than tidiness: the note is a claim about the owner's data,
  // so an unanswered read renders nothing rather than a guess (C-12).
  //
  // Keyed on the CANDIDATE date, not the stored one, because the note is about what
  // the save would do. Moving a March visit past April's genuinely does move the
  // window, and a note gated on the row as stored would stay silent for exactly that
  // edit.
  const [anchors, setAnchors] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (!visitId) {
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
          //
          // Clamped for the same reason the after-visit screen is: a future-dated row
          // can arrive by sync from a device that wrote one, and saving this screen
          // without touching the picker would write it straight back.
          visitedAt: clampVisitDate(dayKeyToLocalDate(detail.visit.visited_at) ?? new Date()),
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
  }, [visitId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Re-asked whenever the picker moves, because the answer depends on the date
  // being saved rather than the one on file. Cheap (one COUNT), and the picker
  // commits a date at a time, not a keystroke at a time.
  //
  // `visit` is in the dependencies as the whole object, so this also re-asks on
  // every focus — which is wanted rather than tolerated: another device can sync a
  // NEWER visit for this pet while the screen is backgrounded, and that changes
  // `isLatest` without anything on this screen moving.
  const candidateDay = fields ? localDateKey(fields.visitedAt) : null;
  useEffect(() => {
    if (!visit || !candidateDay) return;
    let live = true;
    // CLEARED BEFORE THE ASK, not only on failure. The answer is per-DATE, so the
    // moment the question changes the previous answer is about a date the owner has
    // moved away from — and keeping it on screen while the new read is in flight is
    // the original false claim, just briefly. Sub-frame against a local COUNT, and
    // silence is the right thing to show for a day nothing has answered for yet
    // (C-12, reapplied when the QUESTION changes rather than only on first load).
    setAnchors(null);
    readVisitConsequence({ id: visit.id, pet_id: visit.pet_id, visited_at: candidateDay })
      .then((c) => {
        if (live) setAnchors(visitAnchorsAnything(c));
      })
      .catch((err) => {
        // Nothing to clear — the reset above already did it, and a failed read
        // simply leaves it cleared. That is the whole point of resetting on the
        // QUESTION rather than on the answer: the error path needs no rule of its
        // own, so there is no second place for the two to disagree.
        console.warn('[vet-visit-edit] consequence read failed:', err);
      });
    return () => {
      live = false;
    };
  }, [visit, candidateDay]);

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
      Alert.alert('That didn’t save', 'Try that again in a moment.');
    } finally {
      setSaving(false);
    }
  }

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
              movesReportWindow={anchors === true}
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
