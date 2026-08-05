// B-704 §6 — the amber heads-up renders its two lines and never barks.
import { render } from '@testing-library/react-native';
import { TrialProteinMismatchNote } from './TrialProteinMismatchNote';

describe('TrialProteinMismatchNote', () => {
  it('renders the fact and the advice, and exposes both to a screen reader', () => {
    const s = render(
      <TrialProteinMismatchNote
        fact="Blue Buffalo Sensitive Stomach lists chicken as its main protein."
        advice="If Miso's trial is rabbit-only, worth checking that bag with your vet."
      />,
    );
    expect(s.getByText('Blue Buffalo Sensitive Stomach lists chicken as its main protein.')).toBeTruthy();
    expect(s.getByText("If Miso's trial is rabbit-only, worth checking that bag with your vet.")).toBeTruthy();
    // The whole fact+advice is read as one summary, so nothing is colour-only.
    expect(
      s.getByLabelText(
        "Blue Buffalo Sensitive Stomach lists chicken as its main protein. If Miso's trial is rabbit-only, worth checking that bag with your vet.",
      ),
    ).toBeTruthy();
  });
});
