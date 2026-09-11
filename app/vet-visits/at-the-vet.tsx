import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { theme } from '../../constants/theme';
import { Header } from '../../components/ui';
import { ThemedText } from '../../components/ui/ThemedText';
import { WhorlSpinner } from '../../components/brand/WhorlSpinner';
import { AtTheVetBody } from '../../components/vetvisits/AtTheVetBody';
import { useAllowlistFlag } from '../../hooks/useAppConfig';
import { useBetaOptIn } from '../../lib/betaFeatures';
import { resolveRecordPetName, usePetStore } from '../../store/petStore';
import { syncPendingVetAppointments } from '../../lib/sync';
import { captureVisitPaperwork, readPaperworkFor, rememberPaperwork } from '../../lib/visitPaperwork';
import {
  formatAppointmentWhen,
  formatWhereLine,
  parseQuestions,
  readAppointment,
  saveNotesDraft,
  setQuestionAsked,
  type LocalVetAppointment,
  type VisitQuestion,
} from '../../lib/vetVisits';

/**
 * How long the keystroke stream settles before the draft is written.
 *
 * Short enough that AC 6 holds in the shape an owner would test it ("kill the app
 * mid-sentence") and long enough that a sentence is one write rather than forty. The
 * debounce lives HERE rather than in `saveNotesDraft`, because it is a property of
 * this screen's input, not of the write — and a module that owned a timer would make
 * the write untestable without one.
 */
const DRAFT_DEBOUNCE_MS = 600;

