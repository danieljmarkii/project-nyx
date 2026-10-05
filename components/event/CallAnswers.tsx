import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { useEn14, refreshFollowUpNotifications } from '../../hooks/useFollowUps';
import { useLiveRegionAnnouncement } from '../../hooks/useLiveRegionAnnouncement';
import { useSyncStore } from '../../store/syncStore';
import { pushVetCalls, readIncidentCallState, recordCall, undoCall, type IncidentCallState } from '../../lib/vetCalls';
import { followUpNotificationsOn } from '../../lib/followUpNotifications';
import { analysisChainOutstanding, awaitAnalysisChain } from '../../lib/analysisChain';
import {
  CALL_ADD_NOTE,
  CALL_ANSWER_CALLED,
  CALL_ANSWER_NOT_YET,
  FOLLOW_UP_ADD_IT,
  FOLLOW_UP_NOT_RECORDED,
  FOLLOW_UP_TITLE,
  answeredLine,
  callConfirmation,
  calledOnLine,
} from '../../lib/vetCallState';
import { toLocalDayKey } from '../../lib/utils';

// "I've called · Not yet" on a call-tier read (Engines v3 PR-36, CUL-1419;
// docs/nyx-care-state-requirements.md §6.1–§6.3, TD-4 = D, mock round 3 §04).
//
//   You called on Oct 3.                         ← once a call covers this read
//   What did the vet say?                    ›   ← from 48 h, until it is answered or expires
//
//   [ I've called ]  [ Not yet ]                 ← a call-tier read with no call yet
//
// THE ASK IS NEVER LOWERED. This block sits BELOW the read and never touches it: the read's
// own words, rail and tier are drawn by the section above, word for word, before and after a
// call (§6.1, mock 4b). A call adds a dated fact; it removes nothing.
//
// "NOT YET" WRITES NOTHING (TD-5, provisional; the ruling is CUL-1597). The PM decision
// left to this PR is whether a call-now "Not yet" is asked once more that evening (Dr. Chen)
// or behaves as today (Jordan). Until it is ruled, it behaves as today: nothing is written,
// nothing is re-asked, and the read's ask stays exactly as it was. Neither option notifies.
//
// ONE SAFETY NET (C-21): "I've called" is recreatable, so it carries an Undo, never a
// confirm. The Undo stays on the line until the follow-up is answered: after that the call
// is part of an answered record, and the record is where it lives.
//
// DARK behind `engines_v3_en14` (the hook's gate), and absent on a read that does not ask for
// a call, so flag-off this renders nothing and reads nothing.

interface Props {
  eventId: string;
  /** The record's pet's name (C-9), for the answer's pronoun-free lines. */
  petName: string | null;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'not_yet' }
  | { kind: 'called'; confirmation: string }
  | { kind: 'taken_back' };

export const NOT_YET_CALL_LINE = 'Nothing saved. The read above still stands.';
export const CALL_TAKEN_BACK = 'Taken back. Nothing will be asked about this call.';

