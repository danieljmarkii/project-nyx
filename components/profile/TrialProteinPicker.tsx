// The shared trial-protein picker sheet — B-704 PR 3 (§7.2, mock frame C).
//
// ONE component, mounted by the start sheet (this PR) and the mid-trial allowed-set
// screen (PR 4). It renders the grouped option list — derived-from-the-trial-diet
// first (with provenance), the common proteins, then the two escape hatches as
// FIRST-CLASS options — and reports the owner's tap through `onSelect`. It stores
// nothing and closes nothing: the HOST owns the choice and the dismissal, which is
// what lets PR 4 interpose the correction-confirm (frame H) on a mid-trial CHANGE
// without this component knowing anything about it.
//
// THE INVARIANT IN OWNER LANGUAGE. The intro line carries the §5.5 loophole guard
// out loud — "it never changes what counts as off-diet" — so an owner cannot launder
// a chicken treat into the trial by editing this field, and the copy tells them so
// before they try (TG-1).
//
// Every offered value is a canonical protein key already (COMMON_PROTEINS + the
// derivation, both keyed through canonicalizeProtein), so there is NO free-text
// entry here and no way for a raw label to reach the column (TG-4) — the picker is a
// closed set by construction, which is also why the B-705 typed-"Other" sanitisation
// concern does not arise: there is no typed "Other".
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '../ui/ThemedText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { canonicalizeProtein } from '../../lib/protein';
import {
  buildDerivedProteinOptions,
  commonProteinOptions,
  derivedGroupHeader,
  unsetOption,
  ESCAPE_GROUP_HEADER,
  HYDROLYZED_OPTION,
  OTHER_PROTEINS_GROUP_HEADER,
  TRIAL_PROTEIN_PICKER_INTRO,
  type DerivedProteinFood,
  type TrialProteinChoice,
  type TrialProteinOption,
} from '../../lib/trialProteinPicker';

interface Props {
  visible: boolean;
  petName: string;
  /** The current choice — drives which radio is filled. */
  choice: TrialProteinChoice;
  /** The derivation result (`trialTargetProtein(...).protein`), so a `derived`
   *  choice highlights the right derived option — one derivation, shared with the
   *  host's row prefill. */
  derivedKey: string | null;
  /** The picked primary foods, for the derived group + its provenance sub-labels. */
  derivedFoods: readonly DerivedProteinFood[];
  /** Fired when the owner taps any option. The host applies the choice (and, at
   *  setup, closes the sheet). */
  onSelect: (choice: TrialProteinChoice) => void;
  onClose: () => void;
}

export function TrialProteinPicker({
  visible, petName, choice, derivedKey, derivedFoods, onSelect, onClose,
}: Props) {
  // Unmount when closed rather than leaving a hidden Modal mounted: this is a
  // nested sheet over another sheet, and keeping its option list in the tree while
  // invisible is both wasteful and a source of ambiguous matches for a caller's
  // tests. The slide-in animation still plays on open.
  if (!visible) return null;

  const derivedOptions = buildDerivedProteinOptions(derivedFoods);
  const commonOptions = commonProteinOptions(derivedOptions.map((o) => o.key));
  const unset = unsetOption(petName);

  // A protein option is selected iff the owner picked it, OR the choice is still
  // `derived` and this is the derived key (so the prefilled value shows filled).
  const proteinSelected = (key: string): boolean =>
    choice.kind === 'protein'
      ? canonicalizeProtein(choice.key) === key
      : choice.kind === 'derived'
        ? derivedKey === key
        : false;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <ThemedText style={styles.backText}>Back</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Trial protein</ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <ThemedText style={styles.intro}>{TRIAL_PROTEIN_PICKER_INTRO}</ThemedText>

          {derivedOptions.length > 0 && (
            <>
              <ThemedText style={styles.groupHeader}>{derivedGroupHeader(petName)}</ThemedText>
              {derivedOptions.map((opt) => (
                <OptionRow
                  key={opt.key}
                  option={opt}
                  selected={proteinSelected(opt.key)}
                  onPress={() => onSelect({ kind: 'protein', key: opt.key })}
                />
              ))}
            </>
          )}

          <ThemedText style={styles.groupHeader}>{OTHER_PROTEINS_GROUP_HEADER}</ThemedText>
          {commonOptions.map((opt) => (
            <OptionRow
              key={opt.key}
              option={opt}
              selected={proteinSelected(opt.key)}
              onPress={() => onSelect({ kind: 'protein', key: opt.key })}
            />
          ))}

          <ThemedText style={styles.groupHeader}>{ESCAPE_GROUP_HEADER}</ThemedText>
          <OptionRow
            option={{ key: '__hydrolyzed__', label: HYDROLYZED_OPTION.label, subLabel: HYDROLYZED_OPTION.subLabel }}
            selected={choice.kind === 'hydrolyzed'}
            onPress={() => onSelect({ kind: 'hydrolyzed' })}
          />
          <OptionRow
            option={{ key: '__unset__', label: unset.label, subLabel: unset.subLabel }}
            selected={choice.kind === 'unset'}
            onPress={() => onSelect({ kind: 'unset' })}
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function OptionRow({
  option, selected, onPress,
}: {
  option: TrialProteinOption;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.optionRow, selected && styles.optionRowOn]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={option.subLabel ? `${option.label}. ${option.subLabel}` : option.label}
    >
      <View style={[styles.radio, selected && styles.radioOn]} />
      <View style={styles.optionText}>
        <ThemedText style={styles.optionLabel}>{option.label}</ThemedText>
        {option.subLabel ? <ThemedText style={styles.optionSub}>{option.subLabel}</ThemedText> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorSurface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space3,
    paddingVertical: theme.space2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  headerTitle: {
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
  headerSpacer: {
    width: 56,
  },
  backText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
  body: {
    padding: theme.space3,
    paddingBottom: theme.space6,
    gap: theme.space1,
  },
  intro: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextSecondary,
    marginBottom: theme.space1,
  },
  groupHeader: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWidest,
    marginTop: theme.space2,
    marginBottom: 4,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    minHeight: 52,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space1,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorNeutralLight,
  },
  optionRowOn: {
    borderColor: theme.colorAccent,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: theme.radiusFull,
    borderWidth: 2,
    borderColor: theme.colorBorderStrong,
    flexShrink: 0,
  },
  radioOn: {
    borderColor: theme.colorAccent,
    borderWidth: 6,
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  optionSub: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: theme.spaceMicro,
  },
});
