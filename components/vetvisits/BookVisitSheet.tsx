import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { ChipGroup } from '../ui/ChipGroup';
import { PrimaryButton } from '../ui/PrimaryButton';
import { TextField } from '../ui/TextField';
import { ThemedText } from '../ui/ThemedText';
import { SectionLabel } from '../ui/SectionLabel';
import {
  composeScheduledAt,
  formatVisitWeekday,
  localDateKey,
  type VisitPrefill,
} from '../../lib/vetVisits';

/** Which arm of the sheet is open — the one question "Add" asks first. */
export type VisitMode = 'booked' | 'happened';

export interface BookVisitSubmit {
  mode: VisitMode;
  /** 'YYYY-MM-DD' — the local calendar day, both arms. */
  day: string;
  /** The composed instant; null on the `happened` arm, which stores a DATE. */
  scheduledAt: string | null;
  clinicName: string;
  vetName: string;
  reason: string;
  /** Other pets to book the same appointment for (`booked` only). */
  alsoForPetIds: string[];
}

interface Props {
  visible: boolean;
  /** Which arm to open on. E2's two doors preselect it; the list's "Add" defaults. */
  initialMode: VisitMode;
  /** The RECORD's pet — the sheet writes under this id, never `activePet`. */
  petName: string;
  /** Every OTHER pet in the account. Empty in a one-pet account. */
  otherPets: Array<{ id: string; name: string }>;
  prefill: VisitPrefill;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (input: BookVisitSubmit) => void;
}

const MODE_OPTIONS = [
  { value: 'booked', label: 'Booked' },
  { value: 'happened', label: 'Already happened' },
];

