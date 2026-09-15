import { useCallback, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { theme } from '../../constants/theme';
import { Header } from '../../components/ui';
import { ThemedText } from '../../components/ui/ThemedText';
import { WhorlSpinner } from '../../components/brand/WhorlSpinner';
import {
  AppointmentEditBody,
  type AppointmentEditFields,
} from '../../components/vetvisits/AppointmentEditBody';
import { useAllowlistFlag } from '../../hooks/useAppConfig';
import { useBetaOptIn } from '../../lib/betaFeatures';
import { resolveRecordPetName, usePetStore } from '../../store/petStore';
import { syncPendingVetAppointments } from '../../lib/sync';
import {
  appointmentPrepNote,
  cancelVetAppointment,
  composeScheduledAt,
  decomposeScheduledAt,
  readAppointmentById,
  removeAppointmentCopy,
  updateAppointmentDetails,
  type AppointmentDetail,
} from '../../lib/vetVisits';

// Changing a booked appointment (CUL-952; mock E4).
//
// The screen the app has been pointing at nothing for: `GetReadyHeader`'s ⋯ item is
// literally called *Change the appointment* and pushed `/vet-visits`, whose only
// control is *Add* — so following the app's own instruction booked a SECOND
// appointment beside the one the owner meant to move.
//
// A `?appointment=` param rather than a path segment, matching its three siblings
// (`at-the-vet`, `after`, `edit`) and for the same reason `edit.tsx` gives:
// `app/vet-visits/[id].tsx` owns that segment for the visit's own screen, and a
// second dynamic route under it would be two screens with one address.
export default function EditAppointmentScreen() {
  const eligible = useAllowlistFlag('vet_visits');
  const optedIn = useBetaOptIn('vet_visits');
  const enabled = eligible && optedIn;

  const { appointment: appointmentId } = useLocalSearchParams<{ appointment?: string }>();
  const pets = usePetStore((s) => s.pets);

  const [appointment, setAppointment] = useState<AppointmentDetail | null>(null);
  const [fields, setFields] = useState<AppointmentEditFields | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  // Seeded once. A re-focus must never overwrite an edit in progress — the
  // half-changed reschedule is the thing this screen exists to protect (`edit.tsx`).
  const seeded = useRef(false);

  const load = useCallback(async () => {
    if (!enabled || !appointmentId) {
      setLoading(false);
      setLoaded(true);
      return;
    }
    try {
      const row = await readAppointmentById(appointmentId);
      setAppointment(row);
      if (row && !seeded.current) {
        const parts = decomposeScheduledAt(row.scheduled_at);
        if (parts) {
          seeded.current = true;
          setFields({
            // `day` and `time` come back through ONE function, and `time` is null
            // for a no-time booking. Seeding `time` from the raw instant instead
            // would hand the picker local midnight as a real value, and saving
            // without touching it would write 00:01 — inventing a clock time on an
            // appointment the owner never gave one for. See `decomposeScheduledAt`.
            day: parts.day,
            time: parts.time,
            clinicName: row.clinic_name ?? '',
            vetName: row.vet_name ?? '',
            reason: row.reason ?? '',
          });
        }
      }
      setFailed(false);
      setLoaded(true);
    } catch (err) {
      console.warn('[vet-appointment-edit] read failed:', err);
      setFailed(true);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [enabled, appointmentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace('/vet-visits');
  }

  async function handleSave() {
    if (!appointmentId || !fields || saving) return;
    setSaving(true);
    try {
      await updateAppointmentDetails(appointmentId, {
        scheduledAt: composeScheduledAt(fields.day, fields.time),
        clinicName: fields.clinicName,
        vetName: fields.vetName,
        reason: fields.reason,
      });
      syncPendingVetAppointments().catch(console.error);
      leave();
    } catch (err) {
      console.warn('[vet-appointment-edit] save failed:', err);
      // No error string from the exception (the owner-facing copy guard): a plain
      // cause and one action.
      Alert.alert('That didn’t save', 'Try that again in a moment.');
    } finally {
      setSaving(false);
    }
  }

  function handleRemove() {
    if (!appointmentId || !appointment) return;
    // The copy is `lib/vetVisits`' — three doors now reach this one write, and a
    // destructive confirm that says three slightly different things about the same
    // row is how an owner learns not to trust it.
    const copy = removeAppointmentCopy(appointment.scheduled_at, petName);
    Alert.alert(
      copy.title,
      copy.body,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove it',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelVetAppointment(appointmentId);
              syncPendingVetAppointments().catch(console.error);
              leave();
            } catch (err) {
              console.warn('[vet-appointment-edit] cancel failed:', err);
              // Never a silent failure: the screen stays put, so the owner can see
              // the appointment is still there and try again (the strip's shape).
              Alert.alert('Couldn’t remove it', 'The appointment is still here — try again.');
            }
          },
        },
      ],
    );
  }

  if (!enabled) return <Redirect href="/(tabs)/profile" />;

  // The RECORD's pet, never the active one (CUL-574 / AC 11).
  const petName = resolveRecordPetName(pets, appointment?.pet_id);

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
          <ThemedText style={styles.missing}>
            This appointment could not be read just now.
          </ThemedText>
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
      ) : fields && appointment ? (
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <AppointmentEditBody
              petName={petName}
              fields={fields}
              onChangeField={(key, value) =>
                setFields((prev) => (prev ? { ...prev, [key]: value } : prev))
              }
              // The earlier of today and the row's own day. A live booking still
              // cannot move into the past; a booking already sitting in *Waiting on
              // you* keeps the date it has, because a floor of "today" would refuse
              // to render that row's own current value.
              minimumDay={earlierOf(startOfToday(), fields.day)}
              // Read off the ROW, not from state: what the owner prepared is a fact
              // about the record, and it is null for the first-time rescheduler who
              // has never opened Get ready.
              prepNote={appointmentPrepNote(appointment.questions, appointment.notes_draft)}
              saving={saving}
              onSave={handleSave}
              onRemove={handleRemove}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      ) : loaded ? (
        // G5 — a screen never shows a row that is no longer in the record.
        // `readAppointmentById` already filters deleted and cancelled rows, so this
        // is the state an owner lands in when the booking was cancelled or logged on
        // another device while this door was in reach.
        <View style={styles.centre}>
          <ThemedText style={styles.missing}>
            This appointment is no longer on the record.
          </ThemedText>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function startOfToday(): Date {
  const out = new Date();
  out.setHours(0, 0, 0, 0);
  return out;
}

function earlierOf(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
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
