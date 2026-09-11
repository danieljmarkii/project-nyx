import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import { ThemedText } from '../ui/ThemedText';
import { AppointmentBlock } from './AppointmentBlock';
import { useAllowlistFlag } from '../../hooks/useAppConfig';
import { useBetaOptIn } from '../../lib/betaFeatures';
import { usePetStore } from '../../store/petStore';
import { syncPendingVetAppointments } from '../../lib/sync';
import { cancelVetAppointment, readHomeAppointment, type HomeAppointment } from '../../lib/vetVisits';
import { hasAskedAboutAppointment, markAppointmentAsked } from '../../lib/appointmentAsked';

// The moment (CUL-903 VV-5; spec §4.1 A2 / A2b, mock A2 / A2b).
//
// ── PLACEMENT IS THE DESIGN, AND IT IS A SAFETY RULE ─────────────────────────────
// Home mounts this BETWEEN `SignalZone` and `TrialStrip` — in the trial strip's
// register, never the Signal's. An appointment is CONTEXT, not an insight: Principle
// 3 says safety and concern insights always lead, so a live intake decline keeps its
// own ask above this strip and keeps it intact. Nothing here changes, dates or
// re-phrases a single Signal string because a visit is coming, and the strip never
// gains urgency styling — no accent ground, no glyph, no haptic. A calm row.
//
// ── IT ASKS ONCE ─────────────────────────────────────────────────────────────────
// Five days out through the day of: two doors. After the day passes with no visit
// logged: one ask, and then it leaves whatever the answer. The Designer's condition
// on this strip was that it never becomes furniture for a month.
//
// ── THE ONE WRITE, AND WHY IT IS ALLOWED TO BE HERE ──────────────────────────────
// `docs/nyx-med-strip-requirements.md` §0.1 bounds Home to the medication strip's
// one-tap confirm and the daily look, and says a third class is a Tier-2 amendment
// rather than a marker. *It didn't* is that third class, PM-approved 2026-09-11 as
// ONE CONFIRMATION AND NO FORM:
//
//   • it writes `cancelled_at` on a row the app is describing ON SCREEN, in the same
//     breath as asking about it — which is D1's own test for a confirmation ("a
//     control that writes a row the app could already describe");
//   • it opens no form and starts no record, which is D1's test for the second door
//     it forbids. *Add a question* is a DOOR into Get ready for exactly this reason:
//     the typing happens where the other questions live, not on Home;
//   • the row it touches reaches no count, coverage line, Patterns panel or engine
//     input — `guards/visitReaders.test.ts` is what makes that structural rather
//     than a promise.
//
// `guards/homeWrites.test.ts` carries the allow-entry, keyed to this file and naming
// the exact helper. It is a list of helpers rather than a boolean deliberately: an
// entry that said "this card may write" would also permit the next write somebody
// adds to it.

