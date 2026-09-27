// The trial's own screen (TS-4 · CUL-1300; `docs/nyx-trial-screen-requirements.md` §3, §4,
// §6; design authority `docs/culprit-trial-screen-mockups.html` round 2).
//
// DRAWS `lib/trialScreenModel` AND DECIDES NOTHING. Every string about the record arrives
// in the model from the module that already writes it (S2), and every withholding rule
// lives there too (S3, S4, S7). This file owns the reads (all keyed on the ROUTE'S pet,
// never `activePet`, C-9), the layout, the doors and the one lifecycle host.
//
// ORDER, TOP TO BOTTOM (§3, round 2): the title and its sub-line; on a safety face the
// register block, then the doors, then the card's own actions, and nothing else; on every
// other face the decision block (milestone, overrun), *What {pet} can eat*, then ONE card
// holding the ledger and the facts with one qualifier at its foot, then the doors, then the
// state's action at the bottom (Jordan: "I don't want the scary button first on a screen
// I open every day").
//
// THE LIFECYCLE is `useTrialLifecycle` + `TrialLifecycleSheets` (TS-3): the same writes the
// Pet tab's card makes, through the one shared host (S6, S8). A pushed stack screen is not
// a Modal, so it may present them (C-14). *Replace* and *Start* hand off to the Pet tab,
// where `StartTrialModal` must stay mounted (B-535; `lib/profileFocus`).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { useDietTrial } from '../../hooks/useDietTrial';
import { useTrialAllowedSet } from '../../hooks/useTrialAllowedSet';
import { useTrialFacts } from '../../hooks/useTrialFacts';
import { useTrialLifecycle } from '../../hooks/useTrialLifecycle';
import { useTrialSignalDoor } from '../../hooks/useTrialSignalDoor';
import { focusAccessibility } from '../../lib/a11yFocus';
import type { TrialCardAction, TrialCardActionId } from '../../lib/dietTrialCard';
import type { TrialSignalDoor } from '../../lib/trialSignalDoor';
import { PROFILE_ROUTE, profileStartTrialHref } from '../../lib/profileFocus';
import {
  buildTrialScreenModel,
  noTrialLine,
  TO_HOME,
  TO_THE_PET_TAB,
  TRIAL_SCREEN_HEADER,
  TRY_AGAIN,
  UNKNOWN_PET_LINE,
  unreadableLine,
  type TrialScreenDoor,
  type TrialScreenTrial,
} from '../../lib/trialScreenModel';
import { readVetVisitsHome } from '../../lib/vetVisits';
import { resolveRecordPetName, usePetStore } from '../../store/petStore';
import { useSyncStore } from '../../store/syncStore';
import { TrialContaminantNote } from '../food/TrialContaminantNote';
import { TrialLifecycleSheets } from '../trial/TrialLifecycleSheets';
import { Card } from '../ui/Card';
import { Header } from '../ui/Header';
import { PrimaryButton } from '../ui/PrimaryButton';
import { Skeleton } from '../ui/Skeleton';
import { ThemedText } from '../ui/ThemedText';
import { TrialLedger } from './TrialLedger';

/** The pet's next booking, for the Get ready door (§3.8). Keyed on the route's pet. A read
 *  that fails draws no door: the door is a convenience, never a claim about the record. */
function useNextAppointment(petId: string): { id: string; when: string } | null {
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const [state, setState] = useState<{ petId: string; next: { id: string; when: string } | null }>({
    petId,
    next: null,
  });
  useEffect(() => {
    let cancelled = false;
    readVetVisitsHome(petId)
      .then((home) => {
        if (!cancelled) {
          setState({ petId, next: home.next ? { id: home.next.id, when: home.next.when } : null });
        }
      })
      .catch((e) => {
        console.error('[TrialScreen] appointment read failed:', e);
        if (!cancelled) setState({ petId, next: null });
      });
    return () => {
      cancelled = true;
    };
  }, [petId, hydrationTick]);
  return state.petId === petId ? state.next : null;
}

