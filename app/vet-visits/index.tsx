import { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { theme } from '../../constants/theme';
import { Header, SectionLabel } from '../../components/ui';
import { ThemedText } from '../../components/ui/ThemedText';
import { WhorlSpinner } from '../../components/brand/WhorlSpinner';
import { AppointmentBlock } from '../../components/vetvisits/AppointmentBlock';
import { VisitRow } from '../../components/vetvisits/VisitRow';
import { VetVisitsEmptyState } from '../../components/vetvisits/VetVisitsEmptyState';
import { BookVisitSheet, type BookVisitSubmit, type VisitMode } from '../../components/vetvisits/BookVisitSheet';
import { useAllowlistFlag } from '../../hooks/useAppConfig';
import { useBetaOptIn } from '../../lib/betaFeatures';
import { resolveRecordPetName, usePetStore } from '../../store/petStore';
import { syncPendingVetAppointments, syncPendingVetVisits } from '../../lib/sync';
import {
  bookVetAppointment,
  EMPTY_VET_VISITS_HOME,
  logVetVisit,
  readVetVisitsHome,
  readVisitPrefill,
  type VetVisitsHome,
  type VisitPrefill,
} from '../../lib/vetVisits';

const NO_PREFILL: VisitPrefill = { clinicName: null, vetName: null, suggestedDate: null };

/** 'Juniper', 'Juniper and Moss', 'Juniper, Moss and Pip'. */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// Vet visits — the list (CUL-900 VV-2; mocks E1, E2, E3).
//
// Behind the `vet_visits` rollout flag (G0). The GATE lives here; the DRAWING
// lives in components/vetvisits/, and that split is enforced rather than
// conventional: guards/vetVisitsFlagOff.test.tsx proves flag-off equivalence by
// stubbing that namespace, so UI written inline in this file would be invisible to
// it. Anything owner-visible added to this screen belongs in a namespace module.
export default function VetVisitsScreen() {
  const eligible = useAllowlistFlag('vet_visits');
  const optedIn = useBetaOptIn('vet_visits');
  const enabled = eligible && optedIn;

  const activePet = usePetStore((s) => s.activePet);
  const pets = usePetStore((s) => s.pets);

  // The pet this SCREEN is about, captured once and never re-read from the store
  // (CUL-574 / AC 11).
  //
  // The shipped `app/vet-visit.tsx` does the opposite — it reads `activePet` at
  // SAVE time (`:117`) — and the spec names that as the shape this track must not
  // inherit. It is not hypothetical here: `setPets` resolves the active selection
  // during hydration, so a pull landing while this screen is open can move
  // `activePet` under a half-filled booking sheet, and the row would be written
  // under a pet the owner never chose.
  //
  // Captured on the first non-null active pet (the store is empty for a frame on a
  // cold start) and frozen after. Everything on this screen — the read, the
  // prefill, the writes, and which pets "Also for" may offer — is scoped to it.
  const [screenPetId, setScreenPetId] = useState<string | null>(null);
  if (screenPetId === null && activePet) setScreenPetId(activePet.id);
  const petId = screenPetId;
  // Named from the id, never from `activePet` — there is no `?? activePet?.name`
  // rung, because `resolveRecordPetName` already falls back to an anonymous label
  // and correct-but-anonymous beats confidently wrong.
  const petName = resolveRecordPetName(pets, petId);

  const [home, setHome] = useState<VetVisitsHome>(EMPTY_VET_VISITS_HOME);
  const [prefill, setPrefill] = useState<VisitPrefill>(NO_PREFILL);
  // `loading` alone cannot carry the three states: the first frame is
  // `visits=[] && !loading`, which would flash the designed empty state at an
  // owner who has twelve visits (C-12). `loaded` is what separates "the read
  // answered with nothing" from "the read has not answered".
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sheetMode, setSheetMode] = useState<VisitMode | null>(null);
  const [saving, setSaving] = useState(false);

  // E2's two doors on the Pet-tab card route here with an intent. Held in a REF
  // and cleared BEFORE the effect it triggers: in state, an already-scheduled
  // passive effect re-enters with the pre-clear closure and opens the sheet twice
  // (C-22).
  //
  // Armed from the ref's INITIALISER, which React evaluates on the first render
  // only. The first version armed it in the render body — `if (add === …)
  // pendingAdd.current = add` — which is not a one-shot at all: the param stays in
  // the URL for the life of the screen, so the very next render (the one
  // `setSheetMode` itself causes) re-armed the ref the focus effect had just
  // cleared. Push a visit, come back, and the booking sheet opened again
  // unrequested. The ref was doing its job; the SOURCE was re-supplying the
  // request. The param is also stripped below once consumed, so a re-focus reads
  // a clean URL rather than relying on this initialiser alone.
  const { add } = useLocalSearchParams<{ add?: string }>();
  const pendingAdd = useRef<VisitMode | null>(
    add === 'booked' || add === 'happened' ? add : null,
  );

  const load = useCallback(async () => {
    // A dark feature reads nothing either: the gate is not only about pixels.
    if (!enabled || !petId) {
      setLoading(false);
      setLoaded(true);
      return;
    }
    try {
      const [next, pre] = await Promise.all([readVetVisitsHome(petId), readVisitPrefill(petId)]);
      setHome(next);
      setPrefill(pre);
      setFailed(false);
      setLoaded(true);
    } catch (err) {
      console.warn('[vet-visits] read failed:', err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [enabled, petId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      load().then(() => {
        if (cancelled) return;
        const intent = pendingAdd.current;
        pendingAdd.current = null;
        if (intent) {
          setSheetMode(intent);
          // Clear the request at its source too. Without this the URL still reads
          // `?add=booked` on every later focus of this screen, which is a standing
          // instruction nobody issued.
          router.setParams({ add: undefined });
        }
      });
      return () => {
        cancelled = true;
      };
    }, [load]),
  );

  async function handleSubmit(input: BookVisitSubmit) {
    // The screen's pet, not the store's current one — see `screenPetId` above.
    if (!petId) return;
    setSaving(true);
    try {
      if (input.mode === 'booked' && input.scheduledAt) {
        const shared = {
          scheduledAt: input.scheduledAt,
          clinicName: input.clinicName,
          vetName: input.vetName,
          reason: input.reason,
        };
        // THIS pet's row first, and on its own. If it throws, nothing was written
        // and the sheet stays open with the owner's input — a retry is safe.
        await bookVetAppointment({ petId, ...shared });

        // Then a row EACH for the other pets (the Vet Files D13 duplicate-on-add
        // shape), so each pet's Home shows its own and cancelling one later leaves
        // the others standing.
        //
        // Deliberately NOT inside the try above. The first draft let a failure on
        // the second pet fall into the shared catch, which showed "Could not save"
        // over a save that had already committed for the first — and left the sheet
        // open, so the obvious retry wrote the first pet's appointment a second
        // time. A partial result is reported as a partial result.
        const failedFor: string[] = [];
        for (const otherId of input.alsoForPetIds) {
          try {
            await bookVetAppointment({ petId: otherId, ...shared });
          } catch (err) {
            console.warn('[vet-visits] also-for save failed:', err);
            failedFor.push(resolveRecordPetName(pets, otherId));
          }
        }
        syncPendingVetAppointments().catch(console.error);
        setSheetMode(null);
        await load();
        if (failedFor.length > 0) {
          // Names who did NOT get one, and says plainly that the rest did — the
          // owner needs to know exactly what to redo.
          Alert.alert(
            'Saved, apart from one',
            `${listNames(failedFor)} did not get an appointment. Add it again from their profile.`,
          );
        }
        return;
      }

      await logVetVisit({
        petId,
        visitedAt: input.day,
        clinicName: input.clinicName,
        vetName: input.vetName,
        reason: input.reason,
      });
      syncPendingVetVisits().catch(console.error);
      setSheetMode(null);
      await load();
    } catch (err) {
      console.warn('[vet-visits] save failed:', err);
      // Plain cause, one action, no error string from the exception (the
      // owner-facing copy guard).
      Alert.alert('Could not save', 'Try that again in a moment.');
    } finally {
      setSaving(false);
    }
  }

  // A dark feature is dark on every door, including a deep link. No chrome, no
  // title, nothing that names a feature the account is not in — the owner lands
  // where the entry point would have been. A `<Redirect>` rather than an effect,
  // the `(tabs)/_layout.tsx` precedent: it resolves before anything paints, so
  // there is no frame of the feature to see.
  if (!enabled) return <Redirect href="/(tabs)/profile" />;

  // Empty means the RECORD is empty — no history, nothing booked, and nothing
  // waiting on an answer. `awaiting` counts: a booking whose day has passed is
  // still something the owner put here, and the designed empty state would bury
  // the only surface that shows it.
  const isEmpty =
    loaded && home.visits.length === 0 && home.next === null && home.awaiting.length === 0;
  const otherPets = pets
    .filter((p) => p.id !== petId)
    .map((p) => ({ id: p.id, name: p.name }));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Header
        leading="back"
        // canGoBack-guarded: this route is reachable by direct link, and a cold
        // deep link has nothing to pop (the Vet Files precedent).
        onLeadingPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
        title={isEmpty ? 'Vet visits' : undefined}
        right={
          // Hidden on the empty state, where the two doors already own the action.
          isEmpty || !loaded ? undefined : (
            <TouchableOpacity
              onPress={() => setSheetMode('booked')}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={`Add a visit for ${petName}`}
            >
              <ThemedText style={styles.addLabel}>Add</ThemedText>
            </TouchableOpacity>
          )
        }
      />

      {loading ? (
        <View style={styles.centre}>
          <WhorlSpinner size="md" ground="day" />
        </View>
      ) : failed ? (
        <View style={styles.centre}>
          <ThemedText style={styles.failedText}>
            {petName}’s visits could not be read just now.
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
      ) : isEmpty ? (
        <VetVisitsEmptyState
          petName={petName}
          onBook={() => setSheetMode('booked')}
          onLogPast={() => setSheetMode('happened')}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.titleBlock}>
            <ThemedText style={styles.pageTitle}>Vet visits</ThemedText>
            <ThemedText style={styles.pageSub}>{petName}</ThemedText>
          </View>

          {home.next ? (
            <View style={styles.section}>
              <SectionLabel label="Next" header />
              <AppointmentBlock appointment={home.next} style={styles.nextBlock} />
            </View>
          ) : null}

          {home.awaiting.length > 0 ? (
            <View style={styles.section}>
              {/* A booking whose day has passed with no visit logged against it.
                  It is not "Next" and it is not "Past" — it is the record waiting
                  on an answer, and VV-5's Home ask (mock A2b) is what will resolve
                  it. Until then it renders here rather than disappearing, because
                  the owner made it and nothing else in the app can show it. */}
              <SectionLabel label="Waiting on you" header />
              {home.awaiting.map((appt) => (
                <AppointmentBlock key={appt.id} appointment={appt} style={styles.nextBlock} />
              ))}
              <ThemedText style={styles.awaitingNote}>
                This day has passed. Log the visit to move it into {petName}’s history.
              </ThemedText>
            </View>
          ) : null}

          {home.visits.length > 0 ? (
            <View style={styles.section}>
              <SectionLabel label="Past" header />
              <View style={styles.list}>
                {home.visits.map((row) => (
                  <VisitRow
                    key={row.id}
                    row={row}
                    onPress={() => router.push(`/vet-visits/${row.id}`)}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      )}

      {sheetMode ? (
        <BookVisitSheet
          visible
          initialMode={sheetMode}
          petName={petName}
          otherPets={otherPets}
          prefill={prefill}
          busy={saving}
          onClose={() => setSheetMode(null)}
          onSubmit={handleSubmit}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space3,
    gap: theme.space2,
  },
  failedText: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    textAlign: 'center',
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
  addLabel: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
  scroll: {
    paddingHorizontal: theme.space3,
    paddingBottom: theme.space4,
  },
  titleBlock: {
    marginBottom: theme.space2,
  },
  pageTitle: {
    fontSize: theme.textPageTitle,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  pageSub: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
  section: {
    marginTop: theme.space2,
  },
  nextBlock: {
    marginTop: theme.space1,
    padding: 12,
    borderRadius: theme.radiusMedium,
    backgroundColor: theme.colorSurface,
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  list: {
    marginTop: 4,
  },
  awaitingNote: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextTertiary,
    marginTop: 6,
  },
});