// "At the vet" (CUL-902 VV-4; mock C1) — the in-room surface.
//
// THE APPOINTMENT IS A PARAM, NOT A PATH SEGMENT. `app/vet-visits/[id].tsx` already
// owns that segment for a VISIT id, and this screen is about an APPOINTMENT — two
// different entities under one dynamic name is a route that reads wrong from the
// URL up. The spec's §4.1 names the screen, not its file path.
//
// The GATE is here; the DRAWING is in components/vetvisits/ — the split
// guards/vetVisitsFlagOff.test.tsx enforces by stubbing that namespace to prove
// flag-off equivalence.
export default function AtTheVetScreen() {
  const eligible = useAllowlistFlag('vet_visits');
  const optedIn = useBetaOptIn('vet_visits');
  const enabled = eligible && optedIn;

  const { appointment: appointmentId } = useLocalSearchParams<{ appointment?: string }>();
  const pets = usePetStore((s) => s.pets);

  const [appointment, setAppointment] = useState<LocalVetAppointment | null>(null);
  const [questions, setQuestions] = useState<VisitQuestion[]>([]);
  const [draft, setDraft] = useState('');
  const [paperwork, setPaperwork] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [capturing, setCapturing] = useState(false);

  // The draft the owner is typing, held in a ref so the debounce timer reads the
  // LATEST text rather than the value captured when it was scheduled.
  const pendingDraft = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Seeded once from the row. Without this the first focus re-read would overwrite
  // whatever the owner has typed since, which on this screen is the one thing that
  // must never happen.
  const seeded = useRef(false);

  const flushDraft = useCallback(async () => {
    const text = pendingDraft.current;
    if (text === null || !appointmentId) return;
    pendingDraft.current = null;
    try {
      await saveNotesDraft(appointmentId, text);
      syncPendingVetAppointments().catch(console.error);
    } catch (err) {
      // No silent failures on a write path. The owner is told once, plainly, because
      // a note they believe is saving and is not is the worst thing this screen can
      // produce — and the standing line under the field says it is saving.
      console.warn('[at-the-vet] draft save failed:', err);
      Alert.alert(
        'Your notes aren’t saving',
        'What you’ve typed is still on screen. Copy it somewhere safe, then leave and come back to try again.',
      );
    }
  }, [appointmentId]);

  const load = useCallback(async () => {
    if (!enabled || !appointmentId) {
      setLoading(false);
      setLoaded(true);
      return;
    }
    try {
      const [row, groups] = await Promise.all([
        readAppointment(appointmentId),
        readPaperworkFor(appointmentId),
      ]);
      setAppointment(row);
      setPaperwork(groups);
      if (row && !seeded.current) {
        seeded.current = true;
        setDraft(row.notes_draft ?? '');
        setQuestions(parseQuestions(row.questions));
      }
      setFailed(false);
      setLoaded(true);
    } catch (err) {
      console.warn('[at-the-vet] read failed:', err);
      setFailed(true);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [enabled, appointmentId]);

  useFocusEffect(
    useCallback(() => {
      load();
      // Leaving the screen flushes whatever the debounce is still holding, so
      // backing out mid-sentence costs nothing.
      return () => {
        if (timer.current) clearTimeout(timer.current);
        void flushDraft();
      };
    }, [load, flushDraft]),
  );

  // The same flush on unmount, for the paths that do not run the focus cleanup.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function handleChangeDraft(next: string) {
    setDraft(next);
    pendingDraft.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flushDraft();
    }, DRAFT_DEBOUNCE_MS);
  }

  async function handleToggleQuestion(question: VisitQuestion) {
    if (!appointmentId) return;
    const asked = !question.asked_at;
    // Optimistic, then reconciled from the write's own return: the tick is a
    // fingertip target in a room, and a 40ms round trip to SQLite before the box
    // fills reads as a dead control.
    setQuestions((prev) =>
      prev.map((q) => (q.id === question.id ? { ...q, asked_at: asked ? new Date().toISOString() : null } : q)),
    );
    try {
      setQuestions(await setQuestionAsked(appointmentId, question.id, asked));
      syncPendingVetAppointments().catch(console.error);
    } catch (err) {
      console.warn('[at-the-vet] question tick failed:', err);
      // Roll back to what the record actually holds, and say so — an optimistic
      // paint that stays up over a failed write is a record that lies.
      setQuestions((prev) =>
        prev.map((q) => (q.id === question.id ? { ...q, asked_at: question.asked_at } : q)),
      );
      Alert.alert('That didn’t save', 'Try that again in a moment.');
    }
  }

  async function handlePhotographPaperwork() {
    if (!appointment || capturing) return;
    setCapturing(true);
    try {
      // The RECORD's pet — the appointment's, captured with the row, never the
      // store's active pet (AC 11).
      const { groupId, skipped } = await captureVisitPaperwork(appointment.pet_id);
      if (groupId) {
        await rememberPaperwork(appointment.id, groupId);
        setPaperwork((prev) => (prev.includes(groupId) ? prev : [...prev, groupId]));
      }
      if (skipped) Alert.alert('Some files were skipped', skipped);
    } catch (err) {
      console.warn('[at-the-vet] paperwork capture failed:', err);
      Alert.alert('That didn’t save', 'Something went wrong saving that photo. Give it another try.');
    } finally {
      setCapturing(false);
    }
  }

  if (!enabled) return <Redirect href="/(tabs)/profile" />;

  const petName = resolveRecordPetName(pets, appointment?.pet_id);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Header
        leading="back"
        onLeadingPress={() => {
          void flushDraft();
          if (router.canGoBack()) router.back();
          else router.replace('/vet-visits');
        }}
        right={
          appointment ? (
            <TouchableOpacity
              onPress={() => {
                void flushDraft();
                router.replace(`/vet-visits/after?appointment=${appointment.id}`);
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Finish the visit"
            >
              <ThemedText style={styles.doneLabel}>Done</ThemedText>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {loading ? (
        <View style={styles.centre}>
          <WhorlSpinner size="md" ground="day" />
        </View>
      ) : failed ? (
        <View style={styles.centre}>
          <ThemedText style={styles.missing}>This visit could not be opened just now.</ThemedText>
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
      ) : appointment ? (
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <AtTheVetBody
              petName={petName}
              when={formatAppointmentWhen(appointment.scheduled_at)}
              where={formatWhereLine({
                clinicName: appointment.clinic_name,
                vetName: appointment.vet_name,
              })}
              draft={draft}
              onChangeDraft={handleChangeDraft}
              questions={questions}
              onToggleQuestion={handleToggleQuestion}
              paperworkCount={paperwork.length}
              onPhotographPaperwork={handlePhotographPaperwork}
              capturing={capturing}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      ) : loaded ? (
        // The read answered and the appointment is not there — cancelled or logged on
        // another device. A different sentence from the failure above, because they
        // are different facts and only one is worth retrying.
        <View style={styles.centre}>
          <ThemedText style={styles.missing}>
            This appointment is no longer on the record.
          </ThemedText>
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
  doneLabel: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
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
