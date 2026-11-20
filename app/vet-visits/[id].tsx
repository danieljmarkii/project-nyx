import { useCallback, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { colorRoles, theme } from '../../constants/theme';
import { Header } from '../../components/ui';
import { ThemedText } from '../../components/ui/ThemedText';
import { WhorlSpinner } from '../../components/brand/WhorlSpinner';
import { VisitDetailBody } from '../../components/vetvisits/VisitDetailBody';
import { VisitReports } from '../../components/vetvisits/VisitReports';
import { resolveRecordPetName, usePetStore } from '../../store/petStore';
import {
  readAppointmentForVisit,
  readVetVisitDetail,
  updateVisitDetails,
  type VetVisitDetail,
} from '../../lib/vetVisits';
import { syncPendingVetVisits } from '../../lib/sync';
import { BookVisitSheet, type BookVisitSubmit } from '../../components/vetvisits/BookVisitSheet';
import { visitCourseHref, visitTrialHref } from '../../lib/visitPlanDoors';
import { captureVisitResults, type VisitResultsSource } from '../../lib/visitPaperwork';
import { isDocumentPickerAvailable } from '../../lib/vetDocumentCapture';
import { visitToPlainText } from '../../lib/visitShareText';
import { isRemoteChannel, recordNoun } from '../../lib/vetContacts';
import { channelOf } from '../../lib/vetVisits';

// One visit as written (CUL-900 VV-2; mock D3). *Edit* and *Add to the plan* both open
// How did it go? for this visit (CUL-2754, §4.4 R1); the five-field edit screen retired.
//
// *Delete* is still VV-6's, gated on CUL-19 deploying the reader that honours
// `deleted_at` — a control that soft-deletes a visit the live report still counts
// would move nothing an owner can see.
export default function VetVisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pets = usePetStore((s) => s.pets);
  // Read only to decide whether a course's door may open the Pet tab, which draws the active
  // pet (`lib/visitPlanDoors.ts`); the page itself names the RECORD's pet.
  const activePetId = usePetStore((s) => s.activePet?.id ?? null);
  const [resultsBusy, setResultsBusy] = useState(false);
  // Vet contacts R12 (CUL-2766): *Edit* on a saved call, text or email opens the logging
  // sheet on it, all four chips, so a wrong channel can be put right. A clinic visit's *Edit*
  // is How did it go?, as shipped. Flag off, *Edit* is what it was for every row.
  const [editing, setEditing] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  // Probed once per mount, as Vet Files does (B-548): an older binary has no Files picker.
  const [pdfAvailable] = useState(() => isDocumentPickerAvailable());

  const [detail, setDetail] = useState<VetVisitDetail | null>(null);
  // The booking this visit was logged from: a report filed under it before the day is this
  // visit's report too (PR-22, CUL-2302).
  const [bookingId, setBookingId] = useState<string | null>(null);
  // Bumped on every focus read, so the reports section re-reads too: a report filed under this
  // visit, or taken off it, from the report screen shows on the way back.
  const [readTick, setReadTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      setLoaded(true);
      return;
    }
    try {
      // The booking only widens the optional reports section, so its failure never blanks the visit.
      const [read, booking] = await Promise.all([
        readVetVisitDetail(id),
        readAppointmentForVisit(id).catch((err) => {
          console.warn('[vet-visit] booking read failed:', err);
          return null;
        }),
      ]);
      setDetail(read);
      setBookingId(booking?.id ?? null);
      setReadTick((n) => n + 1);
      setFailed(false);
      setLoaded(true);
    } catch (err) {
      console.warn('[vet-visit] read failed:', err);
      // A failed read is its OWN state, and it is not "this visit is gone" — the
      // first draft set `loaded` only inside the try, so a read error fell through
      // every branch to `: null` and the owner got a blank screen under a back
      // chevron. The list screen beside this one had it right; this is the C-12
      // three-states rule met on one screen and missed on its sibling.
      setFailed(true);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // The RECORD's pet, never the active one (CUL-574 / AC 11): open a visit, switch
  // the store's active pet, and this screen still names the pet whose visit it is.
  // There is no `?? activePet?.name` rung — `resolveRecordPetName` already falls
  // back to an anonymous label, and correct-but-anonymous beats confidently wrong.
  const petName = resolveRecordPetName(pets, detail?.visit.pet_id);
  // Vet contacts (CUL-2749 PR-06): what the record is, in one word, for the header's labels.
  // "visit" for a clinic visit and an unknown channel. The RECORD decides (CUL-2830): a call
  // says "call" whatever this phone's switch says, so no surface here reads the switch.
  const noun = recordNoun(channelOf(detail?.visit.channel));

  // *Results arrived?* (CUL-2759): the paperwork capture, filed under this visit and typed as
  // results at insert. A refusal or a failure is said, never swallowed; a save re-reads the
  // visit so the new document is in its paperwork on the way back from the camera.
  async function handleResultsArrived(source: VisitResultsSource) {
    if (!detail || resultsBusy) return;
    setResultsBusy(true);
    try {
      const { groupId, skipped } = await captureVisitResults(detail.visit.pet_id, detail.visit.id, source);
      if (groupId) await load();
      if (skipped) Alert.alert('Some files were skipped', skipped);
    } catch (err) {
      console.warn('[vet-visit] results capture failed:', err);
      Alert.alert('That didn’t save', 'Something went wrong saving the results. Give it another try.');
    } finally {
      setResultsBusy(false);
    }
  }

  // *Share* (R8·6): the visit as plain text through the system share sheet, addressed to
  // no one. Built from the RECORD the screen just read, never from what is on screen, and
  // under the record's pet. A dismissed sheet is not an error; a sheet that cannot open is
  // said, never swallowed.
  // A failed local write keeps the sheet open with every field (mock B4), and is said.
  async function handleEditSubmit(input: BookVisitSubmit) {
    if (!detail || editSaving) return;
    setEditSaving(true);
    try {
      await updateVisitDetails(detail.visit.id, {
        visitedAt: input.day,
        clinicName: input.clinicName,
        vetName: input.vetName,
        reason: input.reason,
        channel: input.channel,
        contactedAt: input.contactedAt,
      });
      syncPendingVetVisits().catch(console.error);
      setEditing(false);
      await load();
    } catch (err) {
      console.warn('[vet-visit] contact edit failed:', err);
      // A row removed meanwhile (another device) can never take the edit, so "try again"
      // would be a promise the retry cannot keep: close and say what happened. A failed or
      // unreadable re-read keeps the sheet open, as any other failed write does.
      const still = await readVetVisitDetail(detail.visit.id).catch(() => undefined);
      if (still === null) {
        setEditing(false);
        await load();
        Alert.alert('That didn’t save', 'This one is no longer on the record.');
      } else {
        Alert.alert('That didn’t save', 'Try that again in a moment.');
      }
    } finally {
      setEditSaving(false);
    }
  }

  // An unknown channel (a row this phone never learned) keeps the shipped *Edit*.
  // A call edits as a call on every phone (CUL-2830): the visit's after screen would offer an
  // exam's plan over a phone consult.
  const editsAsContact = detail !== null && isRemoteChannel(channelOf(detail.visit.channel));

  async function handleShare(read: VetVisitDetail) {
    try {
      const channel = channelOf(read.visit.channel);
      await Share.share({ message: visitToPlainText(read, petName, new Date(), isRemoteChannel(channel) ? channel : null) });
    } catch (err) {
      console.warn('[vet-visit] share failed:', err);
      Alert.alert('Couldn’t open sharing', 'Give it another try in a moment.');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Header
        leading="back"
        onLeadingPress={() => (router.canGoBack() ? router.back() : router.replace('/vet-visits'))}
        right={
          // Inline rather than behind the mock's ⋯ — the header's own rule is that a
          // single secondary action does not hide in a tap-to-reveal menu (B-075, a
          // PM call). *Share* (R8·6, CUL-2760) is the second, and it sits beside *Edit*
          // rather than starting the menu: both are one word, a menu would put the share
          // two taps away for the one reader it exists for, and VV-6's *Delete* (gated
          // on CUL-19) is still the PR where the row becomes a ⋯.
          //
          // Absent, never `disabled`, while the read is in flight or the row is gone:
          // `disabled` is an accessibility CLAIM that a control exists and is
          // unavailable, and here no control exists at all (C-7).
          detail ? (
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => void handleShare(detail)}
                activeOpacity={0.7}
                hitSlop={HEADER_HIT}
                accessibilityRole="button"
                accessibilityLabel={`Share ${petName}’s ${noun}`}
              >
                <ThemedText style={styles.editLabel}>Share</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  editsAsContact ? setEditing(true) : router.push(`/vet-visits/after?visit=${detail.visit.id}`)
                }
                activeOpacity={0.7}
                hitSlop={HEADER_HIT}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${petName}’s ${noun}`}
              >
                <ThemedText style={styles.editLabel}>Edit</ThemedText>
              </TouchableOpacity>
            </View>
          ) : undefined
        }
      />
      {loading ? (
        <View style={styles.centre}>
          <WhorlSpinner size="md" ground="day" />
        </View>
      ) : detail ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <VisitDetailBody
            detail={detail}
            petName={petName}
            onOpenDocument={(groupId) => router.push(`/vet-document/${groupId}`)}
            onAddToPlan={() => router.push(`/vet-visits/after?visit=${detail.visit.id}&at=plan`)}
            courseDoor={(med) => {
              const href = visitCourseHref({
                course: med,
                visitPetId: detail.visit.pet_id,
                activePetId,
                nowMs: Date.now(),
              });
              return href ? () => router.push(href) : null;
            }}
            trialDoor={(trial) => {
              const href = visitTrialHref({ trial, visitPetId: detail.visit.pet_id });
              return href ? () => router.push(href) : null;
            }}
            onResultsArrived={(source) => void handleResultsArrived(source)}
            pdfAvailable={pdfAvailable}
            resultsBusy={resultsBusy}
          />
          <VisitReports
            channel={channelOf(detail.visit.channel)}
            petId={detail.visit.pet_id}
            visitId={detail.visit.id}
            appointmentId={bookingId}
            refreshKey={readTick}
            onOpenReport={(r) => router.push({ pathname: '/reports/[id]', params: { id: r.id, pet: r.petId } })}
          />
        </ScrollView>
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
      ) : loaded ? (
        // The read answered and the row is not there — deleted on another device,
        // or a stale link. A DIFFERENT sentence from the failure above, because
        // they are different facts and only one of them is worth retrying.
        <View style={styles.centre}>
          <ThemedText style={styles.missing}>This visit is no longer on the record.</ThemedText>
        </View>
      ) : null}

      {editing && detail && editsAsContact ? (
        <BookVisitSheet
          visible
          initialMode="happened"
          petName={petName}
          otherPets={[]}
          prefill={{ clinicName: null, vetName: null, suggestedDate: null }}
          edit={{
            channel: channelOf(detail.visit.channel) ?? 'in_clinic',
            day: detail.visit.visited_at,
            contactedAt: detail.visit.contacted_at ?? null,
            clinicName: detail.visit.clinic_name,
            vetName: detail.visit.vet_name,
            reason: detail.visit.reason,
          }}
          busy={editSaving}
          onClose={() => setEditing(false)}
          onSubmit={(input) => void handleEditSubmit(input)}
        />
      ) : null}
    </SafeAreaView>
  );
}

/**
 * Two touchable siblings in the header: the gap is the facing reach of both slops (C-5),
 * computed from the one constant rather than typed.
 */
const HEADER_HIT = { top: 12, bottom: 12, left: 12, right: 12 };

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: HEADER_HIT.right + HEADER_HIT.left,
  },
  editLabel: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: colorRoles.action.onLight,
  },
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
  retry: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.space2,
  },
  retryText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: colorRoles.action.onLight,
  },
  missing: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    textAlign: 'center',
  },
  scroll: {
    paddingHorizontal: theme.space3,
    paddingBottom: theme.space4,
  },
});