export function TrialScreen({ petId }: { petId: string }) {
  const pets = usePetStore((s) => s.pets);
  const activePetId = usePetStore((s) => s.activePet?.id ?? null);
  const pet = pets.find((p) => p.id === petId) ?? null;
  const petName = resolveRecordPetName(pets, petId);

  const dietTrial = useDietTrial(petId);
  const facts = useTrialFacts(petId);
  const allowedSet = useTrialAllowedSet(petId);
  const appointment = useNextAppointment(petId);

  const model = buildTrialScreenModel({
    petId,
    pet,
    petsLoaded: pets.length > 0,
    petName,
    isActivePet: activePetId === petId,
    trial: { status: dietTrial.status, input: dietTrial.input, inputIsForPet: dietTrial.inputIsForPet },
    facts,
    allowedSet,
    appointment,
  });

  // §3.7 (TS-9): the door to the Signal's trial finding, exactly when Home would draw that
  // card. The register is the model's, so it is only ever this pet's answered facts.
  const signalDoor = useTrialSignalDoor({
    petId,
    trial: dietTrial.inputIsForPet ? (dietTrial.input?.trial ?? null) : null,
    notEating: model.kind === 'trial' ? model.notEating : null,
    nowMs: dietTrial.input?.nowMs ?? Date.now(),
  });

  // The lifecycle writes against the input on screen, and only when it is this pet's.
  const lifecycle = useTrialLifecycle({
    petId,
    input: dietTrial.inputIsForPet ? dietTrial.input : null,
    reload: dietTrial.reload,
  });

  // Back from the allowed list, the exposures list or Get ready: re-read, as the Pet tab's
  // card does on focus. The first focus is the arrival, which the hooks already read for.
  const { reload } = dietTrial;
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) reload();
      focusedOnce.current = true;
    }, [reload]),
  );

  // VoiceOver lands on the title when the model arrives (§6). The title element carries
  // the sub-line, so on a safety face the safety block is the next thing read.
  const titleRef = useRef<View>(null);
  const arrived = model.kind === 'trial';
  useEffect(() => {
    if (arrived) focusAccessibility(titleRef.current);
  }, [arrived]);

  const handOffToStart = useCallback(() => {
    router.push(profileStartTrialHref({ petId, nowMs: Date.now() }));
  }, [petId]);

  const handlers: Partial<Record<TrialCardActionId, () => void>> = {
    trial_manage: lifecycle.openManage,
    milestone: () => lifecycle.openCompletion('decision'),
    trial_extend: () => {
      void lifecycle.extend();
    },
    trial_complete: () => lifecycle.openCompletion('complete'),
    trial_stopped_early: () => lifecycle.openCompletion('stopped_early'),
    open_report: () => router.push('/report'),
    start_trial: handOffToStart,
  };

  return (
    <View style={styles.container} testID="trial-screen">
      <Header title={TRIAL_SCREEN_HEADER} leading="back" onLeadingPress={() => router.back()} />
      {model.kind === 'loading' ? (
        <LoadingBody />
      ) : model.kind === 'unreadable' ? (
        <StateBody
          testID="trial-screen-unreadable"
          line={unreadableLine(model.petName)}
          action={TRY_AGAIN}
          onAction={dietTrial.reload}
        />
      ) : model.kind === 'no_trial' ? (
        <StateBody
          testID="trial-screen-no-trial"
          line={noTrialLine(model.petName)}
          action={TO_THE_PET_TAB}
          onAction={() =>
            router.push({ pathname: PROFILE_ROUTE, params: { pet: petId, ts: String(Date.now()) } })
          }
        />
      ) : model.kind === 'unknown_pet' ? (
        <StateBody
          testID="trial-screen-unknown-pet"
          line={UNKNOWN_PET_LINE}
          action={TO_HOME}
          onAction={() => router.replace('/(tabs)')}
        />
      ) : (
        <TrialBody
          model={model}
          petId={petId}
          signalDoor={signalDoor}
          titleRef={titleRef}
          handlers={handlers}
          busyAction={lifecycle.extending ? 'trial_extend' : null}
          onManage={lifecycle.openManage}
        />
      )}
      <TrialLifecycleSheets lifecycle={lifecycle} onReplaceTrial={handOffToStart} />
    </View>
  );
}

// ── The trial ────────────────────────────────────────────────────────────────────────

