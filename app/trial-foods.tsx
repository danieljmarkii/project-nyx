// "What {pet} can eat" — the allowed-set screen (B-616 PR 2 / B-458's first half).
// Spec §2.2–§2.3; design authority: mock screens B and C
// (docs/culprit-food-library-trial-mockups.html).
//
// ── WHAT THIS SCREEN IS FOR ─────────────────────────────────────────────────
//
// The allowed set is the rule an owner is trying to follow for eight weeks, and
// until now it existed only inside the classifier. D3 was ratified partly on the
// set being "a re-readable rule list" (the round-1b Jordan review), and this is the
// only non-punitive place in the app where a permitted food can be added: every
// other trial surface tells the owner what they FED, and this one tells them what
// they MAY feed.
//
// ── THE REGISTER (R1) ───────────────────────────────────────────────────────
//
// Every string here is about the LIST. Nothing is marked off-diet, nothing is
// counted, no coverage or adherence appears (§6.9), and no row praises or warns.
// The C6 disclosure at the foot is the one sentence that names what the app is
// doing with the record, and it is LOCKED copy rendered on this screen only.
//
// ── THE THREE STATES ────────────────────────────────────────────────────────
//
// `ready` renders. `unknown` renders a spinner and NOT an empty list — R2: a read
// that could not answer must never be drawn as an answer, and an empty allowed-set
// screen is the strongest "nothing is permitted" claim in the app. `no_trial` is a
// fact we actually know, so it says so plainly and offers the way back; the screen
// is only reachable while a trial runs, so this is the trial ending underneath the
// owner (FR-4's clean disappearance, arriving here as a state rather than a stale
// list).
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { theme } from '../constants/theme';
import { Header } from '../components/ui/Header';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { SectionLabel } from '../components/ui/SectionLabel';
import { WhorlSpinner } from '../components/brand/WhorlSpinner';
import { FoodPicker } from '../components/log/FoodPicker';
import { AddTrialFoodSheet } from '../components/profile/AddTrialFoodSheet';
import { useTrialAllowedSet } from '../hooks/useTrialAllowedSet';
import { usePetStore } from '../store/petStore';
import { addTrialFood, foodLabel } from '../lib/dietTrialSetup';
import { isOnTrialList, trialListFoodsOn } from '../lib/trialAllowedSet';
import {
  ADD_TRIAL_FOOD_ERROR,
  alreadyOnListNote,
  buildAddTrialFoodSheet,
  buildTrialFoodsScreen,
  noTrialLine,
} from '../lib/trialFoodsScreen';
import type { PickerFood } from '../lib/db';

