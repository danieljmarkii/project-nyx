// The shared trial-protein picker sheet — B-704 PR 4 (spec §7.2, mock frames C
// and H). Mounted by the allowed-set screen's editor row (this PR) and, when it
// lands, the start sheet (PR 3).
//
// Presentation + ONE judgement of its own: the confirm-step UI (TP-3). Every
// string comes from `lib/trialProteinPicker.ts` and the write goes through the
// caller's `onCommit` (which calls `setTrialTargetProtein`). The picker never
// writes and never derives — it lays out the model and reports the chosen value.
//
// ── THE TWO COMMIT PATHS, AND WHY THEY DIFFER (frames C vs H) ────────────────
//
// A FIRST-SET (or a derived→owner confirmation, or a change from unset) commits
// on tap and closes — it is a radio picker (frame C). A CHANGE to an existing
// OWNER-set value arms a pending selection and shows the correction confirm
// before committing (frame H) — "First-time sets skip this sheet." Re-tapping the
// value already stored is a no-op that closes (or disarms a pending change),
// never a redundant write.
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SectionLabel } from '../ui/SectionLabel';
import {
  buildProteinCorrectionConfirm,
  isProteinCorrection,
  proteinValueOf,
  type TrialProteinOption,
  type TrialProteinPickerModel,
} from '../../lib/trialProteinPicker';

interface Props {
  model: TrialProteinPickerModel;
  /** Mid-write. The confirm button (correction path) takes `PrimaryButton`'s
   *  loading state, and every option blocks, so a slow write cannot earn a second
   *  tap and two conflicting values. */
  saving?: boolean;
  /** A write that did not land — rendered in place, sheet stays open. */
  error?: string | null;
  /** The chosen value: a canonical protein key, or null for either escape hatch.
   *  The caller writes it (`setTrialTargetProtein`) and closes on success. */
  onCommit: (protein: string | null) => void;
  onCancel: () => void;
}

export function TrialProteinPickerSheet({
  model,
  saving = false,
  error = null,
  onCommit,
  onCancel,
}: Props) {
  // The armed correction (TP-3). Null on the first-set/radio path.
  const [pending, setPending] = useState<TrialProteinOption | null>(null);

  // The stored OWNER value — the only thing a change is measured against. A
  // derived or unset value is not "an existing value" (the owner never set it).
  const storedOwnerValue = model.isOwnerSet ? model.selectedId : null;
  // What the radio shows as filled: the armed pending option, else the resolved
  // value. Null leaves nothing filled (never the escape hatches — §5).
  const activeId = pending ? pending.id : model.selectedId;

  const handleSelect = (option: TrialProteinOption) => {
    if (saving) return;
    const resulting = proteinValueOf(option);
    // No-op: selecting the value already stored. Disarm a pending change if one is
    // armed; otherwise the sheet's job is done, so close.
    if (resulting === storedOwnerValue) {
      if (pending) setPending(null);
      else onCancel();
      return;
    }
    // A change to an existing owner value → arm the confirm (frame H).
    if (isProteinCorrection(model, option)) {
      setPending(option);
      return;
    }
    // First-set, or a derived→owner confirmation, or setting from unset → commit
    // straight away (frame C — no confirm).
    onCommit(resulting);
  };

  const confirm = pending ? buildProteinCorrectionConfirm(pending) : null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={saving ? undefined : onCancel}>
      <Pressable
        style={styles.scrim}
        onPress={saving ? undefined : onCancel}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <SafeAreaView edges={['bottom']} style={styles.sheetWrap}>
        <View style={styles.sheet} testID="trial-protein-sheet">
          <View style={styles.grabber} />
          <Text style={styles.title}>{model.title}</Text>
          <Text style={styles.intro}>{model.intro}</Text>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {model.groups.map((group) => (
              <View key={group.title} style={styles.group}>
                <SectionLabel label={group.title} header style={styles.groupLabel} />
                {group.options.map((option) => {
                  const selected = option.id === activeId;
                  return (
                    <Pressable
                      key={option.id}
                      testID={`trial-protein-option-${option.id}`}
                      onPress={() => handleSelect(option)}
                      disabled={saving}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, disabled: saving }}
                      accessibilityLabel={
                        option.subLabel ? `${option.label}. ${option.subLabel}` : option.label
                      }
                      style={[styles.option, selected && styles.optionSelected]}
                    >
                      <View style={[styles.radio, selected && styles.radioSelected]}>
                        {selected && <View style={styles.radioDot} />}
                      </View>
                      <View style={styles.optionText}>
                        <Text style={styles.optionLabel}>{option.label}</Text>
                        {option.subLabel !== null && (
                          <Text style={styles.optionSub}>{option.subLabel}</Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          {/* The correction confirm (TP-3, frame H) — only on a change to an
              existing owner value. It states the whole-trial effect before the
              commit; the button names the destination. */}
          {confirm !== null && (
            <View style={styles.confirmBlock} testID="trial-protein-correction">
              <Text style={styles.confirmNote}>{confirm.note}</Text>
              {error !== null && (
                <Text testID="trial-protein-error" style={styles.error}>
                  {error}
                </Text>
              )}
              <PrimaryButton
                testID="trial-protein-confirm"
                label={confirm.confirmLabel}
                onPress={() => onCommit(proteinValueOf(pending!))}
                loading={saving}
                style={styles.confirmButton}
              />
            </View>
          )}

          {/* On the first-set path there is no in-sheet button, so a failed write
              surfaces here rather than vanishing with the closing sheet. */}
          {confirm === null && error !== null && (
            <Text testID="trial-protein-error" style={styles.error}>
              {error}
            </Text>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colorScrim,
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colorSurface,
    borderTopLeftRadius: theme.radiusLarge,
    borderTopRightRadius: theme.radiusLarge,
    paddingHorizontal: theme.space3,
    paddingTop: theme.space2,
    paddingBottom: theme.space3,
    // A tall option list must scroll INSIDE the sheet, not push the confirm off
    // the bottom of the screen — cap the sheet and let `list` scroll.
    maxHeight: '85%',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colorBorderStrong,
    marginBottom: theme.space2,
  },
  title: {
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    marginBottom: theme.space1,
  },
  intro: {
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.45,
    color: theme.colorTextSecondary,
    marginBottom: theme.space2,
  },
  list: {
    flexShrink: 1,
  },
  listContent: {
    paddingBottom: theme.space1,
  },
  group: {
    marginTop: theme.space2,
  },
  groupLabel: {
    marginBottom: theme.space1,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space2,
    borderRadius: theme.radiusMedium,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    marginBottom: theme.space1,
  },
  optionSelected: {
    borderColor: theme.colorAccent,
    backgroundColor: theme.colorAccentLight,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: theme.colorBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioSelected: {
    borderColor: theme.colorAccent,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colorAccent,
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
    lineHeight: theme.textXS * 1.4,
    color: theme.colorTextSecondary,
    marginTop: theme.spaceMicro,
  },
  confirmBlock: {
    marginTop: theme.space2,
    paddingTop: theme.space2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colorBorder,
  },
  confirmNote: {
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.45,
    color: theme.colorTextPrimary,
  },
  confirmButton: {
    marginTop: theme.space2,
  },
  error: {
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.4,
    color: theme.colorTextPrimary,
    marginTop: theme.space2,
  },
});