export function AppointmentStrip() {
  const eligible = useAllowlistFlag('vet_visits');
  const optedIn = useBetaOptIn('vet_visits');
  const enabled = eligible && optedIn;

  const activePet = usePetStore((s) => s.activePet);
  const petId = activePet?.id ?? null;

  const [appointment, setAppointment] = useState<HomeAppointment | null>(null);
  // Which pet the row in state belongs to — a boolean `loaded` would stay true across
  // a pet switch and leave the previous pet's appointment on screen under the new
  // pet's name (the VV-2 card's own defect, avoided here by construction).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled || !petId) {
      setAppointment(null);
      setLoadedFor(petId);
      return;
    }
    try {
      const next = await readHomeAppointment(petId);
      // The after-the-day ask is suppressed once THIS DEVICE has shown it
      // (`lib/appointmentAsked.ts`). An unreadable store answers "already asked",
      // because re-asking every launch about a visit the owner dismissed is the
      // failure that cannot be un-seen.
      if (next?.phase === 'after' && (await hasAskedAboutAppointment(next.id))) {
        setAppointment(null);
      } else {
        setAppointment(next);
      }
      setLoadedFor(petId);
    } catch (err) {
      console.warn('[appointment-strip] read failed:', err);
      // A failed read draws NOTHING, which is the honest direction here: this strip
      // only ever ADDS a row to Home, so its silence removes no claim and asserts
      // none. (The C-12 three-state rule bites where an empty read would be rendered
      // AS an answer — the Pet-tab card's zero state. There is no such state here.)
      setAppointment(null);
      setLoadedFor(petId);
    }
  }, [enabled, petId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!enabled || !appointment || loadedFor !== petId) return null;

  const { view, phase, id } = appointment;

  const dismissAsk = async () => {
    setAppointment(null);
    await markAppointmentAsked(id, new Date().toISOString());
  };

  const onDidntHappen = () => {
    Alert.alert(
      // 'Remove', not 'Cancel': the buttons below say Remove, and on iOS "Cancel"
      // is also the word for backing out of the dialog — a title and a button using
      // it for opposite meanings is the one place an owner cannot afford ambiguity.
      'Remove this appointment?',
      // Says what it does to the record, and what it does not. An owner who
      // rescheduled rather than skipped needs to know the old row is going away.
      `${view.when} will be removed from ${activePet?.name ?? 'your pet'}’s upcoming visits. Nothing else in the record changes.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove it',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelVetAppointment(id);
              setAppointment(null);
              await markAppointmentAsked(id, new Date().toISOString());
              syncPendingVetAppointments().catch(() => {});
            } catch (err) {
              console.warn('[appointment-strip] cancel failed:', err);
              // Never a silent failure: the strip stays put, so the owner can see
              // the appointment is still there and try again.
              Alert.alert('Couldn’t remove it', 'The appointment is still here — try again.');
            }
          },
        },
      ],
    );
  };

  return (
    <Card>
      <AppointmentBlock
        // The DAY half, never the full `when`: built from the joined string the ask came
        // out as "Did Tuesday · 3:00 pm’s visit happen?".
        appointment={phase === 'upcoming' ? view : { ...view, when: `Did ${view.day}’s visit happen?` }}
      />
      <View style={styles.doors}>
        {phase === 'upcoming' ? (
          <>
            <Door label="Get ready" primary onPress={() => router.push({ pathname: '/rundown', params: { appointmentId: id } })} />
            {/* A DOOR, not a sheet. Home carries no form (see the header): the
                question is typed in Get ready, beside the ones already there. */}
            <Door
              label="Add a question"
              onPress={() =>
                router.push({ pathname: '/rundown', params: { appointmentId: id, ask: '1' } })
              }
            />
          </>
        ) : (
          <>
            <Door
              label="Yes — how did it go?"
              primary
              onPress={async () => {
                // The ask is spent either way: *Yes* hands off to the capture screen,
                // and if the owner backs out of that without saving, Home has already
                // asked once. The visit is still bookable from the Pet tab.
                await dismissAsk();
                router.push('/vet-visit');
              }}
            />
            <Door label="It didn’t" onPress={onDidntHappen} />
          </>
        )}
      </View>
    </Card>
  );
}

/**
 * One door. `primary` is weight only — a tinted label on the card's own ground,
 * never a filled button and never an accent fill, because a filled control in this
 * slot would read as urgency (§4.1 A2: the strip never gains urgency styling).
 *
 * `HIT` is symmetric and the row's `gap` is sized from it: two touchable siblings
 * need `gap >= facing hitSlop(a) + facing hitSlop(b)` (C-5), which is 8 + 8 here.
 * `minHeight` pins the geometry the 44pt floor depends on rather than leaving it to
 * the label's line box.
 */
const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

function Door({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={HIT}
      accessibilityRole="button"
      style={styles.door}
    >
      <ThemedText style={[styles.doorLabel, primary && styles.doorLabelPrimary]}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  doors: {
    flexDirection: 'row',
    alignItems: 'center',
    // Two touchable siblings, 8pt of facing hitSlop each (C-5). The row may wrap on a
    // narrow screen with long labels, so the two axes are named separately —
    // `columnGap` keeps the side-by-side separation and `rowGap` the stacked one,
    // which a single `gap` shorthand would also do but silently.
    columnGap: HIT.left + HIT.right,
    rowGap: theme.space1,
    flexWrap: 'wrap',
    marginTop: theme.space2,
  },
  door: {
    // The 44pt floor, pinned rather than inherited from the label's line height.
    minHeight: 44,
    justifyContent: 'center',
  },
  doorLabel: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  doorLabelPrimary: {
    // The interactive ink, not the glyph tint: this is TEXT on a light ground, so it
    // takes the `*Ink` sibling that clears 4.5:1 (CUL-578 / CUL-744).
    color: theme.colorAccentInk,
    fontWeight: theme.weightSemibold,
  },
});