export default function TrialFoodsScreen() {
  const activePet = usePetStore((s) => s.activePet);
  const petName = activePet?.name ?? 'your pet';
  const set = useTrialAllowedSet();

  // 'list' → 'picking' → 'confirming'. The picked food is held rather than
  // written on selection: FR-11's sheet is a confirm step, and a tap that wrote
  // the row and then explained what it had done would be the wrong order.
  const [picking, setPicking] = useState(false);
  const [pending, setPending] = useState<PickerFood | null>(null);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // The quiet answer to tapping a food that is already on the list. A fact, not a
  // scolding — and transient, so it never becomes a permanent line of chrome.
  const [note, setNote] = useState<string | null>(null);

  const model = buildTrialFoodsScreen(petName, set);

  // The foods already on the list, marked as selected in the picker. This is the
  // honest signal: `selectedFoodIds` is the picker's existing selection mode, and
  // "already chosen" is exactly what it means here. Matching by ID ONLY is
  // deliberate — it is what the picker can style — and the full identity check
  // below (which also catches a re-photographed bag through the brand+product key)
  // is what actually guards the write.
  const onListIds = useMemo(
    () => (set.status === 'ready' ? trialListFoodsOn(set).map((f) => f.foodItemId) : []),
    [set],
  );

  const handlePick = useCallback(
    (food: PickerFood) => {
      const label = foodLabel(food);
      if (
        isOnTrialList(set, {
          id: food.id,
          brand: food.brand,
          productName: food.product_name,
        })
      ) {
        setNote(alreadyOnListNote(label));
        return;
      }
      setNote(null);
      setPending(food);
      setPicking(false);
    },
    [set],
  );

  const handleConfirm = useCallback(async () => {
    if (set.status !== 'ready' || !pending || !activePet) return;
    setSaving(true);
    setAddError(null);
    try {
      await addTrialFood({
        trialId: set.trial.id,
        petId: activePet.id,
        food: {
          id: pending.id,
          brand: pending.brand,
          product_name: pending.product_name,
          food_type: pending.food_type,
        },
      });
      // `addTrialFood` bumps the hydration tick, so the hook re-reads and the new
      // row is in the list behind this sheet before it closes. No manual reload,
      // and no optimistic row that could outlive a failed write.
      setPending(null);
    } catch (err) {
      // Never silent: the sheet stays open, says so, and keeps its button live —
      // a sheet that closed on a failed insert would leave the owner believing a
      // food is permitted when the record says it is not.
      console.error('[trial-foods] add failed:', err);
      setAddError(ADD_TRIAL_FOOD_ERROR);
    } finally {
      setSaving(false);
    }
  }, [set, pending, activePet]);

  // ── The picker step (FR-10) ───────────────────────────────────────────────
  // `selectedFoodIds` puts the picker in SELECTION mode, which is what FR-18 keys
  // off: PR 4's pinned "On the trial list" section is suppressed here, and it
  // should be — a section listing the set would be circular on the screen that
  // edits it.
  if (picking && set.status === 'ready') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Header
          title="Add a food"
          leading="back"
          onLeadingPress={() => {
            setNote(null);
            setPicking(false);
          }}
        />
        {note !== null && (
          <Text testID="trial-foods-picker-note" style={styles.pickerNote}>
            {note}
          </Text>
        )}
        <FoodPicker
          petId={activePet?.id ?? ''}
          petName={activePet?.name}
          selectedFoodIds={onListIds}
          onPickFood={handlePick}
          // The vet-sanctioned extra is often something the library has never
          // seen, so capture stays one tap away.
          //
          // KNOWN COST, stated rather than discovered: `food-capture` ends in
          // `router.dismissAll()`, which unwinds this screen too — the owner lands
          // back on the tab with the food captured but not yet on the list, and
          // has to re-enter from the trial card to add it. It is a papercut and
          // NOT B-535's class of bug: nothing was promised and no half-written
          // state is lost, because the confirm sheet has not opened yet. Making
          // the capture flow return-aware is a change to a shared route, so it is
          // filed (B-625) rather than smuggled into this PR.
          onAddNew={() => router.push('/food-capture')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header title="Diet trial" leading="back" onLeadingPress={() => router.back()} />

      {model === null ? (
        <View style={styles.centered}>
          {set.status === 'no_trial' ? (
            <Text testID="trial-foods-no-trial" style={styles.quiet}>
              {noTrialLine(petName)}
            </Text>
          ) : (
            // R2: not an empty list. See the header note.
            <WhorlSpinner size="md" ground="day" />
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.title}>{model.title}</Text>
          {model.subtitle !== null && (
            <Text testID="trial-foods-subtitle" style={styles.subtitle}>
              {model.subtitle}
            </Text>
          )}

          {model.groups.map((group) => {
            if (group.rows.length === 0 && group.emptyState === null) return null;
            return (
              <View key={group.title} style={styles.group}>
                <SectionLabel label={group.title} style={styles.groupLabel} />
                {group.rows.length === 0 ? (
                  <Text testID="trial-foods-empty-extras" style={styles.emptyState}>
                    {group.emptyState}
                  </Text>
                ) : (
                  group.rows.map((row) => (
                    <View key={row.key} style={styles.row} testID="trial-foods-row">
                      <Text style={styles.rowLabel}>{row.label}</Text>
                      <Text style={styles.rowFact}>{row.fact}</Text>
                    </View>
                  ))
                )}
              </View>
            );
          })}

          <PrimaryButton
            testID="trial-foods-add"
            label={model.addLabel}
            onPress={() => {
              setNote(null);
              setPicking(true);
            }}
            style={styles.addButton}
          />

          {/* C6, LOCKED, this screen only. It sits under the action because it
              explains what the whole list is FOR — the itemisation the vet reads —
              rather than qualifying any one row. */}
          <Text testID="trial-foods-disclosure" style={styles.disclosure}>
            {model.disclosure}
          </Text>
        </ScrollView>
      )}

      {pending !== null && set.status === 'ready' && (
        <AddTrialFoodSheet
          model={buildAddTrialFoodSheet(petName, foodLabel(pending), set.trial)}
          saving={saving}
          error={addError}
          onConfirm={handleConfirm}
          onCancel={() => {
            if (saving) return;
            setAddError(null);
            setPending(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorNeutralLight },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.space3 },
  quiet: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    textAlign: 'center',
  },
  body: {
    paddingHorizontal: theme.space3,
    paddingBottom: theme.space4,
  },
  title: {
    fontSize: theme.textXL,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
  subtitle: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
  group: { marginTop: theme.space3 },
  groupLabel: { marginBottom: theme.space1 },
  row: {
    paddingVertical: theme.space2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colorBorder,
  },
  rowLabel: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  rowFact: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
  emptyState: {
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.45,
    color: theme.colorTextSecondary,
    paddingVertical: theme.space2,
  },
  addButton: { marginTop: theme.space3 },
  disclosure: {
    fontSize: theme.textXS,
    lineHeight: theme.textXS * 1.5,
    color: theme.colorTextTertiary,
    marginTop: theme.space2,
  },
  pickerNote: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    paddingHorizontal: theme.space3,
    paddingBottom: theme.space1,
  },
});