interface TrialBodyProps {
  model: TrialScreenTrial;
  petId: string;
  /** §3.7 (TS-9) — null wherever Home would draw no trial card, or Design v2 is off. */
  signalDoor: TrialSignalDoor | null;
  titleRef: React.RefObject<View | null>;
  handlers: Partial<Record<TrialCardActionId, () => void>>;
  busyAction: TrialCardActionId | null;
  onManage: () => void;
}

function TrialBody({ model, petId, signalDoor, titleRef, handlers, busyAction, onManage }: TrialBodyProps) {
  const safety = model.safety !== null;
  const hasRecordCard =
    model.ledger !== null ||
    model.facts.length > 0 ||
    model.vomiting !== null ||
    model.qualifier !== null ||
    model.standingMeta !== null ||
    model.standingNote !== null;

  const doors = (
    <View style={styles.doors}>
      {model.getReady ? (
        <DoorRow
          door={model.getReady}
          testID="trial-door-get-ready"
          onPress={() =>
            router.push({ pathname: '/rundown', params: { appointmentId: model.getReady?.appointmentId ?? '' } })
          }
        />
      ) : null}
      {model.report ? (
        <DoorRow door={model.report} testID="trial-door-report" onPress={() => router.push('/report')} />
      ) : null}
    </View>
  );

  // §3.7 (TS-9): directly under the facts card, whose last line is the vomiting sentence,
  // on both faces. On a safety face only a RISING pair can reach here (Home withholds the
  // falling one over a pet that may not be eating), and Home keeps that card, so the
  // screen keeps its door (S7: never less than Home when it escalates).
  const signalRow = signalDoor ? (
    <DoorRow
      door={signalDoor}
      testID="trial-door-signal"
      onPress={() => router.push(signalDoor.href)}
    />
  ) : null;

  // §3.9: the running trial's bottom action, and the intake-decline face's after its doors
  // (CUL-1339 #2). Null wherever the model withholds it.
  const manageLink =
    model.manage !== null ? (
      <Pressable
        onPress={onManage}
        accessibilityRole="button"
        accessibilityLabel={model.manage}
        testID="trial-manage"
        style={styles.linkAction}
      >
        <ThemedText style={styles.linkActionText}>{model.manage}</ThemedText>
      </Pressable>
    ) : null;

  return (
    <ScrollView contentContainerStyle={styles.scroll} testID="trial-screen-body">
      {/* One element for the title and its sub-line (§6): VoiceOver lands here, and on a
          safety face the safety block is the very next thing read. */}
      <View ref={titleRef} accessible accessibilityRole="header" testID="trial-screen-title" style={styles.titleBlock}>
        <ThemedText style={styles.title}>{model.title}</ThemedText>
        {model.subline !== null ? (
          <ThemedText style={styles.subline} testID="trial-screen-subline">{model.subline}</ThemedText>
        ) : null}
      </View>

      {safety ? (
        <>
          {/* §3.2, S4: the card's register lines, first. A plain text block with a rose
              rail and no chart. Read as one element so the fact and the ask travel
              together. */}
          <View style={styles.safety} testID="trial-safety" accessible>
            {(model.safety ?? []).map((line, i) => (
              <ThemedText
                key={i}
                testID="trial-safety-line"
                style={i === 0 ? styles.safetyFact : styles.safetyAsk}
              >
                {line}
              </ThemedText>
            ))}
            {model.forTheCall ? (
              // §3.3 (TS-7): inside the rail, under the register, so the fact, the ask and
              // what to have ready read as one element and never drift apart on screen.
              <View style={styles.call} testID="trial-for-the-call">
                <ThemedText style={styles.callHeading}>{model.forTheCall.heading}</ThemedText>
                {model.forTheCall.facts.map((line, i) => (
                  <ThemedText key={i} testID="trial-for-the-call-line" style={styles.callLine}>
                    {line}
                  </ThemedText>
                ))}
                {model.forTheCall.swap !== null ? (
                  <ThemedText testID="trial-for-the-call-swap" style={styles.callSwap}>
                    {model.forTheCall.swap}
                  </ThemedText>
                ) : null}
              </View>
            ) : null}
          </View>
          {model.facts.length > 0 ? (
            <Card testID="trial-record-card" style={styles.recordCard}>
              <FactLines model={model} />
            </Card>
          ) : null}
          {signalRow}
          {model.exposures ? (
            <DoorRow
              door={model.exposures}
              testID="trial-door-exposures"
              onPress={() => router.push({ pathname: '/trial-exposures', params: { pet: petId } })}
            />
          ) : null}
          {doors}
          <ActionList actions={model.actions} handlers={handlers} busyAction={busyAction} />
          {/* CUL-1339 #2: the intake-decline face carries Manage, after the doors. */}
          {manageLink}
        </>
      ) : (
        <>
          {model.headline !== null ? (
            <ThemedText style={styles.headline} testID="trial-headline">{model.headline}</ThemedText>
          ) : null}
          {model.decision ? (
            <View style={styles.decision} testID="trial-decision">
              {model.decision.notes.map((note, i) => (
                <ThemedText key={i} style={styles.decisionNote} testID="trial-decision-note">{note}</ThemedText>
              ))}
              <ActionList actions={model.decision.actions} handlers={handlers} busyAction={busyAction} />
            </View>
          ) : null}
          {model.allowedFoods ? (
            <DoorRow
              door={model.allowedFoods}
              strong
              testID="trial-door-allowed-foods"
              onPress={() => router.push({ pathname: '/trial-foods', params: { pet: petId } })}
            />
          ) : null}
          {hasRecordCard ? (
            <Card testID="trial-record-card" style={styles.recordCard}>
              {model.ledger ? <TrialLedger ledger={model.ledger} /> : null}
              <FactLines model={model} />
            </Card>
          ) : null}
          {signalRow}
          {model.exposures ? (
            <DoorRow
              door={model.exposures}
              testID="trial-door-exposures"
              onPress={() => router.push({ pathname: '/trial-exposures', params: { pet: petId } })}
            />
          ) : null}
          {doors}
          <ActionList actions={model.actions} handlers={handlers} busyAction={busyAction} />
          {manageLink}
        </>
      )}
    </ScrollView>
  );
}

