import { useRef, useState } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Text, TouchableOpacity } from 'react-native';
import { ProteinSetPicker, type ProteinSetPickerHandle } from './ProteinSetPicker';
import {
  COMMON_PROTEINS,
  canonicalizeProtein,
  normalizeExtractedProtein,
  pickerProteinsToSet,
  pickerPrimaryProtein,
  seedPickerProteins,
  type PickerProteins,
} from '../../lib/protein';

// A stateful host, because the two lines only make sense together: an auto-demote
// is a main change AND a tail change in one emission, and testing it against a
// static prop pair would let a half-applied update pass.
function Host({
  initial,
  onEmit,
}: {
  initial: PickerProteins;
  onEmit?: (next: PickerProteins) => void;
}) {
  const [set, setSet] = useState<PickerProteins>(initial);
  return (
    <ProteinSetPicker
      main={set.main}
      alsoContains={set.alsoContains}
      onChange={(next) => {
        onEmit?.(next);
        setSet(next);
      }}
    />
  );
}

const isChecked = (el: { props: { accessibilityState?: { checked?: boolean } } }) =>
  el.props.accessibilityState?.checked === true;

describe('ProteinSetPicker (B-351 D8 two-line picker)', () => {
  it('renders both lines', () => {
    const { getByText } = render(
      <Host initial={{ main: 'duck', alsoContains: ['chicken'] }} />,
    );
    expect(getByText('Main protein')).toBeTruthy();
    expect(getByText('Also contains')).toBeTruthy();
  });

  it('does not emit on mount', () => {
    const onEmit = jest.fn();
    render(<Host initial={{ main: 'duck', alsoContains: ['chicken'] }} onEmit={onEmit} />);
    // The never-null-clobber property both host screens depend on: "onChange
    // fired" must mean "the owner touched it".
    expect(onEmit).not.toHaveBeenCalled();
  });

  it('shows the main on line 1 and the secondaries checked on line 2', () => {
    const { getByRole } = render(
      <Host initial={{ main: 'duck', alsoContains: ['chicken'] }} />,
    );
    expect(getByRole('radio', { name: 'Duck' }).props.accessibilityState.selected).toBe(true);
    expect(isChecked(getByRole('checkbox', { name: 'Chicken' }))).toBe(true);
    expect(isChecked(getByRole('checkbox', { name: 'Salmon' }))).toBe(false);
  });

  it('NEVER IN BOTH — the current main is not offered as a secondary', () => {
    const { queryByRole } = render(
      <Host initial={{ main: 'duck', alsoContains: [] }} />,
    );
    expect(queryByRole('checkbox', { name: 'Duck' })).toBeNull();
    expect(queryByRole('checkbox', { name: 'Chicken' })).not.toBeNull();
  });

  it('AUTO-DEMOTE — picking a new main moves the old one into Also contains', () => {
    const onEmit = jest.fn();
    const { getByRole } = render(
      <Host initial={{ main: 'duck', alsoContains: ['salmon'] }} onEmit={onEmit} />,
    );
    fireEvent.press(getByRole('radio', { name: 'Chicken' }));
    // Duck keeps its exposure, at the FRONT of the tail (it was most prominent).
    expect(onEmit).toHaveBeenLastCalledWith({ main: 'chicken', alsoContains: ['duck', 'salmon'] });
    expect(isChecked(getByRole('checkbox', { name: 'Duck' }))).toBe(true);
  });

  it('promoting a secondary to main takes it out of the tail', () => {
    const onEmit = jest.fn();
    const { getByRole } = render(
      <Host initial={{ main: 'duck', alsoContains: ['chicken'] }} onEmit={onEmit} />,
    );
    fireEvent.press(getByRole('radio', { name: 'Chicken' }));
    expect(onEmit).toHaveBeenLastCalledWith({ main: 'chicken', alsoContains: ['duck'] });
  });

  it('CLEARING the main demotes it too — no captured exposure is ever lost', () => {
    const onEmit = jest.fn();
    const { getByRole } = render(
      <Host initial={{ main: 'duck', alsoContains: ['chicken'] }} onEmit={onEmit} />,
    );
    // A second tap on the active main chip clears it (protein stays optional).
    fireEvent.press(getByRole('radio', { name: 'Duck' }));
    expect(onEmit).toHaveBeenLastCalledWith({ main: null, alsoContains: ['duck', 'chicken'] });
    expect(isChecked(getByRole('checkbox', { name: 'Duck' }))).toBe(true);
  });

  it('demotes a raw legacy main as its canonical key, not verbatim', () => {
    const onEmit = jest.fn();
    const { getByRole } = render(
      <Host initial={{ main: 'Chicken By-Product Meal', alsoContains: [] }} onEmit={onEmit} />,
    );
    fireEvent.press(getByRole('radio', { name: 'Duck' }));
    expect(onEmit).toHaveBeenLastCalledWith({ main: 'duck', alsoContains: ['chicken'] });
  });

  it('toggles a secondary on and off', () => {
    const onEmit = jest.fn();
    const { getByRole } = render(
      <Host initial={{ main: 'duck', alsoContains: [] }} onEmit={onEmit} />,
    );
    fireEvent.press(getByRole('checkbox', { name: 'Salmon' }));
    expect(onEmit).toHaveBeenLastCalledWith({ main: 'duck', alsoContains: ['salmon'] });
    fireEvent.press(getByRole('checkbox', { name: 'Salmon' }));
    expect(onEmit).toHaveBeenLastCalledWith({ main: 'duck', alsoContains: [] });
  });

  it('offers a captured custom protein as a removable chip', () => {
    // A custom key must be visible on the line or it would be unremovable —
    // and invisible captured exposure is the failure mode this spec exists for.
    const onEmit = jest.fn();
    const { getByRole } = render(
      <Host initial={{ main: 'duck', alsoContains: ['kangaroo'] }} onEmit={onEmit} />,
    );
    expect(isChecked(getByRole('checkbox', { name: 'Kangaroo' }))).toBe(true);
    fireEvent.press(getByRole('checkbox', { name: 'Kangaroo' }));
    expect(onEmit).toHaveBeenLastCalledWith({ main: 'duck', alsoContains: [] });
  });

  // ── D9 on the secondaries' typed escape ─────────────────────────────────────

  it('adds a typed secondary on commit, normalized, with the rewrite disclosed', () => {
    const onEmit = jest.fn();
    const { getByRole, getByText, getByPlaceholderText } = render(
      <Host initial={{ main: 'duck', alsoContains: [] }} onEmit={onEmit} />,
    );
    fireEvent.press(getByRole('checkbox', { name: 'Other' }));
    fireEvent.changeText(getByPlaceholderText('Name the protein'), 'Buffalo');
    expect(onEmit).not.toHaveBeenCalled(); // never per keystroke
    fireEvent(getByPlaceholderText('Name the protein'), 'blur');
    expect(onEmit).toHaveBeenLastCalledWith({ main: 'duck', alsoContains: ['bison'] });
    expect(getByText("Saved as Bison — that's the label name for buffalo.")).toBeTruthy();
    expect(isChecked(getByRole('checkbox', { name: 'Bison' }))).toBe(true);
  });

  it('clears the note when the value it explains is removed', () => {
    const { getByRole, queryByText, getByPlaceholderText } = render(
      <Host initial={{ main: 'duck', alsoContains: [] }} />,
    );
    fireEvent.press(getByRole('checkbox', { name: 'Other' }));
    fireEvent.changeText(getByPlaceholderText('Name the protein'), 'buffalo');
    fireEvent(getByPlaceholderText('Name the protein'), 'blur');
    expect(queryByText(/^Saved as/)).not.toBeNull();
    fireEvent.press(getByRole('checkbox', { name: 'Bison' }));
    expect(queryByText(/^Saved as/)).toBeNull();
  });

  it('does not add a typed value that is already the main', () => {
    const onEmit = jest.fn();
    const { getByRole, getByPlaceholderText } = render(
      <Host initial={{ main: 'duck', alsoContains: [] }} onEmit={onEmit} />,
    );
    fireEvent.press(getByRole('checkbox', { name: 'Other' }));
    fireEvent.changeText(getByPlaceholderText('Name the protein'), 'Duck');
    fireEvent(getByPlaceholderText('Name the protein'), 'blur');
    expect(onEmit).not.toHaveBeenCalled();
  });

  it('keeps a value the normalizer cannot use in the field rather than dropping it', () => {
    const onEmit = jest.fn();
    const { getByRole, getByPlaceholderText } = render(
      <Host initial={{ main: 'duck', alsoContains: [] }} onEmit={onEmit} />,
    );
    fireEvent.press(getByRole('checkbox', { name: 'Other' }));
    fireEvent.changeText(getByPlaceholderText('Name the protein'), 'meal');
    fireEvent(getByPlaceholderText('Name the protein'), 'blur');
    expect(onEmit).not.toHaveBeenCalled();
    expect(getByPlaceholderText('Name the protein').props.value).toBe('meal');
  });

  it('captures an unrecognised protein verbatim rather than dropping the exposure', () => {
    // Job 1 (§2) is capture. An exotic species the alias table has never heard of
    // must still land as a key — vaguer beats absent.
    const onEmit = jest.fn();
    const { getByRole, getByPlaceholderText } = render(
      <Host initial={{ main: 'duck', alsoContains: [] }} onEmit={onEmit} />,
    );
    fireEvent.press(getByRole('checkbox', { name: 'Other' }));
    fireEvent.changeText(getByPlaceholderText('Name the protein'), 'Emu');
    fireEvent(getByPlaceholderText('Name the protein'), 'blur');
    expect(onEmit).toHaveBeenLastCalledWith({ main: 'duck', alsoContains: ['emu'] });
  });

  // ── Regression: the three defects the adversarial pass found (2026-07-25) ────
  // All three are the same shape — a rule that is correct for a DISCRETE
  // interaction, applied to a CONTINUOUS one, or to a value the owner never
  // authored. None were caught by the original suite because it tested chip taps
  // through this component and typing only through a bare ProteinPicker host.

  it('typing into the MAIN Other field does not file every prefix as a secondary', () => {
    // THE BAD ONE. onChange fires per keystroke, and auto-demote treated each
    // emission as a new designation: typing "bison" wrote
    // proteins = ["bison","biso","bis","bi","b","chicken"] — five junk keys into
    // the column the correlation engine, Patterns and the vet report all read.
    let last: PickerProteins = { main: 'chicken', alsoContains: [] };
    const { getByRole, getByPlaceholderText } = render(
      <Host initial={last} onEmit={(n) => { last = n; }} />,
    );
    fireEvent.press(getByRole('radio', { name: 'Other' }));
    const field = getByPlaceholderText('Name the protein');
    for (const t of ['b', 'bi', 'bis', 'biso', 'bison']) fireEvent.changeText(field, t);
    fireEvent(field, 'blur');
    expect(last).toEqual({ main: 'bison', alsoContains: ['chicken'] });
    expect(pickerProteinsToSet(last.main, last.alsoContains)).toEqual(['bison', 'chicken']);
  });

  it('a commit replaces the draft it grew out of, never demotes it', () => {
    let last: PickerProteins = { main: null, alsoContains: ['duck'] };
    const { getByRole, getByPlaceholderText } = render(
      <Host initial={last} onEmit={(n) => { last = n; }} />,
    );
    fireEvent.press(getByRole('radio', { name: 'Other' }));
    const field = getByPlaceholderText('Name the protein');
    fireEvent.changeText(field, 'chicken liver');
    fireEvent(field, 'blur');
    // "chicken liver" must not survive as a secondary alongside its own fold.
    expect(last).toEqual({ main: 'chicken', alsoContains: ['duck'] });
  });

  it('blurring a seeded custom main WITHOUT typing never re-keys it', () => {
    // D3a: `ocean whitefish` (3 live rows) is a CLASS-B merge. D9's warrant is
    // that the owner is looking at a value they just typed — merely tapping
    // through the screen is not that warrant, and rewriting it here would be the
    // retroactive re-key the whole Class-A/Class-B split exists to prevent.
    const onEmit = jest.fn();
    const { getByPlaceholderText } = render(
      <Host initial={{ main: 'ocean whitefish', alsoContains: ['chicken'] }} onEmit={onEmit} />,
    );
    const field = getByPlaceholderText('Name the protein');
    fireEvent(field, 'focus');
    fireEvent(field, 'blur');
    expect(onEmit).not.toHaveBeenCalled();
    expect(field.props.value).toBe('ocean whitefish');
  });

  it('clearing the main SURVIVES a save/reopen round trip', () => {
    // The demote puts the old main at proteins[0], so writing primary_protein =
    // proteins[0] republished the designation the owner had just cleared — and
    // the reseed put it straight back on the main line. The clear silently undid
    // itself. pickerPrimaryProtein writes NULL for a cleared main instead.
    let last: PickerProteins = { main: 'duck', alsoContains: ['chicken'] };
    const { getByRole } = render(
      <Host initial={last} onEmit={(n) => { last = n; }} />,
    );
    fireEvent.press(getByRole('radio', { name: 'Duck' }));
    expect(last).toEqual({ main: null, alsoContains: ['duck', 'chicken'] });

    const set = pickerProteinsToSet(last.main, last.alsoContains);
    const primary = pickerPrimaryProtein(last.main);
    expect(primary).toBeNull();          // no main designated
    expect(set).toEqual(['duck', 'chicken']); // …and no exposure lost
    expect(seedPickerProteins(primary, set)).toEqual({
      main: null,
      alsoContains: ['duck', 'chicken'],
    });
  });

  // Round 2 of the adversarial pass: the kind-gated demote fixed the junk-key
  // bug but declined to demote ANY typed change — and the value it was then
  // dropping is a committed protein, not a draft. "Custom main" here means
  // precisely kangaroo / bison / ostrich: the novel proteins a diet trial is
  // built on, i.e. the wedge's own data.

  it('retyping over a seeded CUSTOM main demotes it rather than dropping it', () => {
    let last: PickerProteins = { main: 'kangaroo', alsoContains: ['chicken'] };
    const { getByPlaceholderText } = render(
      <Host initial={last} onEmit={(n) => { last = n; }} />,
    );
    const field = getByPlaceholderText('Name the protein');
    fireEvent.changeText(field, 'emu');
    fireEvent(field, 'blur');
    expect(last).toEqual({ main: 'emu', alsoContains: ['kangaroo', 'chicken'] });
    expect(pickerProteinsToSet(last.main, last.alsoContains))
      .toEqual(['emu', 'kangaroo', 'chicken']);
  });

  it('backspacing the main to empty demotes it, exactly like a chip clear', () => {
    // §11's demote-on-clear rule, holding on the other half of the same
    // affordance: chip-clear and text-clear must not disagree.
    let last: PickerProteins = { main: 'kangaroo', alsoContains: ['chicken'] };
    const { getByPlaceholderText } = render(
      <Host initial={last} onEmit={(n) => { last = n; }} />,
    );
    const field = getByPlaceholderText('Name the protein');
    fireEvent.changeText(field, '');
    fireEvent(field, 'blur');
    expect(last).toEqual({ main: null, alsoContains: ['kangaroo', 'chicken'] });
    expect(pickerPrimaryProtein(last.main)).toBeNull();
  });

  it('still files no partial word when retyping over a custom main', () => {
    // The two fixes must not undo each other: demote the committed value, and
    // ONLY the committed value.
    let last: PickerProteins = { main: 'kangaroo', alsoContains: [] };
    const { getByPlaceholderText } = render(
      <Host initial={last} onEmit={(n) => { last = n; }} />,
    );
    const field = getByPlaceholderText('Name the protein');
    for (const t of ['e', 'em', 'emu']) fireEvent.changeText(field, t);
    fireEvent(field, 'blur');
    expect(last).toEqual({ main: 'emu', alsoContains: ['kangaroo'] });
  });

  // ── The property test (B-414's lesson, applied here) ────────────────────────
  // Every defect above passed a green example suite. The reason is the same one
  // that let B-414 ship: examples cover the shapes you thought of, and all three
  // bugs lived at the seam between two components neither file's examples cross.
  //
  // THE INVARIANT: after any sequence of picker interactions, every persisted
  // key is either a chip value, a value the owner committed, or a value that was
  // in the seeded set. Nothing may be INVENTED — a fabricated key is not merely
  // wrong, it reaches the correlation engine, the Patterns ranking, the vet
  // report and the §8 contaminant check as a protein this pet was exposed to.
  it('PROPERTY: no interaction sequence can invent a protein key', () => {
    const SEEDS: PickerProteins[] = [
      { main: 'chicken', alsoContains: [] },
      { main: 'kangaroo', alsoContains: ['chicken'] },
      { main: null, alsoContains: ['duck'] },
      { main: 'Chicken By-Product Meal', alsoContains: ['salmon'] },
    ];
    const WORDS = ['bison', 'emu', 'buffalo', 'chicken liver', ''];

    for (const seed of SEEDS) {
      for (const word of WORDS) {
        for (const viaChip of [true, false]) {
          let last: PickerProteins = seed;
          const { getByRole, queryByPlaceholderText, unmount } = render(
            <Host initial={seed} onEmit={(n) => { last = n; }} />,
          );
          if (viaChip) fireEvent.press(getByRole('radio', { name: 'Other' }));
          const field = queryByPlaceholderText('Name the protein');
          if (field) {
            // Keystroke by keystroke — the emitter is continuous, and that is
            // exactly where the fabricated keys came from.
            for (let i = 1; i <= word.length; i++) fireEvent.changeText(field, word.slice(0, i));
            if (word === '') fireEvent.changeText(field, '');
            fireEvent(field, 'blur');
          }

          const persisted = pickerProteinsToSet(last.main, last.alsoContains);
          const committed = normalizeExtractedProtein(word);
          const allowed = new Set<string>([
            ...COMMON_PROTEINS,
            ...pickerProteinsToSet(seed.main, seed.alsoContains),
            ...(committed ? [committed] : []),
            ...(canonicalizeProtein(word) ? [canonicalizeProtein(word) as string] : []),
          ]);
          for (const key of persisted) {
            if (!allowed.has(key)) {
              throw new Error(
                `INVENTED protein key ${JSON.stringify(key)} from seed ` +
                `${JSON.stringify(seed)} + typing ${JSON.stringify(word)} ` +
                `(viaChip=${viaChip}) → persisted ${JSON.stringify(persisted)}`,
              );
            }
          }
          unmount();
        }
      }
    }
  });

  it('PROPERTY: a no-op interaction is a fixpoint through save and reseed', () => {
    const SEEDS: PickerProteins[] = [
      { main: 'chicken', alsoContains: ['duck', 'salmon'] },
      { main: null, alsoContains: ['duck'] },
      { main: 'kangaroo', alsoContains: [] },
      { main: null, alsoContains: [] },
    ];
    for (const seed of SEEDS) {
      const set = pickerProteinsToSet(seed.main, seed.alsoContains);
      const primary = pickerPrimaryProtein(seed.main);
      const reseeded = seedPickerProteins(primary, set);
      // Idempotent: persisting an untouched picker and reading it back must land
      // on the same two lines, or an owner who opens a food and saves it
      // unchanged would see it quietly rearrange itself.
      expect(pickerProteinsToSet(reseeded.main, reseeded.alsoContains)).toEqual(set);
      expect(pickerPrimaryProtein(reseeded.main)).toEqual(primary);
    }
  });
});

