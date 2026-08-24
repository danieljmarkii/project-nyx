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
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { theme } from '../constants/theme';
import { Header } from '../components/ui/Header';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { SectionLabel } from '../components/ui/SectionLabel';
import { WhorlSpinner } from '../components/brand/WhorlSpinner';
import { FoodPicker } from '../components/log/FoodPicker';
import { AddTrialFoodSheet } from '../components/profile/AddTrialFoodSheet';
import { TrialProteinPicker } from '../components/profile/TrialProteinPicker';
import { TrialProteinCorrectionSheet } from '../components/profile/TrialProteinCorrectionSheet';
import { TrialContaminantNote } from '../components/food/TrialContaminantNote';
import { useTrialAllowedSet } from '../hooks/useTrialAllowedSet';
import { useDietTrial } from '../hooks/useDietTrial';
import { usePetStore } from '../store/petStore';
import { addTrialFood, foodLabel, setTrialTargetProtein } from '../lib/dietTrialSetup';
import { isOnTrialList, trialListFoodsOn } from '../lib/trialAllowedSet';
import { trialTargetProtein } from '../lib/trialProtein';
import {
  isTrialProteinCorrection,
  midTrialInitialChoice,
  midTrialProteinRow,
  trialProteinCorrectionLabel,
  trialProteinToStore,
  TRIAL_PROTEIN_CORRECTION_NOTE,
  TRIAL_PROTEIN_ROW_LABEL,
  type TrialProteinChoice,
} from '../lib/trialProteinPicker';
import { TRIAL_EXPOSURES_TITLE } from '../lib/trialExposuresScreen';
import {
  ADD_TRIAL_FOOD_ERROR,
  alreadyOnListNote,
  buildAddTrialFoodSheet,
  buildTrialFoodsScreen,
  noTrialLine,
  trialFoodsTitle,
} from '../lib/trialFoodsScreen';
import type { PickerFood } from '../lib/db';
import { ThemedText } from '../components/ui/ThemedText';

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

  // ── B-704 §7.3 — the trial protein: the "Trial protein" row + PR 3's shared picker ─
  // PR 3 shipped the shared `TrialProteinPicker` (setup + this screen); PR 4 mounts
  // it here and INTERPOSES the correction confirm (TP-3) on a mid-trial CHANGE — the
  // host/picker split the picker's own header describes. The write is
  // `setTrialTargetProtein` (the mid-trial path PR 3's setup write does not cover).
  const [proteinPickerOpen, setProteinPickerOpen] = useState(false);
  const [choice, setChoice] = useState<TrialProteinChoice>({ kind: 'derived' });
  // A choice awaiting the correction confirm (frame H) — set only for a change to an
  // existing owner value; its presence renders the confirm sheet.
  const [pendingCorrection, setPendingCorrection] = useState<TrialProteinChoice | null>(null);
  const [savingProtein, setSavingProtein] = useState(false);
  const [proteinError, setProteinError] = useState<string | null>(null);

  // The standing mismatch note (§6.5) is the SAME note the Pet-tab card renders,
  // read through `useDietTrial` rather than re-derived here — so the two surfaces
  // can never disagree about the trial's contamination (the one-answer rule the
  // shared predicate exists for). It carries the antigen-pause disclosure the
  // card's loader wires; an opts-less re-derivation here would diverge on exactly
  // that edge.
  const { input: trialInput } = useDietTrial();

  const readyTrial = set.status === 'ready' ? set.trial : null;
  const trialId = readyTrial?.id ?? null;
  const storedProtein = readyTrial?.targetProtein ?? null;

  // The derivation source is the trial's own `primary_diet` foods, never the
  // permitted extras — the same source `trialTargetProtein` uses, so the row, the
  // picker's derived group, and the card cannot disagree.
  const primaryFoods = useMemo(
    () => (set.status === 'ready' ? set.foods.filter((f) => f.role === 'primary_diet') : []),
    [set],
  );
  const resolvedProtein = useMemo(
    () => trialTargetProtein({ target_protein: storedProtein }, primaryFoods),
    [storedProtein, primaryFoods],
  );
  // The picker's derived group + highlight key off the PURE derivation (ignoring the
  // stored value), so a derived option shows filled when nothing is owner-set.
  const derivedKey = useMemo(
    () => trialTargetProtein({ target_protein: null }, primaryFoods).protein,
    [primaryFoods],
  );
  const derivedFoods = useMemo(
    () => primaryFoods.map((f) => ({ primaryProtein: f.primaryProtein, foodLabel: f.label })),
    [primaryFoods],
  );
  const proteinRow = midTrialProteinRow(resolvedProtein);

  const openProteinPicker = useCallback(() => {
    setProteinError(null);
    setChoice(midTrialInitialChoice(resolvedProtein));
    setProteinPickerOpen(true);
  }, [resolvedProtein]);

  // Write the chosen protein (null for either escape hatch). A no-op when the store
  // would not change (re-pick, or null-over-null); otherwise `setTrialTargetProtein`.
  // A CORRECTION routes here from the confirm sheet (which shows saving/error); a
  // first-set routes here directly (no sheet), so its rare failure surfaces as an
  // Alert.
  const commitProtein = useCallback(
    async (next: TrialProteinChoice) => {
      if (!trialId) return;
      const fromCorrection = pendingCorrection !== null;
      const newStored = trialProteinToStore(next);
      setProteinPickerOpen(false);
      // No-op ONLY when re-picking the value the owner already set — gated on
      // ownership + identity, never on the write value alone: both escape hatches
      // write null and a non-owner trial's column is null too, so a value-only guard
      // would silently close an escape hatch over a derived/unset value (the BUG both
      // reviewers caught). A null commit cannot suppress a name the foods still
      // DERIVE (§5 vs §4/§7.3 — B-707); the write is honest, the residual is the
      // predicate's, not this screen's.
      const isRetapOfOwnerValue = storedProtein != null && newStored === storedProtein;
      if (isRetapOfOwnerValue) {
        setPendingCorrection(null);
        return;
      }
      setSavingProtein(true);
      setProteinError(null);
      try {
        await setTrialTargetProtein({ trialId, protein: newStored });
        // `notifyTrialChanged` bumps the hydration tick, so `useTrialAllowedSet` and
        // `useDietTrial` re-read — the row, the card and the strip show the new value.
        setPendingCorrection(null);
      } catch (err) {
        console.error('[trial-foods] set protein failed:', err);
        if (fromCorrection) {
          setProteinError(ADD_TRIAL_FOOD_ERROR); // rendered on the correction sheet
        } else {
          Alert.alert('Could not update', ADD_TRIAL_FOOD_ERROR);
        }
      } finally {
        setSavingProtein(false);
      }
    },
    [trialId, storedProtein, pendingCorrection],
  );

  const handleProteinSelect = useCallback(
    (next: TrialProteinChoice) => {
      setChoice(next);
      if (isTrialProteinCorrection(storedProtein, next)) {
        // A change to an existing owner value → confirm the whole-trial effect first
        // (frame H). The write waits for the confirm.
        setProteinPickerOpen(false);
        setPendingCorrection(next);
        return;
      }
      // First-set, a derived confirmation, or a re-pick → commit straight away
      // (frame C — no confirm).
      void commitProtein(next);
    },
    [storedProtein, commitProtein],
  );

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
          <ThemedText testID="trial-foods-picker-note" style={styles.pickerNote}>
            {note}
          </ThemedText>
        )}
        <FoodPicker
          petId={activePet?.id ?? ''}
          petName={activePet?.name}
          selectedFoodIds={onListIds}
          onPickFood={handlePick}
          // The vet-sanctioned extra is often something the library has never
          // seen, so capture stays one tap away.
          //
          // `returnTo=back` (B-625) makes the capture flow return HERE on save instead of
          // unwinding to Home: capture was PUSHED as a step of this screen's flow, not
          // presented over a tab, so the owner lands back on this picker (FoodPicker reloads on
          // focus, so the new food is in the library) rather than on Home having to re-enter the
          // trial card. The captured food is saved to the LIBRARY, not the allowed set — the
          // owner still finds it here (search is pinned) and taps it to add. Surfacing the
          // just-captured food (pin/scroll-to, or carrying it straight to the confirm sheet) is
          // a follow-up (B-692), not part of the exit fix.
          onAddNew={() => router.push('/food-capture?returnTo=back')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header title={trialFoodsTitle(petName)} leading="back" onLeadingPress={() => router.back()} />

      {model === null ? (
        <View style={styles.centered}>
          {set.status === 'no_trial' ? (
            <ThemedText testID="trial-foods-no-trial" style={styles.quiet}>
              {noTrialLine(petName)}
            </ThemedText>
          ) : (
            // R2: not an empty list. See the header note.
            <WhorlSpinner size="md" ground="day" />
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {/* The nav header carries the title (it is the words the owner tapped),
              so the body opens on the day-context subtitle rather than repeating
              it — the same pattern as the exposures screen (B-616 consistency pass:
              "Diet trial" no longer appears in both the nav bar and the subtitle). */}
          {model.subtitle !== null && (
            <ThemedText testID="trial-foods-subtitle" style={styles.subtitle}>
              {model.subtitle}
            </ThemedText>
          )}

          {/* B-704 §7.3 — the "Trial protein" row sits ABOVE the food list and is
              the ONE editor for the trial's protein. Tapping opens the shared
              picker (§7.2). It NAMES; it never permits — the food list below stays
              the sole authority on what is off-diet (§5.5 D-A), so this is not a
              second door to the room the FAB owns (§4.2 untouched). */}
          <TouchableOpacity
            testID="trial-protein-row"
            onPress={openProteinPicker}
            style={styles.proteinRow}
            accessibilityRole="button"
            accessibilityLabel={`${TRIAL_PROTEIN_ROW_LABEL}: ${proteinRow.value}. ${proteinRow.subLine}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={styles.proteinRowText}>
              <ThemedText style={styles.proteinRowLabel}>{TRIAL_PROTEIN_ROW_LABEL}</ThemedText>
              <ThemedText
                testID="trial-protein-row-value"
                style={[styles.proteinRowValue, !proteinRow.valueIsSet && styles.proteinRowValueEmpty]}
              >
                {proteinRow.value}
              </ThemedText>
              <ThemedText style={styles.proteinRowSub}>{proteinRow.subLine}</ThemedText>
            </View>
            {/* geist-ok: icon glyph, not copy — stays a raw <Text> and keeps the system face.
                These stand in for vector glyphs (the B-745 GlyphSvg migration owns them), and Geist
                carries no ✓ / ✕ / ＋ in any loaded weight, so sweeping one buys OS fallback for
                nothing. CUL-364 §7. */}
            <Text style={styles.proteinRowChevron}>›</Text>
          </TouchableOpacity>

          {model.groups.map((group) => {
            if (group.rows.length === 0 && group.emptyState === null) return null;
            return (
              <View key={group.title} style={styles.group}>
                <SectionLabel label={group.title} header style={styles.groupLabel} />
                {group.rows.length === 0 ? (
                  <ThemedText testID="trial-foods-empty-extras" style={styles.emptyState}>
                    {group.emptyState}
                  </ThemedText>
                ) : (
                  group.rows.map((row) => (
                    <View key={row.key} style={styles.row} testID="trial-foods-row">
                      <ThemedText style={styles.rowLabel}>{row.label}</ThemedText>
                      <ThemedText style={styles.rowFact}>{row.fact}</ThemedText>
                    </View>
                  ))
                )}
              </View>
            );
          })}

          {/* B-704 §6.5 — the standing mismatch note, the mid-trial home for the
              trial-contaminant tension (TG-3: trial-level, never per-feeding). It
              is the SAME note the Pet-tab card renders (read via `useDietTrial`),
              so a food on the list carrying an off-trial protein reads identically
              on both surfaces. Presence-only — its absence is never an all-clear. */}
          {trialInput?.standingNote && (
            <View style={styles.noteWrap}>
              <TrialContaminantNote
                title={trialInput.standingNote.title}
                body={trialInput.standingNote.body}
              />
            </View>
          )}

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
          <ThemedText testID="trial-foods-disclosure" style={styles.disclosure}>
            {model.disclosure}
          </ThemedText>

          {/* B-636 (PM-ruled 2026-08-04): the second door. The trial card only
              links the exposures list once an exposure has FIRED (offDiet > 0),
              but that screen's own footer promises a pre-visit artifact — "your
              vet will want this list at the recheck" — so an owner prepping for
              the recheck with a clean record had no way to reach it. Its empty
              state is designed and G2-clean (trialExposuresEmptyLine — no verdict,
              no "nothing logged" claim), so arriving with nothing on it is safe
              by construction. Quiet register: a doorway, not a call to action. */}
          <TouchableOpacity
            testID="trial-foods-exposures-door"
            onPress={() => router.push('/trial-exposures')}
            style={styles.exposuresDoor}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Outside the trial diet — the list your vet will want at the recheck"
          >
            <ThemedText style={styles.exposuresDoorText}>{TRIAL_EXPOSURES_TITLE} ›</ThemedText>
          </TouchableOpacity>
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

      {/* PR 3's shared picker (§7.2), mounted for mid-trial editing. It reports the
          owner's tap via onSelect and owns nothing else; the host decides whether a
          tap is a first-set (commit) or a change to an owner value (confirm first). */}
      {set.status === 'ready' && (
        <TrialProteinPicker
          visible={proteinPickerOpen}
          petName={petName}
          choice={choice}
          derivedKey={derivedKey}
          derivedFoods={derivedFoods}
          onSelect={handleProteinSelect}
          onClose={() => setProteinPickerOpen(false)}
        />
      )}

      {/* The correction confirm (TP-3, frame H) — interposed only on a change to an
          existing owner value. */}
      {pendingCorrection !== null && (
        <TrialProteinCorrectionSheet
          note={TRIAL_PROTEIN_CORRECTION_NOTE}
          confirmLabel={trialProteinCorrectionLabel(pendingCorrection)}
          saving={savingProtein}
          error={proteinError}
          onConfirm={() => void commitProtein(pendingCorrection)}
          onCancel={() => {
            if (savingProtein) return;
            setProteinError(null);
            setPendingCorrection(null);
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
  subtitle: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
  // B-704 — the "Trial protein" row. A tappable card above the food list, in the
  // register of the rows below it (a fact about the trial, with a way to change
  // it), not a form field. The chevron marks it as opening the picker.
  proteinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space2,
    marginTop: theme.space3,
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space2,
    borderRadius: theme.radiusMedium,
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  proteinRowText: { flex: 1 },
  proteinRowLabel: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
  },
  proteinRowValue: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    marginTop: theme.spaceMicro,
  },
  // The E1 empty register (TP-1): dimmed, so "Not set" reads as an optional
  // set-prompt rather than a filled value.
  proteinRowValueEmpty: {
    fontWeight: theme.weightRegular,
    color: theme.colorTextTertiary,
  },
  proteinRowSub: {
    fontSize: theme.textXS,
    lineHeight: theme.textXS * 1.4,
    color: theme.colorTextTertiary,
    marginTop: theme.spaceMicro,
  },
  proteinRowChevron: {
    fontSize: theme.textLG,
    color: theme.colorTextSecondary,
  },
  // §6.5 — the standing note sits below the food list it is a fact about.
  noteWrap: { marginTop: theme.space3 },
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
  // B-636's doorway — quieter than the add action above it, louder than the
  // disclosure: a navigable row, not a caption and not a second CTA.
  exposuresDoor: {
    marginTop: theme.space2,
    paddingVertical: theme.space0_5,
  },
  exposuresDoorText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    fontWeight: theme.weightMedium,
  },
  pickerNote: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    paddingHorizontal: theme.space3,
    paddingBottom: theme.space1,
  },
});
