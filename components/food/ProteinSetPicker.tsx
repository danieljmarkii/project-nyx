// The D8 two-line protein control (B-351 Phase A, PR 3).
//
//   Line 1 — "Main protein"  : the shipped B-332 ProteinPicker, single-select,
//                              unchanged in shape. This is proteins[0].
//   Line 2 — "Also contains" : multi-select secondaries. AI-extracted secondaries
//                              land here; the owner adds and removes freely.
//
// Why two lines and not one flat multi-select (the shape an earlier draft had):
// with "first tap = main", changing WHICH protein is primary meant deselecting
// everything and re-tapping in order. Worse, the two lines are not a layout
// preference — they are the two jobs the single `primary_protein` column
// conflated (spec §2). The main is what the food is sold as, and in a trial it
// is the target protein; the secondaries are the hidden exposure that breaks
// trials — the "duck" novel-protein food that also lists chicken by-product
// meal. Separating them in the form is the same separation that keeps capture
// (sensitivity) from muddying attribution.
//
// Two rules the control enforces so no captured exposure is ever lost:
//  • AUTO-DEMOTE (§6) — picking a new main moves the OLD main into "Also
//    contains" rather than dropping it. §11 extends this to the clear case: a
//    second tap on the main chip demotes it too, leaving the main line empty
//    rather than deleting a protein the owner had recorded.
//  • NEVER IN BOTH — the current main is omitted from the "Also contains"
//    options entirely, so the two lines cannot disagree about one protein.
//
// The control is CONTROLLED and side-effect-free, inheriting ProteinPicker's
// never-null-clobber property: it emits only on a tap or a keystroke, so both
// host screens can treat "onChange fired" as the owner having touched the field
// and leave an AI-hydrated set alone otherwise.
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { SectionLabel } from '../ui/SectionLabel';
import { ChipGroupOption } from '../ui/ChipGroup';
import { MultiChipGroup } from '../ui/MultiChipGroup';
import {
  ProteinPicker,
  type ProteinChangeKind,
  type ProteinPickerHandle,
} from './ProteinPicker';
import { NormalizedProteinNote, proteinNoteFor, type ProteinRewrite } from './proteinNote';
import {
  COMMON_PROTEINS,
  canonicalizeProtein,
  normalizeExtractedProtein,
  type PickerProteins,
} from '../../lib/protein';
import { ThemedText } from '../ui/ThemedText';

// Sentinel for the secondaries' typed escape. Not a protein, never stored.
const OTHER = '__other__';

const label = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

interface Props extends PickerProteins {
  /** Emits BOTH lines together — a main change is also a demote, and the two
   *  must land in one update or the set can be observed mid-move. */
  onChange: (next: PickerProteins) => void;
}

/** See ProteinPickerHandle for why the commit is reachable imperatively. This is
 *  the same contract one level up: it returns BOTH lines, because resolving a
 *  main-line draft is also a demote and the host must not see one without the
 *  other. */
export interface ProteinSetPickerHandle {
  /** Resolve any open typed draft (either line) as blur would, returning the
   *  full resulting set. Null when nothing was pending. */
  commitPending: () => PickerProteins | null;
}