/** The facts, in the card's order (§3.6); the vomiting line last at the strip's size with
 *  no heading (§3.7); then the one qualifier at the card's foot (§3.5). */
function FactLines({ model }: { model: TrialScreenTrial }) {
  return (
    <View style={styles.facts}>
      {model.facts.map((line, i) => (
        <ThemedText
          key={`${line.role}-${i}`}
          testID={`trial-fact-${line.role}`}
          style={[
            styles.fact,
            line.role === 'lead' && styles.factLead,
            line.role === 'caveat' && styles.qualifier,
            line.role === 'qualifier' && styles.qualifier,
            (line.role === 'forward' || line.role === 'note' || line.role === 'teach') && styles.factQuiet,
          ]}
        >
          {line.text}
        </ThemedText>
      ))}
      {model.vomiting !== null ? (
        <ThemedText style={styles.vomiting} testID="trial-vomiting">{model.vomiting}</ThemedText>
      ) : null}
      {model.standingMeta !== null ? (
        <ThemedText style={styles.qualifier} testID="trial-standing-meta">{model.standingMeta}</ThemedText>
      ) : null}
      {model.standingNote ? (
        <TrialContaminantNote title={model.standingNote.title} body={model.standingNote.body} />
      ) : null}
      {model.qualifier !== null ? (
        <ThemedText style={styles.qualifier} testID="trial-qualifier">{model.qualifier}</ThemedText>
      ) : null}
    </View>
  );
}

/** The state's own actions, drawn at the weight the card's model declares (§4.3: `Keep
 *  going` is never weaker than `This trial is done`). An action with no handler is not
 *  drawn: a button that goes nowhere is worse than no button. */
function ActionList({
  actions,
  handlers,
  busyAction,
}: {
  actions: TrialCardAction[];
  handlers: Partial<Record<TrialCardActionId, () => void>>;
  busyAction: TrialCardActionId | null;
}) {
  if (actions.length === 0) return null;
  return (
    <View style={styles.actions}>
      {actions.map((action) => {
        const onPress = handlers[action.id];
        if (!onPress) return null;
        if (action.emphasis === 'link') {
          return (
            <Pressable
              key={action.id}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              testID={`trial-action-${action.id}`}
              style={styles.linkAction}
            >
              <ThemedText style={styles.linkActionText}>{action.label}</ThemedText>
            </Pressable>
          );
        }
        const busy = busyAction === action.id;
        return (
          <PrimaryButton
            key={action.id}
            testID={`trial-action-${action.id}`}
            label={action.label}
            variant={action.emphasis === 'primary' ? 'primary' : 'secondary'}
            onPress={onPress}
            loading={busy}
            disabled={busyAction !== null && !busy}
          />
        );
      })}
    </View>
  );
}