// A host shaped like the REAL ones: the form sits in a ScrollView with
// keyboardShouldPersistTaps="handled", so tapping Save does not blur the Other
// field — the save handler must ask the picker to resolve the draft itself.
// The whole class of bug below is invisible to any test that calls blur first,
// which is why every pre-existing test in this file passed while a real phone
// saved `buffalo` and dropped the protein it replaced.
function SaveHost({
  initial,
  onSave,
}: {
  initial: PickerProteins;
  onSave: (saved: PickerProteins) => void;
}) {
  const [set, setSet] = useState<PickerProteins>(initial);
  const ref = useRef<ProteinSetPickerHandle>(null);
  return (
    <>
      <ProteinSetPicker
        ref={ref}
        main={set.main}
        alsoContains={set.alsoContains}
        onChange={setSet}
      />
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => {
          const pending = ref.current?.commitPending() ?? null;
          if (pending) setSet(pending);
          onSave(pending ?? set);
        }}
      >
        <Text>Save</Text>
      </TouchableOpacity>
    </>
  );
}

describe('ProteinSetPicker — saving without a blur (the keyboardShouldPersistTaps trap)', () => {
  it('normalizes a typed MAIN protein on Save even though the field never blurred', () => {
    const onSave = jest.fn();
    const { getByRole, getByPlaceholderText } = render(
      <SaveHost initial={{ main: null, alsoContains: [] }} onSave={onSave} />,
    );
    fireEvent.press(getByRole('radio', { name: 'Other' }));
    fireEvent.changeText(getByPlaceholderText('Name the protein'), 'buffalo');
    // No blur — straight to Save, exactly as a thumb does it.
    fireEvent.press(getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ main: 'bison', alsoContains: [] });
  });

  it('demotes the outgoing main on Save rather than dropping it', () => {
    // The worse half of the same bug: 'typing' replaces the main in place and
    // defers the demote to the commit. No commit, no demote — chicken was gone.
    const onSave = jest.fn();
    const { getByRole, getByPlaceholderText } = render(
      <SaveHost initial={{ main: 'chicken', alsoContains: ['duck'] }} onSave={onSave} />,
    );
    fireEvent.press(getByRole('radio', { name: 'Other' }));
    fireEvent.changeText(getByPlaceholderText('Name the protein'), 'buffalo');
    fireEvent.press(getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ main: 'bison', alsoContains: ['chicken', 'duck'] });
  });

  it('resolves a pending SECONDARY draft on Save', () => {
    const onSave = jest.fn();
    const { getByRole, getByPlaceholderText } = render(
      <SaveHost initial={{ main: 'duck', alsoContains: [] }} onSave={onSave} />,
    );
    // The secondaries' own "Other" is the checkbox one; the main line's is a radio.
    fireEvent.press(getByRole('checkbox', { name: 'Other' }));
    fireEvent.changeText(getByPlaceholderText('Name the protein'), 'deer');
    fireEvent.press(getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ main: 'duck', alsoContains: ['venison'] });
  });

  it('Save does NOT re-key a seeded custom main the owner never typed (D3a)', () => {
    // The imperative path must inherit the no-warrant rule, not bypass it: this
    // is the retroactive Class-B merge the whole split exists to forbid.
    const onSave = jest.fn();
    const { getByRole } = render(
      <SaveHost initial={{ main: 'ocean whitefish', alsoContains: ['chicken'] }} onSave={onSave} />,
    );
    fireEvent.press(getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ main: 'ocean whitefish', alsoContains: ['chicken'] });
  });

  it('Save leaves an unusable typed value alone rather than wiping it', () => {
    const onSave = jest.fn();
    const { getByRole, getByPlaceholderText } = render(
      <SaveHost initial={{ main: null, alsoContains: [] }} onSave={onSave} />,
    );
    fireEvent.press(getByRole('radio', { name: 'Other' }));
    fireEvent.changeText(getByPlaceholderText('Name the protein'), 'fresh');
    fireEvent.press(getByRole('button', { name: 'Save' }));
    // Nothing to commit, so the raw text is what saves — never an empty field.
    expect(onSave).toHaveBeenCalledWith({ main: 'fresh', alsoContains: [] });
  });
});