// Mock E3 — booking, and its sibling arm for a visit that already happened.
//
// "Add" asks ONE thing first (the issue's decide-on-the-fly default): booked, or
// already happened. Everything below the chips follows from the answer, so the
// owner answers a question rather than picking between two buttons whose
// difference they have to infer.
//
// Only the DATE is required (AC 2). Clinic and vet arrive prefilled from the last
// visit, so the common case — the same clinic again — is a date and a tap.
export function BookVisitSheet({
  visible,
  initialMode,
  petName,
  otherPets,
  prefill,
  busy = false,
  onClose,
  onSubmit,
}: Props) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<VisitMode>(initialMode);
  const [day, setDay] = useState<Date>(() => new Date());
  const [time, setTime] = useState<Date | null>(null);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [clinicName, setClinicName] = useState('');
  const [vetName, setVetName] = useState('');
  const [reason, setReason] = useState('');
  const [alsoFor, setAlsoFor] = useState<Set<string>>(new Set());

  // Re-seed on each OPEN rather than on mount: the sheet is kept mounted by its
  // host, so a mount-time seed would hand the second booking the first one's
  // half-typed reason. The prefill is a starting point the owner may overwrite —
  // seeding it here and not on every render is what lets them.
  useEffect(() => {
    if (!visible) return;
    setMode(initialMode);
    setClinicName(prefill.clinicName ?? '');
    setVetName(prefill.vetName ?? '');
    setReason('');
    setTime(null);
    setAlsoFor(new Set());
    // The last visit's own "come back on" date seeds the day when it named one and
    // that date has not already passed — a recheck the owner is now booking. A
    // past next_visit_at is a date they are already late for, so it seeds nothing
    // and today stands.
    const seeded = prefill.suggestedDate ? parseDayKey(prefill.suggestedDate) : null;
    const today = new Date();
    setDay(seeded && seeded.getTime() >= startOfDay(today).getTime() ? seeded : today);
  }, [visible, initialMode, prefill.clinicName, prefill.vetName, prefill.suggestedDate]);

  const dayLabel = useMemo(() => formatVisitWeekday(localDateKey(day)), [day]);
  const isBooked = mode === 'booked';

  function submit() {
    const key = localDateKey(day);
    onSubmit({
      mode,
      day: key,
      // A visit that happened is remembered as a DAY (`vet_visits.visited_at` is a
      // DATE) — composing an instant for it would invent a precision the record
      // does not hold.
      scheduledAt: isBooked ? composeScheduledAt(day, time) : null,
      clinicName,
      vetName,
      reason,
      alsoForPetIds: isBooked ? [...alsoFor] : [],
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + theme.space2 }]}
          accessibilityViewIsModal
        >
          <View style={styles.grabber} />
          <ThemedText style={styles.title}>{isBooked ? 'Next visit' : 'A visit that happened'}</ThemedText>
          <ThemedText style={styles.subtitle}>For {petName}</ThemedText>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollInner}
            keyboardShouldPersistTaps="handled"
          >
            <ChipGroup
              options={MODE_OPTIONS}
              value={mode}
              onChange={(next) => next && setMode(next as VisitMode)}
              // A required choice: one of the two is always true, so a second tap
              // on the active chip must not clear it.
              allowDeselect={false}
              accessibilityLabel="Has this visit happened yet"
              style={styles.modes}
            />

            <SectionLabel label="When" style={styles.label} />
            <TouchableOpacity
              style={styles.value}
              onPress={() => setShowDayPicker((v) => !v)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Date, ${dayLabel}`}
              accessibilityHint="Opens a date picker"
            >
              <ThemedText style={styles.valueText}>{dayLabel}</ThemedText>
            </TouchableOpacity>
            {showDayPicker && (
              <DateTimePicker
                value={day}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                // A booking is in the future, a logged visit is in the past. The
                // bound is the honest one for each arm rather than one shared
                // compromise that lets an owner book last Tuesday.
                minimumDate={isBooked ? startOfDay(new Date()) : undefined}
                maximumDate={isBooked ? undefined : new Date()}
                onChange={(_, picked) => {
                  if (Platform.OS !== 'ios') setShowDayPicker(false);
                  if (picked) setDay(picked);
                }}
              />
            )}

            {isBooked && (
              <>
                <SectionLabel label="Time" style={styles.label} />
                <View style={styles.timeRow}>
                  <TouchableOpacity
                    style={[styles.value, styles.timeValue]}
                    onPress={() => setShowTimePicker((v) => !v)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={time ? `Time, ${formatTime(time)}` : 'Time, not set'}
                    accessibilityHint="Opens a time picker"
                  >
                    <ThemedText style={time ? styles.valueText : styles.valuePlaceholder}>
                      {time ? formatTime(time) : 'Optional'}
                    </ThemedText>
                  </TouchableOpacity>
                  {/* Only rendered once there IS a time to clear: a control that
                      undoes nothing is chrome, and `disabled` would be a claim
                      that something is there to remove (C-7). */}
                  {time ? (
                    <TouchableOpacity
                      onPress={() => setTime(null)}
                      style={styles.clearTime}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel="Clear the time"
                    >
                      <ThemedText style={styles.clearTimeText}>Clear</ThemedText>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {showTimePicker && (
                  <DateTimePicker
                    value={time ?? defaultTimeOfDay(day)}
                    mode="time"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, picked) => {
                      if (Platform.OS !== 'ios') setShowTimePicker(false);
                      if (picked) setTime(picked);
                    }}
                  />
                )}
              </>
            )}

            <SectionLabel label="Where" style={styles.label} />
            <TextField
              value={clinicName}
              onChangeText={setClinicName}
              placeholder="Clinic"
              accessibilityLabel="Clinic"
            />
            <TextField
              value={vetName}
              onChangeText={setVetName}
              placeholder="Vet"
              accessibilityLabel="Vet"
              containerStyle={styles.stackedField}
            />
            {prefill.clinicName || prefill.vetName ? (
              <ThemedText style={styles.hint}>From the last visit — change it if it moved.</ThemedText>
            ) : null}

            <SectionLabel label="Reason" style={styles.label} />
            <TextField
              value={reason}
              onChangeText={setReason}
              placeholder="Recheck, vaccines, something new…"
              accessibilityLabel="Reason"
            />

            {/* Sam's ask (§0.2): two cats, one car journey, one appointment slot.
                Renders only in a multi-pet account — a toggle that can only ever
                do nothing is not an option, it is furniture. Booking only: a
                second row here is a second APPOINTMENT, and what "also for" would
                mean about a visit that already happened is a different question
                than this sheet is asking. */}
            {isBooked && otherPets.length > 0 ? (
              <View style={styles.alsoFor}>
                {otherPets.map((pet) => (
                  <View key={pet.id} style={styles.alsoForRow}>
                    <View style={styles.alsoForMain}>
                      <ThemedText style={styles.alsoForLabel}>Also for {pet.name}</ThemedText>
                      <ThemedText style={styles.alsoForSub}>
                        Books the same appointment under {pet.name}
                      </ThemedText>
                    </View>
                    <Switch
                      value={alsoFor.has(pet.id)}
                      onValueChange={(next) =>
                        setAlsoFor((prev) => {
                          const out = new Set(prev);
                          if (next) out.add(pet.id);
                          else out.delete(pet.id);
                          return out;
                        })
                      }
                      trackColor={{ true: theme.colorAccent, false: theme.colorBorderStrong }}
                      ios_backgroundColor={theme.colorBorderStrong}
                      accessibilityLabel={`Also book this appointment for ${pet.name}`}
                    />
                  </View>
                ))}
              </View>
            ) : null}

            <PrimaryButton
              label={isBooked ? 'Add the appointment' : `Save ${petName}’s visit`}
              onPress={submit}
              loading={busy}
              style={styles.submit}
            />

            {/* Says what the save does elsewhere in the app, in the tense it is
                true in. The reminder line is not a tease — it is the honest edge
                of what this ships (CUL-253 owns reminders). */}
            <ThemedText style={styles.footnote}>
              {isBooked
                ? 'Shows on Home in the days before. No reminder yet — that is its own step.'
                : 'Your next vet report starts from this visit.'}
            </ThemedText>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function startOfDay(d: Date): Date {
  const out = new Date(d.getTime());
  out.setHours(0, 0, 0, 0);
  return out;
}

/** 'YYYY-MM-DD' → a local Date. Never `new Date(str)`, which parses it as UTC. */
function parseDayKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Where the time spinner opens when no time has been chosen: a clinic morning. */
function defaultTimeOfDay(day: Date): Date {
  const out = new Date(day.getTime());
  out.setHours(9, 0, 0, 0);
  return out;
}

function formatTime(d: Date): string {
  const h24 = d.getHours();
  const suffix = h24 < 12 ? 'am' : 'pm';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(d.getMinutes()).padStart(2, '0')} ${suffix}`;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colorScrim,
  },
  sheet: {
    backgroundColor: theme.colorSurface,
    borderTopLeftRadius: theme.radiusLarge,
    borderTopRightRadius: theme.radiusLarge,
    paddingTop: 10,
    paddingHorizontal: theme.space3,
    maxHeight: '90%',
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorBorderStrong,
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  subtitle: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    marginTop: 2,
  },
  scroll: {
    marginTop: theme.space2,
  },
  scrollInner: {
    paddingBottom: theme.space2,
  },
  modes: {
    marginBottom: 4,
  },
  label: {
    marginTop: theme.space2,
    marginBottom: 6,
  },
  value: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: theme.radiusMedium,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    backgroundColor: theme.colorSurfaceSubtle,
  },
  valueText: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  valuePlaceholder: {
    fontSize: theme.textMD,
    color: theme.colorTextTertiary,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // The value box and Clear are adjacent controls, so the gap clears both
    // reaches: Clear carries 10pt of horizontal slop and the box carries none,
    // which puts the floor at 10 (C-5).
    gap: 12,
  },
  timeValue: {
    flex: 1,
  },
  clearTime: {
    minHeight: 44,
    justifyContent: 'center',
  },
  clearTimeText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  stackedField: {
    marginTop: theme.space1,
  },
  hint: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextTertiary,
    marginTop: 6,
  },
  alsoFor: {
    marginTop: theme.space2,
    borderRadius: theme.radiusMedium,
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  alsoForRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 56,
  },
  alsoForMain: {
    flex: 1,
    minWidth: 0,
  },
  alsoForLabel: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  alsoForSub: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextTertiary,
    marginTop: 2,
  },
  submit: {
    marginTop: theme.space3,
  },
  footnote: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextTertiary,
    textAlign: 'center',
    marginTop: theme.space1,
  },
});