/** A door row (§3.4, §3.8): the whole row is one ≥ 44pt button whose label is its visible
 *  text (C-5, C-7). Rows sit flush with a gap and no hit slop, so no two share a hit area. */
function DoorRow({
  door,
  onPress,
  strong,
  testID,
}: {
  door: TrialScreenDoor;
  onPress: () => void;
  strong?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={door.sub ? `${door.label}, ${door.sub}` : door.label}
      testID={testID}
      style={[styles.door, strong && styles.doorStrong]}
    >
      <View style={styles.doorBody}>
        <ThemedText style={[styles.doorHead, strong && styles.doorHeadStrong]}>{door.label}</ThemedText>
        {door.sub !== null ? <ThemedText style={styles.doorSub}>{door.sub}</ThemedText> : null}
      </View>
      <ChevronRight size={18} color={theme.colorTextTertiary} />
    </Pressable>
  );
}

// ── The three answers that are not a trial (§4, S9) ─────────────────────────────────

/** Loading: a skeleton shaped like the ledger, no spinner (a sub-second local read). */
function LoadingBody() {
  return (
    <View
      style={styles.scroll}
      testID="trial-screen-loading"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Skeleton width="70%" height={24} />
      <Skeleton width="55%" height={12} />
      <Skeleton height={48} radius={theme.radiusMedium} />
      <Card style={styles.recordCard}>
        <View style={styles.facts}>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} height={19} />
          ))}
        </View>
      </Card>
    </View>
  );
}

function StateBody({
  line,
  action,
  onAction,
  testID,
}: {
  line: string;
  action: string;
  onAction: () => void;
  testID: string;
}) {
  return (
    <View style={styles.scroll} testID={testID}>
      <ThemedText style={styles.stateLine}>{line}</ThemedText>
      <PrimaryButton label={action} variant="secondary" onPress={onAction} testID={`${testID}-action`} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    padding: theme.space3,
    gap: theme.space2,
  },
  title: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textSignal,
    lineHeight: theme.lineHeightSignal,
    letterSpacing: theme.trackingTight,
    color: theme.colorTextPrimary,
  },
  titleBlock: {
    gap: theme.space1,
  },
  subline: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
  },
  headline: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textXL,
    color: theme.colorTextPrimary,
  },
  decision: {
    gap: theme.space2,
  },
  decisionNote: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
  },
  safety: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    borderLeftWidth: 3,
    borderLeftColor: theme.colorEventSymptom,
    padding: theme.space3,
    gap: theme.space1,
  },
  safetyFact: {
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  safetyAsk: {
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    fontWeight: theme.weightMedium,
    color: theme.colorEventSymptomInk,
  },
  call: {
    marginTop: theme.space2,
    paddingTop: theme.space2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colorBorder,
    gap: theme.space1,
  },
  callHeading: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  callLine: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextPrimary,
  },
  callSwap: {
    marginTop: theme.space1,
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
  },
  recordCard: {
    gap: theme.space2,
  },
  facts: {
    gap: theme.space1,
  },
  fact: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextPrimary,
  },
  factLead: {
    fontWeight: theme.weightMedium,
  },
  factQuiet: {
    color: theme.colorTextSecondary,
  },
  vomiting: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextSecondary,
  },
  qualifier: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextTertiary,
  },
  doors: {
    gap: theme.space1,
  },
  door: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    minHeight: 44,
    paddingHorizontal: theme.space3,
    paddingVertical: theme.space2,
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  doorStrong: {
    backgroundColor: theme.colorAccentLight,
    borderColor: theme.colorAccentLight,
  },
  doorBody: {
    flex: 1,
    minWidth: 0,
  },
  doorHead: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  doorHeadStrong: {
    color: theme.colorAccentInk,
  },
  doorSub: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextSecondary,
  },
  actions: {
    gap: theme.space2,
  },
  linkAction: {
    minHeight: 44,
    justifyContent: 'center',
  },
  linkActionText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
  stateLine: {
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextPrimary,
  },
});
