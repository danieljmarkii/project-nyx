// Food detail's trial block — B-616 PR 3 (FR-13/FR-14; mock screen D).
//
// ONE SLOT, TWO STATES, AND NEVER A THIRD:
//
//   • on the list  → the dated membership fact ("On Biscuit’s trial list · since
//                    Jul 31"). No action — removal is out of v1 (D8).
//   • not on it    → the add action, landing on §2.3's confirm sheet.
//   • no trial, or a read that could not answer → NOTHING. Not an empty row, not a
//                    disabled action, not a "not on the list" line (FR-13, verbatim:
//                    for a food not on the list the row is ABSENT). R1/R2 both land
//                    on the same branch here, which is why the caller passes a
//                    nullable line and a nullable handler rather than a mode flag.
//
// The two states share one slot on purpose: mock D draws the fact where the action
// would be, and an owner reading this screen asks one question — "does this food
// belong to the trial?" — which is answered either by the fact or by the offer to
// make it true.
//
// ── WHY THIS IS NOT NEAR THE CONTAMINANT NOTE ───────────────────────────────
//
// FR-15/C2: the B-351 protein-conflict note is INDEPENDENT and may co-render with
// the add action — a protein-conflicting food can still be added, because the vet
// may have sanctioned it. Rendering the two adjacent would invite them to be read
// as one verdict ("conflicts, therefore don't add"), which is exactly the merge C2
// forbids. So this block sits at the top of the screen with the food's identity,
// and the note stays down in its protein context where it already lives.
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../../constants/theme';
import { SectionLabel } from '../ui/SectionLabel';

interface Props {
  /** `trialMembershipLine(...)` — non-null only for a food ON the list. */
  line: string | null;
  /** `addToTrialListLabel(petName)`. Rendered only when `onAdd` is given. */
  addLabel: string;
  /** Null when there is no running trial, when the set has not hydrated, or when
   *  the food is already on the list — the three cases with nothing to offer. */
  onAdd: (() => void) | null;
}

export function TrialMembershipRow({ line, addLabel, onAdd }: Props) {
  if (line === null && onAdd === null) return null;

  return (
    <View style={styles.block} testID="food-trial-membership">
      <SectionLabel label="Trial" />
      {line !== null ? (
        <Text style={styles.fact} testID="food-trial-membership-fact">
          {line}
        </Text>
      ) : (
        <TouchableOpacity
          style={styles.action}
          onPress={onAdd ?? undefined}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={addLabel}
          testID="food-trial-add"
        >
          <Text style={styles.actionText}>{addLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: theme.space1,
  },
  // A fact, in the tinted-accent ink the strip and the chip use — the same
  // register, not a status colour. Nothing here is a verdict about the food.
  fact: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
  // Mock D's ghost button, and the shape is load-bearing rather than decorative.
  // This block sits at the head of a column of labelled TEXT INPUTS above a
  // sticky Save bar, so a bare accent text link in that column reads as a field
  // value — leaving an owner unsure whether tapping it also needs a Save (it
  // does not; it opens a sheet and the sheet writes). A filled, full-width
  // control is unmistakably an action. Calm rather than loud: the subtle surface
  // fill, not the accent one — adding a vet-sanctioned extra is an ordinary act,
  // not a commitment the screen should dramatise.
  action: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: theme.radiusMedium,
    backgroundColor: theme.colorSurfaceSubtle,
    paddingHorizontal: theme.space2,
  },
  actionText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
});