export const ProteinSetPicker = forwardRef<ProteinSetPickerHandle, Props>(
  function ProteinSetPicker({ main, alsoContains, onChange }, ref) {
  const mainKey = canonicalizeProtein(main);
  const mainPickerRef = useRef<ProteinPickerHandle>(null);

  // The last main the owner actually DESIGNATED — seeded, chip-tapped, or
  // committed — as opposed to whatever partial string the Other field holds
  // mid-word. The demote keys off THIS, never off the live prop, and that
  // distinction is the whole correctness story of this component:
  //
  //   • demote off the live prop → typing "bison" files b/bi/bis/biso as
  //     secondaries (fabricated keys straight into the correlation column);
  //   • don't demote on a typed change at all → retyping or backspacing over a
  //     seeded CUSTOM main silently drops it, and "custom" here means precisely
  //     kangaroo / bison / ostrich — the novel proteins a diet trial is built on.
  //
  // Keying off the committed value gets both: a draft never demotes anything,
  // and the real protein it is replacing is still preserved when the edit lands.
  const committedMain = useRef<string | null>(mainKey);
  const drafting = useRef(false);
  // While not drafting, the prop IS the committed value — this keeps the ref
  // honest across an external reseed (a realtime AI completion landing mid-edit).
  if (!drafting.current) committedMain.current = mainKey;

  // Typed-escape state for the secondaries line. The draft is LOCAL (unlike the
  // main line's, which is the stored value itself) because this field adds a new
  // element rather than editing an existing one — there is nothing to control it
  // with until it commits.
  const [draft, setDraft] = useState('');
  const [otherOpen, setOtherOpen] = useState(false);
  const [rewrite, setRewrite] = useState<ProteinRewrite | null>(null);
  // Derived guard, same shape as ProteinPicker's: the D9 note shows only while
  // the value it explains is still in the set, so removing that chip clears it.
  const activeRewrite = rewrite && alsoContains.includes(rewrite.saved) ? rewrite : null;

  // Options = the common set minus whatever is currently the main, plus any
  // custom keys already captured (an "Other" protein, or a demoted custom main),
  // plus the typed escape. Custom keys must be offered or they would be
  // invisible and unremovable.
  const customKeys = alsoContains.filter((p) => !COMMON_PROTEINS.includes(p));
  const options: ChipGroupOption[] = [
    ...COMMON_PROTEINS.filter((p) => p !== mainKey).map((p) => ({ value: p, label: label(p) })),
    ...customKeys.map((p) => ({ value: p, label: label(p) })),
    { value: OTHER, label: 'Other' },
  ];

  // The designation half of a main-line change: demote the outgoing main, keep
  // the incoming one out of the tail. Shared by the event path (handleMainChange)
  // and the save-boundary path (commitPending) so the two cannot drift — the
  // slice-5 lesson, where one rule with two implementations disagreed with
  // itself.
  function applyDesignation(next: string | null, base: string[]): PickerProteins {
    const nextKey = canonicalizeProtein(next);
    const outgoing = drafting.current ? committedMain.current : mainKey;
    drafting.current = false;
    committedMain.current = nextKey;

    let rest = base;
    // Auto-demote: the outgoing main keeps its exposure, at the FRONT of the
    // tail because it was the most prominent protein and the array is
    // prominence-ordered.
    if (outgoing != null && outgoing !== nextKey) {
      rest = [outgoing, ...rest.filter((p) => p !== outgoing)];
    }
    // Never in both: promoting a secondary to main takes it out of the tail.
    if (nextKey != null) rest = rest.filter((p) => p !== nextKey);
    return { main: next, alsoContains: rest };
  }

  function handleMainChange(next: string | null, kind: ProteinChangeKind) {
    // A keystroke is a draft, not a designation — replace the main in place and
    // move nothing. The demote waits for the commit that follows, which is what
    // stops every prefix of "bison" (b, bi, bis, biso) being filed as a
    // secondary and written into the correlation column as a fabricated key.
    if (kind === 'typing') {
      drafting.current = true;
      onChange({ main: next, alsoContains });
      return;
    }

    // 'select' (a chip tap, including the clear) or 'commit' (the D9-normalized
    // value, including a backspace-to-empty). Both are real designations, so the
    // protein being replaced is demoted rather than dropped.
    onChange(applyDesignation(next, alsoContains));
  }

  function toggleSecondary(value: string) {
    if (value === OTHER) {
      setOtherOpen((open) => !open);
      return;
    }
    onChange({
      main,
      alsoContains: alsoContains.includes(value)
        ? alsoContains.filter((p) => p !== value)
        : [...alsoContains, value],
    });
  }

  // D9 — the secondaries' typed escape resolves on commit (blur/submit), through
  // the same write-path normalizer the main line uses, with the same disclosure.
  //
  // Takes the base set rather than reading the props, so it can compose on top of
  // a main-line commit resolved microseconds earlier in the same save.
  function resolveDraft(base: PickerProteins): PickerProteins | null {
    const typed = draft.trim();
    if (!typed) return null;
    // Fall back to the Class-A key when the normalizer finds nothing to fold —
    // capturing a vaguer protein beats dropping the exposure (spec §2, Job 1).
    const key = normalizeExtractedProtein(typed) ?? canonicalizeProtein(typed);
    if (key == null) {
      // Not a protein at all ("meal", "fresh"). Keep the text so the owner can
      // see and fix it rather than watching it vanish on blur.
      return null;
    }
    setDraft('');
    setOtherOpen(false);
    // Already the main, or already listed — nothing to add, and adding it would
    // put one protein on both lines.
    if (key === canonicalizeProtein(base.main) || base.alsoContains.includes(key)) {
      setRewrite(null);
      return null;
    }
    setRewrite(proteinNoteFor(typed, key));
    return { main: base.main, alsoContains: [...base.alsoContains, key] };
  }

  function commitDraft() {
    const next = resolveDraft({ main, alsoContains });
    if (next) onChange(next);
  }

  // No dep array — see ProteinPicker's handle. Both lines are resolved, main
  // first, so a set with a pending draft on each lands as one update.
  useImperativeHandle(ref, () => ({
    commitPending: () => {
      const pendingMain = mainPickerRef.current?.commitPending() ?? null;
      const afterMain = pendingMain ? applyDesignation(pendingMain.value, alsoContains) : null;
      const afterSecondary = resolveDraft(afterMain ?? { main, alsoContains });
      return afterSecondary ?? afterMain;
    },
  }));

  return (
    <View style={styles.root}>
      <SectionLabel label="Main protein" />
      <ProteinPicker
        ref={mainPickerRef}
        value={main}
        onChange={handleMainChange}
        accessibilityLabel="Main protein"
      />

      <SectionLabel label="Also contains" style={styles.secondaryLabel} />
      <ThemedText style={styles.hint}>Any other proteins on the ingredient list.</ThemedText>
      <MultiChipGroup
        options={options}
        // The "Other" sentinel rides in the same wrapping row so the whole set
        // reads as one group of options; it toggles the field below rather than
        // adding a value, which toggleSecondary special-cases.
        values={otherOpen ? [...alsoContains, OTHER] : alsoContains}
        onToggle={toggleSecondary}
        accessibilityLabel="Also contains"
      />
      {otherOpen && (
        <TextInput
          style={styles.otherInput}
          value={draft}
          onChangeText={setDraft}
          onBlur={commitDraft}
          onSubmitEditing={commitDraft}
          placeholder="Name the protein"
          placeholderTextColor={theme.colorTextTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          accessibilityLabel="Other protein to add"
        />
      )}
      {activeRewrite && <NormalizedProteinNote rewrite={activeRewrite} />}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    gap: theme.space2,
  },
  secondaryLabel: {
    marginTop: theme.space2,
  },
  hint: {
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.4,
    color: theme.colorTextSecondary,
    marginTop: -theme.space1,
  },
  otherInput: {
    // A TextInput is outside ThemedText's reach (the wrapper wraps Text), so the
    // field names its face directly — otherwise a swept screen keeps SF inputs.
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    height: 48,
  },
});
