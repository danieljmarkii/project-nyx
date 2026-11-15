import { useState } from 'react';
import { Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarPlus } from 'lucide-react-native';
import { colorRoles, theme } from '../../constants/theme';
import { PlanActionRow, PlanChipRow, PlanSettledRow } from './PlanRows';
import { defaultRecheckDate, recheckDateIn } from '../../lib/vetVisitPlan';
import { formatVisitDate, localDateKey, type RecheckBooking } from '../../lib/vetVisits';

type Choice = '2w' | '6w' | 'pick';

const CHOICES = [
  { value: '2w', label: '2 weeks' },
  { value: '6w', label: '6 weeks' },
  { value: 'pick', label: 'Pick a date' },
];

export interface RecheckRowProps {
  petName: string;
  /** 'YYYY-MM-DD' once *Set*: the date the vet said to come back around. */
  nextVisitAt: string | null;
  /** The booking that answers it (`recheckBookingFor`), or null. Wins over the date. */
  booking: RecheckBooking | null;
  busy: boolean;
  /** *Set*: writes the date and nothing else. */
  onSet: (day: Date) => void;
  /** *Book it*: opens the booking sheet seeded with the date. */
  onBook: () => void;
}

// The Next visit row (§4.4 R2; mock §B, B1 and B2).
//
// A RECHECK IS A DATE UNTIL THE OWNER BOOKS IT. The old row booked a `vet_appointments`
// row on the wheel's first settle (CUL-1150): on iOS a spinner reports a value each time
// a wheel stops, so rolling the month booked a recheck on the seed's day a month on, and
// the row went to "booked" with no way back. Every reader of appointments then believed
// it: the Home strip, the reminder and "Did it happen?" all asked about a visit nobody
// had made. So here:
//
//   • choosing writes nothing — a chip or the wheel only moves the CANDIDATE;
//   • *Set* is the one commit, and it commits the candidate as shown, the seed included
//     (CUL-984's half: a seed the owner keeps is a value, not "no answer");
//   • *Set* writes `next_visit_at` only (the route's job), never a booking;
//   • a booking, once one exists, is what the row reads, in the booking's own words.
export function RecheckRow({ petName, nextVisitAt, booking, busy, onSet, onBook }: RecheckRowProps) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [candidate, setCandidate] = useState<Date | null>(null);
  const [showWheel, setShowWheel] = useState(false);
  const glyph = <CalendarPlus size={16} color={theme.colorTextTertiary} strokeWidth={2} />;

  // Only a recheck the visit names can be answered by a booking (R2: "an appointment for
  // that recheck"). With no date set, a later booking for the pet answers nothing, and the
  // chips stay so the vet's recheck can still be recorded (adversarial pass, QUIET).
  if (nextVisitAt && booking) {
    // The booking's date and place, never the recheck's: the booking that answers it may
    // be on another day than the vet's "around", and the record cannot say it is a recheck.
    return (
      <PlanSettledRow
        glyph={glyph}
        title="Next visit"
        subtitle={[booking.when, 'Booked', booking.where].filter(Boolean).join(' · ')}
      />
    );
  }

  if (nextVisitAt) {
    return (
      <PlanActionRow
        glyph={glyph}
        title={`Recheck around ${formatVisitDate(nextVisitAt)}`}
        subtitle="Not booked yet"
        actionLabel="Book it"
        onPress={onBook}
        busy={busy}
      />
    );
  }

  function choose(next: Choice) {
    setChoice(next);
    if (next === 'pick') {
      // The wheel opens on the candidate already shown, or on the +6 week seed.
      setCandidate((prev) => prev ?? defaultRecheckDate());
      setShowWheel(true);
      return;
    }
    setShowWheel(false);
    setCandidate(recheckDateIn(next === '2w' ? 2 : 6));
  }

  return (
    <>
      <PlanChipRow
        glyph={glyph}
        title="Next visit"
        subtitle={`When does the vet want to see ${petName}?`}
        options={CHOICES}
        value={choice}
        onChange={(next) => choose(next as Choice)}
        busy={busy}
        accessibilityLabel="When the next visit is"
      />
      {choice === 'pick' && showWheel && candidate ? (
        <DateTimePicker
          testID="recheck-wheel"
          value={candidate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          themeVariant="light"
          accentColor={colorRoles.action.onLight}
          minimumDate={new Date()}
          onChange={(_, picked) => {
            // Android's dialog closes itself; iOS's wheel stays until *Set*. Either way a
            // pick only moves the candidate: nothing here writes.
            if (Platform.OS !== 'ios') setShowWheel(false);
            if (picked) setCandidate(picked);
          }}
        />
      ) : null}
      {candidate ? (
        <PlanActionRow
          glyph={null}
          title={`Around ${formatVisitDate(localDateKey(candidate))}`}
          actionLabel="Set"
          onPress={() => onSet(candidate)}
          busy={busy}
        />
      ) : null}
    </>
  );
}