export function CallAnswers({ eventId, petName }: Props) {
  const flagOn = useEn14();
  const [state, setState] = useState<IncidentCallState | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const inFlight = useRef(false);
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const today = toLocalDayKey(new Date());

  const load = useCallback(async () => {
    try {
      setState(await readIncidentCallState(eventId));
      // The record usually opens while its read is still on the way (the log path claims the
      // chain), and a landing inside a claimed chain bumps no tick. So wait for that chain and
      // read again, or "I've called" would never draw under the read that just arrived.
      if (analysisChainOutstanding(eventId)) {
        await awaitAnalysisChain(eventId);
        setState(await readIncidentCallState(eventId));
      }
    } catch (e) {
      // Nothing drawn: the read above carries the ask whatever happens here.
      console.warn('[call-answers] read failed:', e);
      setState(null);
    }
  }, [eventId]);

  useEffect(() => {
    if (!flagOn) return;
    void load();
  }, [flagOn, load, hydrationTick]);

  const announcement =
    phase.kind === 'called' ? phase.confirmation : phase.kind === 'taken_back' ? CALL_TAKEN_BACK : null;
  useLiveRegionAnnouncement(announcement, phase.kind);

  if (!flagOn || !state?.callTier) return null;

  const call = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase({ kind: 'saving' });
    try {
      await recordCall(eventId);
      // Local-first: the push never holds the confirmation (it never rejects either).
      void pushVetCalls();
      const notificationsOn = await followUpNotificationsOn();
      await refreshFollowUpNotifications(true);
      await load();
      setPhase({ kind: 'called', confirmation: callConfirmation({ notificationsOn }) });
    } catch (e) {
      console.warn('[call-answers] save failed:', e);
      setPhase({ kind: 'idle' });
      Alert.alert('That didn’t save', 'Try that again in a moment.');
    } finally {
      inFlight.current = false;
    }
  };

  const undo = async (callId: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await undoCall(callId);
      void pushVetCalls();
      await refreshFollowUpNotifications(true);
      await load();
      setPhase({ kind: 'taken_back' });
    } catch (e) {
      console.warn('[call-answers] undo failed:', e);
      Alert.alert('That didn’t save', 'Try that again in a moment.');
    } finally {
      inFlight.current = false;
    }
  };

  const covering = state.covering;
  if (covering) {
    const { call: c, followUp } = covering;
    const open = () => router.push({ pathname: '/vet-call/[id]', params: { id: c.id } });
    return (
      <View style={styles.block} testID="call-answers-called" accessibilityLiveRegion="polite">
        <ThemedText style={styles.said}>{calledOnLine(c.calledOn, today)}</ThemedText>
        {phase.kind === 'called' ? <ThemedText style={styles.quiet}>{phase.confirmation}</ThemedText> : null}
        {followUp.kind === 'answered' ? (
          <ThemedText style={styles.quiet}>{answeredLine(followUp.answer, petName ?? 'them')}</ThemedText>
        ) : null}
        {followUp.kind === 'due' ? <Door label={FOLLOW_UP_TITLE} onPress={open} testID="call-follow-up-door" /> : null}
        {followUp.kind === 'expired' ? (
          <Door label={`${FOLLOW_UP_NOT_RECORDED} ${FOLLOW_UP_ADD_IT}`} onPress={open} testID="call-follow-up-door" />
        ) : null}
        <View style={styles.row}>
          <Answer label={c.note ? 'Your note' : CALL_ADD_NOTE} onPress={open} />
          {/* Undo only while this phone's call is the escalation's one call: with another
              caregiver's call beside it, an Undo here could not take the call back (adversarial
              pass 3, item 8), and the other phone's call is not this phone's to withdraw. */}
          {followUp.kind !== 'answered' && covering.calls === 1 && covering.ownCall ? (
            <Answer
              label="Undo"
              onPress={() => {
                // ONE safety net (C-21): a call is recreatable, so Undo needs no confirm, but
                // a note is the owner's own words and is not. With a note, confirm and name it.
                if (!c.note) {
                  void undo(c.id);
                  return;
                }
                Alert.alert('Take back this call?', 'Your note about it goes too.', [
                  { text: 'Keep it', style: 'cancel' },
                  { text: 'Take it back', style: 'destructive', onPress: () => void undo(c.id) },
                ]);
              }}
            />
          ) : null}
        </View>
      </View>
    );
  }

  const busy = phase.kind === 'saving';
  return (
    <View style={styles.block} testID="call-answers">
      {phase.kind === 'not_yet' ? <ThemedText style={styles.quiet}>{NOT_YET_CALL_LINE}</ThemedText> : null}
      {phase.kind === 'taken_back' ? <ThemedText style={styles.quiet}>{CALL_TAKEN_BACK}</ThemedText> : null}
      <View style={styles.row} testID="call-answers-row">
        <Answer label={CALL_ANSWER_CALLED} onPress={() => { if (!busy) void call(); }} />
        <Answer label={CALL_ANSWER_NOT_YET} onPress={() => { if (!busy) setPhase({ kind: 'not_yet' }); }} />
      </View>
    </View>
  );
}

// No `disabled` while a save is in flight (C-7): the tap is ignored by the handler instead.
function Answer({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.answer, pressed && styles.answerPressed]}
      testID={`call-answer-${label}`}
    >
      <ThemedText style={styles.answerText}>{label}</ThemedText>
    </Pressable>
  );
}

function Door({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.door, pressed && styles.answerPressed]}
      testID={testID}
    >
      <ThemedText style={styles.doorText}>{label}</ThemedText>
      <ThemedText style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no">
        ›
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: {
    marginTop: theme.space3,
    gap: theme.space1,
  },
  said: {
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  quiet: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextTertiary,
  },
  // Wrapping row, no slop: each answer's own 44pt box is its whole target (C-5).
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: theme.space1,
    rowGap: theme.space1,
  },
  answer: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.space2,
    borderRadius: theme.radiusFull,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    backgroundColor: theme.colorSurface,
  },
  answerPressed: {
    backgroundColor: theme.colorSurfaceSubtle,
  },
  answerText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  door: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  doorText: {
    flexShrink: 1,
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  chevron: {
    fontSize: theme.textMD,
    color: theme.colorTextTertiary,
  },
});
